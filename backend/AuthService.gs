/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: AuthService.gs
 * Description: Authentication & Authorization via Users sheet (Email + Password Hash + PIN Hash + Session Token).
 * Strictly enforces server-side user resolution — never trusts client-supplied user_id.
 */

/**
 * Sanitizes user record before returning to client.
 */
function sanitizeUser(userRow) {
  return {
    user_id: userRow.user_id,
    email: userRow.email,
    full_name: userRow.full_name,
    base_currency: userRow.base_currency || APP_CONFIG.DEFAULT_CURRENCY,
    timezone: userRow.timezone || APP_CONFIG.DEFAULT_TIMEZONE,
    role: userRow.role || 'user',
    status: userRow.status || 'active',
    has_pin: Boolean(userRow.pin_hash),
    created_at: userRow.created_at,
    updated_at: userRow.updated_at
  };
}

/**
 * Validates session_token from client request and resolves the authenticated user object.
 */
function authenticateRequest(payload) {
  const token = optionalString(payload && payload.session_token, 256);
  if (!token) {
    throw createAppError('UNAUTHORIZED', 'กรุณาเข้าสู่ระบบก่อนใช้งาน (Missing session token)', 401);
  }

  const users = readSheetObjects(SHEET_NAMES.USERS);
  const now = new Date();

  for (let i = 0; i < users.length; i++) {
    const u = users[i];
    if (!u.session_token_hash || !u.salt) continue;
    const expectedHash = computeHash(token, u.salt);
    if (expectedHash === u.session_token_hash) {
      if (u.status !== 'active') {
        throw createAppError('ACCOUNT_LOCKED', 'บัญชีผู้ใช้นี้ถูกระงับหรือถูกล็อกชั่วคราว', 403);
      }
      if (u.session_expires_at) {
        const exp = new Date(u.session_expires_at);
        if (exp.getTime() < now.getTime()) {
          throw createAppError('SESSION_EXPIRED', 'เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
        }
      }
      return u;
    }
  }

  throw createAppError('UNAUTHORIZED', 'เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่', 401);
}

/**
 * Registers a new user in the Users sheet.
 */
function handleAuthRegister(ctx, params) {
  return withWriteLock(function() {
    const email = requireString(params.email, 'อีเมล (email)', 120).toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      throw createAppError('VALIDATION_ERROR', 'รูปแบบอีเมลไม่ถูกต้อง', 400);
    }

    const password = requireString(params.password, 'รหัสผ่าน (password)', 128);
    if (password.length < 6) {
      throw createAppError('VALIDATION_ERROR', 'รหัสผ่านต้องมีความยาวอย่างน้อย 6 ตัวอักษร', 400);
    }

    const pin = optionalString(params.pin, 6);
    if (pin && !/^\d{6}$/.test(pin)) {
      throw createAppError('VALIDATION_ERROR', 'รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น', 400);
    }

    const fullName = requireString(params.full_name, 'ชื่อ-นามสกุล (full_name)', 100);
    const baseCurrency = optionalString(params.base_currency, 10) || APP_CONFIG.DEFAULT_CURRENCY;
    const timezone = optionalString(params.timezone, 50) || APP_CONFIG.DEFAULT_TIMEZONE;

    const users = readSheetObjects(SHEET_NAMES.USERS);
    for (let i = 0; i < users.length; i++) {
      if (String(users[i].email || '').toLowerCase() === email) {
        throw createAppError('DUPLICATE_EMAIL', 'อีเมลนี้ถูกใช้งานในระบบแล้ว', 409);
      }
    }

    const now = nowIso();
    const userId = generateId('usr');
    const salt = Utilities.getUuid().replace(/-/g, '');
    const passwordHash = computeHash(password, salt);
    const pinHash = pin ? computeHash(pin, salt) : '';

    const rawToken = 'tok_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const tokenHash = computeHash(rawToken, salt);
    const expiresAt = new Date(Date.now() + APP_CONFIG.SESSION_TTL_HOURS * 3600 * 1000).toISOString();

    const newUser = {
      user_id: userId,
      email: email,
      password_hash: passwordHash,
      pin_hash: pinHash,
      salt: salt,
      full_name: fullName,
      base_currency: baseCurrency,
      timezone: timezone,
      role: 'user',
      status: 'active',
      failed_attempts: 0,
      locked_until: '',
      session_token_hash: tokenHash,
      session_expires_at: expiresAt,
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.USERS, newUser);

    // Create default user settings
    appendSheetObject(SHEET_NAMES.SETTINGS, {
      setting_id: generateId('set'),
      user_id: userId,
      setting_key: 'preferences',
      setting_value: JSON.stringify({
        theme: 'light',
        base_currency: baseCurrency,
        timezone: timezone,
        exchange_rates: { THB: 1, USD: 34.5, EUR: 37.2, JPY: 0.23, GBP: 44.0 }
      }),
      updated_at: now
    });

    ctx.user = newUser;
    writeAuditLog(ctx, 'auth.register', 'Users', userId, 'ลงทะเบียนผู้ใช้ใหม่: ' + email, { email: email, base_currency: baseCurrency });

    return {
      user: sanitizeUser(newUser),
      session_token: rawToken,
      expires_at: expiresAt
    };
  });
}

/**
 * Authenticates a user using Email + Password OR Email + 6-digit PIN.
 */
function handleAuthLogin(ctx, params) {
  return withWriteLock(function() {
    const email = requireString(params.email, 'อีเมล (email)', 120).toLowerCase();
    const loginMode = optionalString(params.auth_mode, 20) || 'password'; // 'password' or 'pin'
    const credential = requireString(
      loginMode === 'pin' ? params.pin : params.password,
      loginMode === 'pin' ? 'รหัส PIN' : 'รหัสผ่าน',
      128
    );

    const users = readSheetObjects(SHEET_NAMES.USERS);
    let userRow = null;
    for (let i = 0; i < users.length; i++) {
      if (String(users[i].email || '').toLowerCase() === email) {
        userRow = users[i];
        break;
      }
    }

    if (!userRow) {
      throw createAppError('INVALID_CREDENTIALS', 'อีเมลหรือรหัสผ่านไม่ถูกต้อง', 401);
    }

    const now = new Date();
    // Check temporary lockout
    if (userRow.locked_until) {
      const lockTime = new Date(userRow.locked_until);
      if (lockTime.getTime() > now.getTime()) {
        const waitMin = Math.ceil((lockTime.getTime() - now.getTime()) / 60000);
        throw createAppError('ACCOUNT_LOCKED', 'บัญชีถูกล็อกชั่วคราวเนื่องจากใส่รหัสผิดเกินกำหนด กรุณารออีก ' + waitMin + ' นาที', 403);
      }
    }

    if (userRow.status === 'suspended') {
      throw createAppError('ACCOUNT_SUSPENDED', 'บัญชีนี้ถูกระงับการใช้งาน', 403);
    }

    const incomingHash = computeHash(credential, userRow.salt);
    let isValid = false;

    if (loginMode === 'pin') {
      if (!userRow.pin_hash) {
        throw createAppError('PIN_NOT_SET', 'บัญชีนี้ยังไม่ได้ตั้งค่ารหัส PIN กรุณาเข้าสู่ระบบด้วยรหัสผ่าน', 400);
      }
      isValid = (incomingHash === userRow.pin_hash);
    } else {
      isValid = (incomingHash === userRow.password_hash);
    }

    if (!isValid) {
      const attempts = Number(userRow.failed_attempts || 0) + 1;
      userRow.failed_attempts = attempts;
      if (attempts >= APP_CONFIG.MAX_LOGIN_ATTEMPTS) {
        userRow.locked_until = new Date(now.getTime() + APP_CONFIG.LOCKOUT_MINUTES * 60000).toISOString();
      }
      userRow.updated_at = now.toISOString();
      updateSheetRowByIndex(SHEET_NAMES.USERS, userRow._rowIndex, userRow);
      throw createAppError('INVALID_CREDENTIALS', 'อีเมลหรือรหัสยืนยันตัวตนไม่ถูกต้อง (ผิดครั้งที่ ' + attempts + '/' + APP_CONFIG.MAX_LOGIN_ATTEMPTS + ')', 401);
    }

    // Successful login: reset counters & issue session token
    const rawToken = 'tok_' + Utilities.getUuid().replace(/-/g, '') + Utilities.getUuid().replace(/-/g, '');
    const tokenHash = computeHash(rawToken, userRow.salt);
    const expiresAt = new Date(now.getTime() + APP_CONFIG.SESSION_TTL_HOURS * 3600 * 1000).toISOString();

    userRow.failed_attempts = 0;
    userRow.locked_until = '';
    userRow.status = 'active';
    userRow.session_token_hash = tokenHash;
    userRow.session_expires_at = expiresAt;
    userRow.updated_at = now.toISOString();

    updateSheetRowByIndex(SHEET_NAMES.USERS, userRow._rowIndex, userRow);

    ctx.user = userRow;
    writeAuditLog(ctx, 'auth.login', 'Users', userRow.user_id, 'เข้าสู่ระบบสำเร็จ (' + loginMode + ')', { auth_mode: loginMode });

    return {
      user: sanitizeUser(userRow),
      session_token: rawToken,
      expires_at: expiresAt
    };
  });
}

/**
 * Logs out current user and invalidates session token.
 */
function handleAuthLogout(ctx) {
  return withWriteLock(function() {
    const userRow = ctx.user;
    userRow.session_token_hash = '';
    userRow.session_expires_at = '';
    userRow.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.USERS, userRow._rowIndex, userRow);
    invalidateUserCache(userRow.user_id);
    writeAuditLog(ctx, 'auth.logout', 'Users', userRow.user_id, 'ออกจากระบบ', {});
    return { logged_out: true };
  });
}

/**
 * Updates user profile, base currency, timezone, password, or PIN.
 */
function handleAuthUpdateProfile(ctx, params) {
  return withWriteLock(function() {
    const userRow = ctx.user;
    if (params.full_name !== undefined) {
      userRow.full_name = requireString(params.full_name, 'ชื่อ-นามสกุล', 100);
    }
    if (params.base_currency !== undefined) {
      userRow.base_currency = requireString(params.base_currency, 'สกุลเงินหลัก', 10).toUpperCase();
    }
    if (params.timezone !== undefined) {
      userRow.timezone = requireString(params.timezone, 'เขตเวลา (Timezone)', 50);
    }
    if (params.new_password) {
      const currentPwd = requireString(params.current_password, 'รหัสผ่านปัจจุบัน', 128);
      if (computeHash(currentPwd, userRow.salt) !== userRow.password_hash) {
        throw createAppError('INVALID_CREDENTIALS', 'รหัสผ่านปัจจุบันไม่ถูกต้อง', 401);
      }
      if (String(params.new_password).length < 6) {
        throw createAppError('VALIDATION_ERROR', 'รหัสผ่านใหม่ต้องมีความยาวอย่างน้อย 6 ตัวอักษร', 400);
      }
      userRow.password_hash = computeHash(params.new_password, userRow.salt);
    }
    if (params.new_pin !== undefined) {
      const pinStr = String(params.new_pin || '').trim();
      if (pinStr === '') {
        userRow.pin_hash = '';
      } else if (!/^\d{6}$/.test(pinStr)) {
        throw createAppError('VALIDATION_ERROR', 'รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น', 400);
      } else {
        userRow.pin_hash = computeHash(pinStr, userRow.salt);
      }
    }

    userRow.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.USERS, userRow._rowIndex, userRow);
    invalidateUserCache(userRow.user_id);
    writeAuditLog(ctx, 'auth.updateProfile', 'Users', userRow.user_id, 'อัปเดตข้อมูลโปรไฟล์/ความปลอดภัย', {});

    return { user: sanitizeUser(userRow) };
  });
}

