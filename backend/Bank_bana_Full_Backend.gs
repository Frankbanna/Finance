/**
 * ==============================================================================
 * BANK_BANA - FULL GOOGLE APPS SCRIPT BACKEND BUNDLE (ALL-IN-ONE)
 * ==============================================================================
 * Version: 1.0.0-phase4-complete
 * Target Spreadsheet ID: 15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A
 * 
 * Instructions:
 * 1. Open Google Sheet: https://docs.google.com/spreadsheets/d/15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A/edit
 * 2. Extensions (ส่วนขยาย) > Apps Script
 * 3. Delete any default code in Code.gs, paste this ENTIRE file, and click Save (💾).
 * 4. Click Deploy (ทำให้ใช้งานได้) > New deployment (การทำให้ใช้งานได้รายการใหม่)
 *    - Type: Web app (เว็บแอป)
 *    - Execute as: Me (ฉัน - chaloemphonbannarak@gmail.com)
 *    - Who has access: Anyone (ทุกคน)
 * 5. Click Deploy and copy the Web App URL (ends in /exec).
 * ==============================================================================
 */

/** --- FILE: Config.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: Config.gs
 * Description: Global configuration, sheet names, column schemas, and Script Properties loader.
 */

const APP_CONFIG = {
  APP_NAME: 'Bank_bana',
  VERSION: '1.0.0-phase4-complete',
  DEFAULT_SPREADSHEET_ID: '15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A',
  DEFAULT_TIMEZONE: 'Asia/Bangkok',
  DEFAULT_CURRENCY: 'THB',
  SESSION_TTL_HOURS: 24 * 7, // 7 days
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 25,
  CACHE_TTL_SECONDS: 120,
  LOCK_TIMEOUT_MS: 15000
};

const SHEET_NAMES = {
  USERS: 'Users',
  ACCOUNTS: 'Accounts',
  TRANSACTIONS: 'Transactions',
  CATEGORIES: 'Categories',
  BUDGETS: 'Budgets',
  GOALS: 'Goals',
  GOAL_CONTRIBUTIONS: 'Goal_Contributions',
  RECURRING: 'Recurring',
  DEBTS: 'Debts',
  DEBT_PAYMENTS: 'Debt_Payments',
  BILLS: 'Bills',
  RULES: 'Rules',
  NOTIFICATIONS: 'Notifications',
  IMPORT_HISTORY: 'Import_History',
  AUDIT_LOGS: 'Audit_Logs',
  SETTINGS: 'Settings'
};

const SHEET_HEADERS = {
  [SHEET_NAMES.USERS]: [
    'user_id', 'email', 'password_hash', 'pin_hash', 'salt',
    'full_name', 'base_currency', 'timezone', 'role', 'status',
    'failed_attempts', 'locked_until', 'session_token_hash', 'session_expires_at',
    'created_at', 'updated_at'
  ],
  [SHEET_NAMES.ACCOUNTS]: [
    'account_id', 'user_id', 'account_name', 'account_type', 'currency',
    'opening_balance', 'current_balance', 'credit_limit', 'billing_day', 'due_day',
    'institution_name', 'account_number_masked', 'color', 'icon',
    'include_in_net_worth', 'is_archived', 'last_reconciled_at',
    'created_at', 'updated_at'
  ],
  [SHEET_NAMES.TRANSACTIONS]: [
    'transaction_id', 'user_id', 'tx_date', 'tx_time', 'tx_type',
    'account_id', 'to_account_id', 'category_id', 'subcategory_id',
    'amount', 'currency', 'exchange_rate', 'to_amount',
    'merchant', 'description', 'tags', 'receipt_url',
    'reference_tx_id', 'recurring_id', 'import_id',
    'idempotency_key', 'dedup_hash', 'status', 'revision',
    'edit_history_json', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.CATEGORIES]: [
    'category_id', 'user_id', 'parent_id', 'category_name', 'category_type',
    'color', 'icon', 'is_system', 'is_active', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.BUDGETS]: [
    'budget_id', 'user_id', 'budget_name', 'period_type', 'category_id',
    'amount_limit', 'currency', 'start_date', 'end_date',
    'rollover_enabled', 'rollover_amount', 'alert_threshold_pct',
    'is_active', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.GOALS]: [
    'goal_id', 'user_id', 'goal_name', 'target_amount', 'current_amount',
    'currency', 'target_date', 'linked_account_id', 'priority', 'status',
    'color', 'icon', 'notes', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.GOAL_CONTRIBUTIONS]: [
    'contribution_id', 'goal_id', 'user_id', 'tx_date', 'entry_type',
    'amount', 'linked_transaction_id', 'note', 'created_at'
  ],
  [SHEET_NAMES.RECURRING]: [
    'recurring_id', 'user_id', 'title', 'tx_type', 'account_id',
    'to_account_id', 'category_id', 'amount', 'currency', 'frequency',
    'interval_count', 'start_date', 'end_date', 'next_run_date',
    'last_run_date', 'auto_post', 'status', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.DEBTS]: [
    'debt_id', 'user_id', 'debt_name', 'debt_type', 'lender_name',
    'linked_account_id', 'principal_amount', 'current_balance',
    'interest_rate_annual', 'minimum_payment', 'due_day',
    'start_date', 'target_payoff_date', 'status', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.DEBT_PAYMENTS]: [
    'payment_id', 'debt_id', 'user_id', 'payment_date', 'total_amount',
    'principal_paid', 'interest_paid', 'fee_amount', 'remaining_balance',
    'linked_transaction_id', 'created_at'
  ],
  [SHEET_NAMES.BILLS]: [
    'bill_id', 'user_id', 'bill_name', 'category_id', 'amount',
    'currency', 'due_date', 'is_recurring', 'frequency', 'status',
    'remind_days_before', 'paid_transaction_id', 'notes', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.RULES]: [
    'rule_id', 'user_id', 'rule_name', 'match_field', 'match_operator',
    'match_value', 'assign_category_id', 'assign_tags', 'is_active',
    'priority', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.NOTIFICATIONS]: [
    'notification_id', 'user_id', 'notif_type', 'severity', 'title',
    'message', 'reference_id', 'is_read', 'created_at'
  ],
  [SHEET_NAMES.IMPORT_HISTORY]: [
    'import_id', 'user_id', 'source_type', 'file_name', 'account_id',
    'total_rows', 'imported_rows', 'skipped_duplicates', 'status', 'created_at'
  ],
  [SHEET_NAMES.AUDIT_LOGS]: [
    'log_id', 'request_id', 'user_id', 'action', 'entity_type',
    'entity_id', 'summary', 'metadata_json', 'created_at'
  ],
  [SHEET_NAMES.SETTINGS]: [
    'setting_id', 'user_id', 'setting_key', 'setting_value', 'updated_at'
  ]
};

/**
 * Retrieves the active Spreadsheet instance using Script Properties or fallback ID.
 */
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID') || APP_CONFIG.DEFAULT_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw createAppError('CONFIG_ERROR', 'SPREADSHEET_ID is not configured in Script Properties.', 500);
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * Retrieves application secret pepper used for HMAC hashing.
 */
function getPepperSecret() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('AUTH_PEPPER_SECRET');
  if (!pepper) {
    pepper = 'pfm_pro_default_pepper_' + APP_CONFIG.DEFAULT_SPREADSHEET_ID;
    props.setProperty('AUTH_PEPPER_SECRET', pepper);
  }
  return pepper;
}



/** --- FILE: Utils.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: Utils.gs
 * Description: Security hashing, ID generation, LockService, CacheService, Batch Sheet I/O, Validation, and Audit Logging.
 */

/**
 * Generates a unique prefixed ID.
 */
function generateId(prefix) {
  const uuid = Utilities.getUuid().replace(/-/g, '').substring(0, 16);
  return (prefix || 'id') + '_' + uuid;
}

/**
 * Returns current ISO-8601 UTC timestamp string.
 */
function nowIso() {
  return new Date().toISOString();
}

/**
 * Creates a structured application error object (never leaks stack traces to clients).
 */
function createAppError(code, message, httpStatus, details) {
  const err = new Error(message);
  err.isAppError = true;
  err.code = code || 'APP_ERROR';
  err.httpStatus = httpStatus || 400;
  err.details = details || null;
  return err;
}

/**
 * Computes hex-encoded HMAC-SHA256 using user salt + server pepper.
 */
function computeHash(plainText, salt) {
  const pepper = getPepperSecret();
  const key = String(salt || '') + ':' + pepper;
  const rawBytes = Utilities.computeHmacSha256Signature(String(plainText || ''), key);
  return rawBytes.map(function(b) {
    const v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('');
}

/**
 * Computes deterministic deduplication hash for transactions.
 */
function computeTxDedupHash(userId, txDate, txType, accountId, amount, merchant) {
  const normalized = [
    String(userId || '').trim(),
    String(txDate || '').trim(),
    String(txType || '').trim().toLowerCase(),
    String(accountId || '').trim(),
    Number(amount || 0).toFixed(2),
    String(merchant || '').trim().toLowerCase()
  ].join('|');
  const raw = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, normalized);
  return raw.map(function(b) {
    const v = (b < 0) ? b + 256 : b;
    return ('0' + v.toString(16)).slice(-2);
  }).join('').substring(0, 24);
}

/**
 * Executes a callback inside ScriptLock to prevent concurrent write collisions.
 */
function withWriteLock(callback) {
  const lock = LockService.getScriptLock();
  const acquired = lock.tryLock(APP_CONFIG.LOCK_TIMEOUT_MS);
  if (!acquired) {
    throw createAppError('CONCURRENCY_LOCK_TIMEOUT', 'ระบบกำลังประมวลผลคำขอก่อนหน้า กรุณาลองใหม่อีกครั้ง', 429);
  }
  try {
    return callback();
  } finally {
    SpreadsheetApp.flush();
    lock.releaseLock();
  }
}

/**
 * Cache helpers scoped per user.
 */
function getUserCacheKey(userId, key) {
  return 'pfm_u_' + userId + '_' + key;
}

function getCachedData(userId, key) {
  try {
    const cache = CacheService.getScriptCache();
    const raw = cache.get(getUserCacheKey(userId, key));
    return raw ? JSON.parse(raw) : null;
  } catch (e) {
    return null;
  }
}

function setCachedData(userId, key, data, ttlSeconds) {
  try {
    const cache = CacheService.getScriptCache();
    const serialized = JSON.stringify(data);
    if (serialized.length < 95000) {
      cache.put(getUserCacheKey(userId, key), serialized, ttlSeconds || APP_CONFIG.CACHE_TTL_SECONDS);
    }
  } catch (e) {
    // Ignore cache write errors safely
  }
}

function invalidateUserCache(userId) {
  try {
    const cache = CacheService.getScriptCache();
    const keys = ['accounts', 'categories', 'dashboard', 'settings'];
    cache.removeAll(keys.map(function(k) { return getUserCacheKey(userId, k); }));
  } catch (e) {
    // Ignore cache clear errors safely
  }
}

/**
 * Reads all rows from a sheet in a single batch call and maps them to objects with `_rowIndex` (1-based).
 */
function readSheetObjects(sheetName) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    throw createAppError('SHEET_NOT_FOUND', 'ไม่พบชีตฐานข้อมูล: ' + sheetName, 500);
  }
  const lastRow = sheet.getLastRow();
  const headers = SHEET_HEADERS[sheetName];
  if (!headers || lastRow <= 1) {
    return [];
  }
  const values = sheet.getRange(2, 1, lastRow - 1, headers.length).getValues();
  const results = [];
  for (let i = 0; i < values.length; i++) {
    const row = values[i];
    // Skip completely empty rows
    if (!row[0] && !row[1]) continue;
    const obj = { _rowIndex: i + 2 };
    for (let c = 0; c < headers.length; c++) {
      let val = row[c];
      if (val instanceof Date) {
        // Format date columns properly
        if (headers[c].indexOf('_date') !== -1 || headers[c] === 'tx_date') {
          val = Utilities.formatDate(val, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
        } else {
          val = val.toISOString();
        }
      }
      obj[headers[c]] = val;
    }
    results.push(obj);
  }
  return results;
}

/**
 * Converts an object to an ordered row array matching SHEET_HEADERS[sheetName].
 */
function objectToRowArray(sheetName, obj) {
  const headers = SHEET_HEADERS[sheetName];
  return headers.map(function(col) {
    const val = obj[col];
    return (val === undefined || val === null) ? '' : val;
  });
}

/**
 * Appends a single object to a sheet.
 */
function appendSheetObject(sheetName, obj) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const rowArray = objectToRowArray(sheetName, obj);
  sheet.appendRow(rowArray);
  return obj;
}

/**
 * Appends multiple objects in a single batch setValues call.
 */
function batchAppendObjects(sheetName, objList) {
  if (!objList || objList.length === 0) return 0;
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const headers = SHEET_HEADERS[sheetName];
  const rows = objList.map(function(obj) {
    return objectToRowArray(sheetName, obj);
  });
  const startRow = Math.max(sheet.getLastRow() + 1, 2);
  sheet.getRange(startRow, 1, rows.length, headers.length).setValues(rows);
  return rows.length;
}

/**
 * Updates an existing row at `rowIndex` (1-based) in a single setValues call.
 */
function updateSheetRowByIndex(sheetName, rowIndex, obj) {
  const ss = getSpreadsheet();
  const sheet = ss.getSheetByName(sheetName);
  const headers = SHEET_HEADERS[sheetName];
  const rowArray = objectToRowArray(sheetName, obj);
  sheet.getRange(rowIndex, 1, 1, headers.length).setValues([rowArray]);
  return obj;
}

/**
 * Writes an entry to Audit_Logs sheet.
 */
function writeAuditLog(ctx, action, entityType, entityId, summary, metadataObj) {
  try {
    const logEntry = {
      log_id: generateId('aud'),
      request_id: (ctx && ctx.requestId) ? ctx.requestId : generateId('req'),
      user_id: (ctx && ctx.user && ctx.user.user_id) ? ctx.user.user_id : 'ANONYMOUS',
      action: action,
      entity_type: entityType,
      entity_id: entityId || '',
      summary: summary || '',
      metadata_json: metadataObj ? JSON.stringify(metadataObj) : '{}',
      created_at: nowIso()
    };
    appendSheetObject(SHEET_NAMES.AUDIT_LOGS, logEntry);
  } catch (e) {
    // Do not fail primary operation if audit log fails, but log internally
    Logger.log('Audit log write failed: ' + e.message);
  }
}

/**
 * Input Validation Helpers
 */
function requireString(val, fieldName, maxLen) {
  const str = String(val === undefined || val === null ? '' : val).trim();
  if (!str) {
    throw createAppError('VALIDATION_ERROR', 'กรุณาระบุข้อมูล: ' + fieldName, 400);
  }
  if (maxLen && str.length > maxLen) {
    throw createAppError('VALIDATION_ERROR', fieldName + ' ต้องมีความยาวไม่เกิน ' + maxLen + ' ตัวอักษร', 400);
  }
  return str;
}

function optionalString(val, maxLen) {
  const str = String(val === undefined || val === null ? '' : val).trim();
  if (maxLen && str.length > maxLen) {
    return str.substring(0, maxLen);
  }
  return str;
}

function requireNumber(val, fieldName, allowNegative, allowZero) {
  const num = Number(val);
  if (isNaN(num) || !isFinite(num)) {
    throw createAppError('VALIDATION_ERROR', fieldName + ' ต้องเป็นตัวเลขที่ถูกต้อง', 400);
  }
  if (!allowNegative && num < 0) {
    throw createAppError('VALIDATION_ERROR', fieldName + ' ต้องไม่ติดลบ', 400);
  }
  if (!allowZero && num === 0) {
    throw createAppError('VALIDATION_ERROR', fieldName + ' ต้องไม่เป็น 0', 400);
  }
  return Math.round(num * 100) / 100;
}

function requireEnum(val, allowedList, fieldName) {
  const str = String(val || '').trim();
  if (allowedList.indexOf(str) === -1) {
    throw createAppError('VALIDATION_ERROR', 'ค่าของ ' + fieldName + ' ไม่ถูกต้อง (รองรับ: ' + allowedList.join(', ') + ')', 400);
  }
  return str;
}

function requireDateStr(val, fieldName) {
  const str = String(val || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    throw createAppError('VALIDATION_ERROR', fieldName + ' ต้องอยู่ในรูปแบบ YYYY-MM-DD', 400);
  }
  return str;
}

function toBoolean(val, defaultVal) {
  if (val === undefined || val === null || val === '') return Boolean(defaultVal);
  if (typeof val === 'boolean') return val;
  const s = String(val).trim().toUpperCase();
  return s === 'TRUE' || s === '1' || s === 'YES';
}



/** --- FILE: AuthService.gs --- */
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



/** --- FILE: CategoryService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: CategoryService.gs
 * Description: Manages main categories and subcategories (System + User-defined).
 */

const ALLOWED_CATEGORY_TYPES = ['income', 'expense', 'transfer', 'adjustment'];

/**
 * Lists all active categories visible to the user (SYSTEM + user's own categories).
 */
function handleCategoriesList(ctx, params) {
  const userId = ctx.user.user_id;
  const includeInactive = toBoolean(params && params.include_inactive, false);

  const allRows = readSheetObjects(SHEET_NAMES.CATEGORIES);
  const categories = [];

  for (let i = 0; i < allRows.length; i++) {
    const row = allRows[i];
    if (row.user_id !== 'SYSTEM' && row.user_id !== userId) continue;
    const isActive = toBoolean(row.is_active, true);
    if (!includeInactive && !isActive) continue;

    categories.push({
      category_id: row.category_id,
      user_id: row.user_id,
      parent_id: row.parent_id || '',
      category_name: row.category_name,
      category_type: row.category_type,
      color: row.color || '#64748B',
      icon: row.icon || 'tag',
      is_system: toBoolean(row.is_system, row.user_id === 'SYSTEM'),
      is_active: isActive,
      created_at: row.created_at,
      updated_at: row.updated_at
    });
  }

  return { categories: categories };
}

/**
 * Creates a custom main category or subcategory for the authenticated user.
 */
function handleCategoriesCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const categoryName = requireString(params.category_name, 'ชื่อหมวดหมู่', 80);
    const categoryType = requireEnum(params.category_type, ALLOWED_CATEGORY_TYPES, 'ประเภทหมวดหมู่');
    const parentId = optionalString(params.parent_id, 64);
    const color = optionalString(params.color, 20) || '#3B82F6';
    const icon = optionalString(params.icon, 40) || 'tag';

    const allRows = readSheetObjects(SHEET_NAMES.CATEGORIES);
    if (parentId) {
      let parentFound = false;
      for (let i = 0; i < allRows.length; i++) {
        const r = allRows[i];
        if (r.category_id === parentId && (r.user_id === 'SYSTEM' || r.user_id === userId)) {
          parentFound = true;
          break;
        }
      }
      if (!parentFound) {
        throw createAppError('NOT_FOUND', 'ไม่พบหมวดหมู่หลักที่อ้างอิง', 404);
      }
    }

    const now = nowIso();
    const newCat = {
      category_id: generateId('cat'),
      user_id: userId,
      parent_id: parentId,
      category_name: categoryName,
      category_type: categoryType,
      color: color,
      icon: icon,
      is_system: 'FALSE',
      is_active: 'TRUE',
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.CATEGORIES, newCat);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'categories.create', 'Categories', newCat.category_id, 'สร้างหมวดหมู่: ' + categoryName, newCat);

    return { category: newCat };
  });
}

/**
 * Updates a user-owned category.
 */
function handleCategoriesUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const categoryId = requireString(params.category_id, 'รหัสหมวดหมู่ (category_id)', 64);

    const allRows = readSheetObjects(SHEET_NAMES.CATEGORIES);
    let target = null;
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i].category_id === categoryId) {
        target = allRows[i];
        break;
      }
    }

    if (!target || (target.user_id !== userId)) {
      throw createAppError('FORBIDDEN', 'ไม่สามารถแก้ไขหมวดหมู่ระบบหรือหมวดหมู่ของผู้อื่นได้', 403);
    }

    if (params.category_name !== undefined) {
      target.category_name = requireString(params.category_name, 'ชื่อหมวดหมู่', 80);
    }
    if (params.color !== undefined) {
      target.color = optionalString(params.color, 20) || target.color;
    }
    if (params.icon !== undefined) {
      target.icon = optionalString(params.icon, 40) || target.icon;
    }
    if (params.is_active !== undefined) {
      target.is_active = toBoolean(params.is_active, true) ? 'TRUE' : 'FALSE';
    }
    target.updated_at = nowIso();

    updateSheetRowByIndex(SHEET_NAMES.CATEGORIES, target._rowIndex, target);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'categories.update', 'Categories', categoryId, 'แก้ไขหมวดหมู่: ' + target.category_name, {});

    return { category: target };
  });
}



/** --- FILE: AccountService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: AccountService.gs
 * Description: Manages financial accounts (Cash, Bank, E-Wallet, Credit Card, Investment),
 *              multi-currency balances, reconciliation, and balance history.
 */

const ALLOWED_ACCOUNT_TYPES = ['cash', 'bank', 'ewallet', 'credit_card', 'investment'];

/**
 * Normalizes an account row for client responses.
 */
function normalizeAccount(row) {
  return {
    account_id: row.account_id,
    user_id: row.user_id,
    account_name: row.account_name,
    account_type: row.account_type,
    currency: row.currency || 'THB',
    opening_balance: Number(row.opening_balance || 0),
    current_balance: Number(row.current_balance || 0),
    credit_limit: Number(row.credit_limit || 0),
    billing_day: row.billing_day ? Number(row.billing_day) : null,
    due_day: row.due_day ? Number(row.due_day) : null,
    institution_name: row.institution_name || '',
    account_number_masked: row.account_number_masked || '',
    color: row.color || '#2563EB',
    icon: row.icon || 'wallet',
    include_in_net_worth: toBoolean(row.include_in_net_worth, true),
    is_archived: toBoolean(row.is_archived, false),
    last_reconciled_at: row.last_reconciled_at || '',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Recalculates and updates `current_balance` for all accounts belonging to `userId`
 * directly from `opening_balance` + posted `Transactions`.
 * Rules:
 * - `income`: +amount to `account_id`
 * - `expense`: -amount from `account_id`
 * - `refund`: +amount to `account_id`
 * - `adjustment`: +amount (can be positive or negative) to `account_id`
 * - `transfer`: -amount from `account_id`, +(to_amount || amount) to `to_account_id`
 */
function recalculateUserAccountBalances(userId) {
  const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);

  const userAccounts = [];
  const balanceMap = {};

  for (let i = 0; i < allAccounts.length; i++) {
    const acc = allAccounts[i];
    if (acc.user_id === userId) {
      userAccounts.push(acc);
      balanceMap[acc.account_id] = Number(acc.opening_balance || 0);
    }
  }

  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i];
    if (tx.user_id !== userId) continue;
    if (tx.status !== 'posted') continue;

    const amt = Number(tx.amount || 0);
    const toAmt = tx.to_amount !== '' && tx.to_amount !== null && tx.to_amount !== undefined
      ? Number(tx.to_amount)
      : amt;
    const accId = tx.account_id;
    const toAccId = tx.to_account_id;

    if (tx.tx_type === 'income' || tx.tx_type === 'refund') {
      if (balanceMap[accId] !== undefined) balanceMap[accId] += amt;
    } else if (tx.tx_type === 'expense') {
      if (balanceMap[accId] !== undefined) balanceMap[accId] -= amt;
    } else if (tx.tx_type === 'adjustment') {
      if (balanceMap[accId] !== undefined) balanceMap[accId] += amt;
    } else if (tx.tx_type === 'transfer') {
      if (balanceMap[accId] !== undefined) balanceMap[accId] -= amt;
      if (toAccId && balanceMap[toAccId] !== undefined) balanceMap[toAccId] += toAmt;
    }
  }

  const now = nowIso();
  const updatedAccounts = [];
  for (let i = 0; i < userAccounts.length; i++) {
    const acc = userAccounts[i];
    const computed = Math.round((balanceMap[acc.account_id] || 0) * 100) / 100;
    if (Number(acc.current_balance) !== computed) {
      acc.current_balance = computed;
      acc.updated_at = now;
      updateSheetRowByIndex(SHEET_NAMES.ACCOUNTS, acc._rowIndex, acc);
    }
    updatedAccounts.push(normalizeAccount(acc));
  }

  return updatedAccounts;
}

/**
 * Lists all accounts belonging to the authenticated user.
 */
function handleAccountsList(ctx, params) {
  const userId = ctx.user.user_id;
  const includeArchived = toBoolean(params && params.include_archived, false);

  const accounts = recalculateUserAccountBalances(userId).filter(function(acc) {
    return includeArchived || !acc.is_archived;
  });

  return { accounts: accounts };
}

/**
 * Creates a new financial account for the authenticated user.
 */
function handleAccountsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const accountName = requireString(params.account_name, 'ชื่อบัญชี (account_name)', 100);
    const accountType = requireEnum(params.account_type, ALLOWED_ACCOUNT_TYPES, 'ประเภทบัญชี (account_type)');
    const currency = (optionalString(params.currency, 10) || ctx.user.base_currency || 'THB').toUpperCase();
    const openingBalance = requireNumber(
      params.opening_balance !== undefined && params.opening_balance !== '' ? params.opening_balance : 0,
      'ยอดเงินตั้งต้น (opening_balance)',
      true,
      true
    );
    const creditLimit = params.credit_limit ? requireNumber(params.credit_limit, 'วงเงินบัตรเครดิต', false, true) : 0;
    const billingDay = params.billing_day ? requireNumber(params.billing_day, 'วันสรุปยอด', false, false) : '';
    const dueDay = params.due_day ? requireNumber(params.due_day, 'วันครบกำหนดชำระ', false, false) : '';
    const institutionName = optionalString(params.institution_name, 100);
    const accountNumberMasked = optionalString(params.account_number_masked, 30);
    const color = optionalString(params.color, 20) || '#2563EB';
    const icon = optionalString(params.icon, 40) || 'wallet';
    const includeInNetWorth = toBoolean(params.include_in_net_worth, true);

    const now = nowIso();
    const newAcc = {
      account_id: generateId('acc'),
      user_id: userId,
      account_name: accountName,
      account_type: accountType,
      currency: currency,
      opening_balance: openingBalance,
      current_balance: openingBalance,
      credit_limit: creditLimit,
      billing_day: billingDay,
      due_day: dueDay,
      institution_name: institutionName,
      account_number_masked: accountNumberMasked,
      color: color,
      icon: icon,
      include_in_net_worth: includeInNetWorth ? 'TRUE' : 'FALSE',
      is_archived: 'FALSE',
      last_reconciled_at: now,
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.ACCOUNTS, newAcc);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'accounts.create', 'Accounts', newAcc.account_id, 'สร้างบัญชีใหม่: ' + accountName + ' (' + currency + ')', {
      account_type: accountType,
      currency: currency,
      opening_balance: openingBalance
    });

    return { account: normalizeAccount(newAcc) };
  });
}

/**
 * Updates an existing user account.
 */
function handleAccountsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const accountId = requireString(params.account_id, 'รหัสบัญชี (account_id)', 64);

    const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
    let target = null;
    for (let i = 0; i < allAccounts.length; i++) {
      if (allAccounts[i].account_id === accountId) {
        target = allAccounts[i];
        break;
      }
    }

    if (!target || target.user_id !== userId) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีที่ต้องการแก้ไข หรือคุณไม่มีสิทธิ์เข้าถึง', 404);
    }

    if (params.account_name !== undefined) {
      target.account_name = requireString(params.account_name, 'ชื่อบัญชี', 100);
    }
    if (params.account_type !== undefined) {
      target.account_type = requireEnum(params.account_type, ALLOWED_ACCOUNT_TYPES, 'ประเภทบัญชี');
    }
    if (params.currency !== undefined) {
      target.currency = requireString(params.currency, 'สกุลเงิน', 10).toUpperCase();
    }
    if (params.opening_balance !== undefined) {
      target.opening_balance = requireNumber(params.opening_balance, 'ยอดเงินตั้งต้น', true, true);
    }
    if (params.credit_limit !== undefined) {
      target.credit_limit = params.credit_limit ? requireNumber(params.credit_limit, 'วงเงินบัตรเครดิต', false, true) : 0;
    }
    if (params.billing_day !== undefined) {
      target.billing_day = params.billing_day ? requireNumber(params.billing_day, 'วันสรุปยอด', false, false) : '';
    }
    if (params.due_day !== undefined) {
      target.due_day = params.due_day ? requireNumber(params.due_day, 'วันครบกำหนดชำระ', false, false) : '';
    }
    if (params.institution_name !== undefined) {
      target.institution_name = optionalString(params.institution_name, 100);
    }
    if (params.account_number_masked !== undefined) {
      target.account_number_masked = optionalString(params.account_number_masked, 30);
    }
    if (params.color !== undefined) {
      target.color = optionalString(params.color, 20) || target.color;
    }
    if (params.icon !== undefined) {
      target.icon = optionalString(params.icon, 40) || target.icon;
    }
    if (params.include_in_net_worth !== undefined) {
      target.include_in_net_worth = toBoolean(params.include_in_net_worth, true) ? 'TRUE' : 'FALSE';
    }
    if (params.is_archived !== undefined) {
      target.is_archived = toBoolean(params.is_archived, false) ? 'TRUE' : 'FALSE';
    }

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.ACCOUNTS, target._rowIndex, target);

    const updatedList = recalculateUserAccountBalances(userId);
    const updatedAcc = updatedList.filter(function(a) { return a.account_id === accountId; })[0];

    invalidateUserCache(userId);
    writeAuditLog(ctx, 'accounts.update', 'Accounts', accountId, 'แก้ไขบัญชี: ' + target.account_name, {});

    return { account: updatedAcc || normalizeAccount(target) };
  });
}

/**
 * Reconciles an account balance against actual user-verified balance.
 * Automatically creates an `adjustment` transaction if there is a discrepancy.
 */
function handleAccountsReconcile(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const accountId = requireString(params.account_id, 'รหัสบัญชี (account_id)', 64);
    const actualBalance = requireNumber(params.actual_balance, 'ยอดเงินจริง (actual_balance)', true, true);
    const note = optionalString(params.note, 250) || 'ปรับปรุงยอดจากการกระทบยอดบัญชี (Reconciliation)';

    // First recalculate current balance from transactions
    recalculateUserAccountBalances(userId);

    const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
    let target = null;
    for (let i = 0; i < allAccounts.length; i++) {
      if (allAccounts[i].account_id === accountId && allAccounts[i].user_id === userId) {
        target = allAccounts[i];
        break;
      }
    }

    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีที่ต้องการกระทบยอด', 404);
    }

    const currentBalance = Number(target.current_balance || 0);
    const diff = Math.round((actualBalance - currentBalance) * 100) / 100;
    const now = nowIso();
    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const timeStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'HH:mm');

    let adjustmentTx = null;
    if (Math.abs(diff) >= 0.01) {
      const txId = generateId('txn');
      adjustmentTx = {
        transaction_id: txId,
        user_id: userId,
        tx_date: todayStr,
        tx_time: timeStr,
        tx_type: 'adjustment',
        account_id: accountId,
        to_account_id: '',
        category_id: 'cat_adj_reconcile',
        subcategory_id: '',
        amount: diff,
        currency: target.currency || 'THB',
        exchange_rate: 1,
        to_amount: diff,
        merchant: 'System Reconciliation',
        description: note + ' (เดิม: ' + currentBalance.toFixed(2) + ' -> จริง: ' + actualBalance.toFixed(2) + ')',
        tags: 'reconcile,adjustment',
        receipt_url: '',
        reference_tx_id: '',
        recurring_id: '',
        import_id: '',
        idempotency_key: 'rec_' + txId,
        dedup_hash: computeTxDedupHash(userId, todayStr, 'adjustment', accountId, diff, 'System Reconciliation'),
        status: 'posted',
        revision: 1,
        edit_history_json: JSON.stringify([{
          revision: 1,
          action: 'created_by_reconcile',
          timestamp: now,
          previous_balance: currentBalance,
          actual_balance: actualBalance,
          diff: diff
        }]),
        created_at: now,
        updated_at: now
      };
      appendSheetObject(SHEET_NAMES.TRANSACTIONS, adjustmentTx);
    }

    target.current_balance = actualBalance;
    target.last_reconciled_at = now;
    target.updated_at = now;
    updateSheetRowByIndex(SHEET_NAMES.ACCOUNTS, target._rowIndex, target);

    invalidateUserCache(userId);
    writeAuditLog(ctx, 'accounts.reconcile', 'Accounts', accountId, 'กระทบยอดบัญชี ' + target.account_name + ' ส่วนต่าง: ' + diff, {
      previous_balance: currentBalance,
      actual_balance: actualBalance,
      diff: diff
    });

    return {
      account: normalizeAccount(target),
      difference: diff,
      adjustment_transaction: adjustmentTx
    };
  });
}

/**
 * Returns chronological balance history for a specific account.
 */
function handleAccountsBalanceHistory(ctx, params) {
  const userId = ctx.user.user_id;
  const accountId = requireString(params.account_id, 'รหัสบัญชี (account_id)', 64);

  const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
  let target = null;
  for (let i = 0; i < allAccounts.length; i++) {
    if (allAccounts[i].account_id === accountId && allAccounts[i].user_id === userId) {
      target = allAccounts[i];
      break;
    }
  }
  if (!target) {
    throw createAppError('NOT_FOUND', 'ไม่พบบัญชีที่ระบุ', 404);
  }

  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS)
    .filter(function(tx) {
      return tx.user_id === userId &&
        tx.status === 'posted' &&
        (tx.account_id === accountId || tx.to_account_id === accountId);
    })
    .sort(function(a, b) {
      const da = String(a.tx_date) + ' ' + String(a.tx_time || '00:00');
      const db = String(b.tx_date) + ' ' + String(b.tx_time || '00:00');
      return da.localeCompare(db);
    });

  let runningBalance = Number(target.opening_balance || 0);
  const history = [{
    date: String(target.created_at || '').substring(0, 10),
    event: 'ยอดยกมาตั้งต้น (Opening Balance)',
    change: runningBalance,
    balance_after: runningBalance,
    transaction_id: null
  }];

  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i];
    const amt = Number(tx.amount || 0);
    const toAmt = (tx.to_amount !== '' && tx.to_amount !== null && tx.to_amount !== undefined)
      ? Number(tx.to_amount)
      : amt;
    let delta = 0;

    if (tx.tx_type === 'income' || tx.tx_type === 'refund') {
      delta = amt;
    } else if (tx.tx_type === 'expense') {
      delta = -amt;
    } else if (tx.tx_type === 'adjustment') {
      delta = amt;
    } else if (tx.tx_type === 'transfer') {
      if (tx.account_id === accountId) delta = -amt;
      if (tx.to_account_id === accountId) delta = toAmt;
    }

    runningBalance = Math.round((runningBalance + delta) * 100) / 100;
    history.push({
      date: tx.tx_date,
      time: tx.tx_time,
      tx_type: tx.tx_type,
      event: tx.merchant || tx.description || tx.tx_type,
      change: delta,
      balance_after: runningBalance,
      transaction_id: tx.transaction_id
    });
  }

  return {
    account: normalizeAccount(target),
    history: history
  };
}



/** --- FILE: TransactionService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: TransactionService.gs
 * Description: Full CRUD for income, expense, transfer, refund, and adjustment transactions,
 *              including deduplication, revision history, voiding, filtering, pagination, and CSV import/export.
 */

const ALLOWED_TX_TYPES = ['income', 'expense', 'transfer', 'refund', 'adjustment'];
const ALLOWED_TX_STATUS = ['posted', 'pending', 'voided'];

/**
 * Normalizes a transaction row for API responses.
 */
function normalizeTransaction(row) {
  let editHistory = [];
  if (row.edit_history_json) {
    try {
      editHistory = JSON.parse(row.edit_history_json);
    } catch (e) {
      editHistory = [];
    }
  }
  return {
    transaction_id: row.transaction_id,
    user_id: row.user_id,
    tx_date: String(row.tx_date || '').substring(0, 10),
    tx_time: String(row.tx_time || '00:00').substring(0, 5),
    tx_type: row.tx_type,
    account_id: row.account_id,
    to_account_id: row.to_account_id || '',
    category_id: row.category_id || '',
    subcategory_id: row.subcategory_id || '',
    amount: Number(row.amount || 0),
    currency: row.currency || 'THB',
    exchange_rate: Number(row.exchange_rate || 1),
    to_amount: (row.to_amount !== '' && row.to_amount !== null && row.to_amount !== undefined)
      ? Number(row.to_amount)
      : Number(row.amount || 0),
    merchant: row.merchant || '',
    description: row.description || '',
    tags: row.tags ? String(row.tags).split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [],
    tags_raw: row.tags || '',
    receipt_url: row.receipt_url || '',
    reference_tx_id: row.reference_tx_id || '',
    recurring_id: row.recurring_id || '',
    import_id: row.import_id || '',
    idempotency_key: row.idempotency_key || '',
    dedup_hash: row.dedup_hash || '',
    status: row.status || 'posted',
    revision: Number(row.revision || 1),
    edit_history: editHistory,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Lists transactions with search, multi-field filtering, sorting, and pagination.
 */
function handleTransactionsList(ctx, params) {
  const userId = ctx.user.user_id;
  const p = params || {};

  const search = optionalString(p.search, 120).toLowerCase();
  const txType = optionalString(p.tx_type, 30);
  const accountId = optionalString(p.account_id, 64);
  const categoryId = optionalString(p.category_id, 64);
  const currency = optionalString(p.currency, 10).toUpperCase();
  const statusFilter = optionalString(p.status, 20) || 'ALL_ACTIVE'; // 'posted', 'voided', 'ALL', 'ALL_ACTIVE'
  const startDate = optionalString(p.start_date, 10);
  const endDate = optionalString(p.end_date, 10);
  const tagFilter = optionalString(p.tag, 50).toLowerCase();

  const sortBy = optionalString(p.sort_by, 30) || 'tx_date';
  const sortDir = (optionalString(p.sort_dir, 10) || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const page = Math.max(1, parseInt(p.page || 1, 10));
  const pageSize = Math.min(APP_CONFIG.MAX_PAGE_SIZE, Math.max(1, parseInt(p.page_size || APP_CONFIG.DEFAULT_PAGE_SIZE, 10)));

  const allRows = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
  const filtered = [];

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (r.user_id !== userId) continue;

    const st = r.status || 'posted';
    if (statusFilter === 'ALL_ACTIVE' && st === 'voided') continue;
    if (statusFilter !== 'ALL' && statusFilter !== 'ALL_ACTIVE' && st !== statusFilter) continue;

    const dStr = String(r.tx_date || '').substring(0, 10);
    if (startDate && dStr < startDate) continue;
    if (endDate && dStr > endDate) continue;
    if (txType && r.tx_type !== txType) continue;
    if (accountId && r.account_id !== accountId && r.to_account_id !== accountId) continue;
    if (categoryId && r.category_id !== categoryId && r.subcategory_id !== categoryId) continue;
    if (currency && String(r.currency || '').toUpperCase() !== currency) continue;
    if (tagFilter && String(r.tags || '').toLowerCase().indexOf(tagFilter) === -1) continue;

    if (search) {
      const hay = [
        r.merchant,
        r.description,
        r.tags,
        r.transaction_id,
        String(r.amount)
      ].join(' ').toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }

    filtered.push(normalizeTransaction(r));
  }

  filtered.sort(function(a, b) {
    if (sortBy === 'amount') {
      return (a.amount - b.amount) * sortDir;
    }
    if (sortBy === 'merchant') {
      return String(a.merchant).localeCompare(String(b.merchant)) * sortDir;
    }
    // Default sort by tx_date + tx_time + created_at
    const ka = a.tx_date + ' ' + a.tx_time + ' ' + a.created_at;
    const kb = b.tx_date + ' ' + b.tx_time + ' ' + b.created_at;
    return ka.localeCompare(kb) * sortDir;
  });

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const offset = (page - 1) * pageSize;
  const items = filtered.slice(offset, offset + pageSize);

  return {
    transactions: items,
    pagination: {
      page: page,
      page_size: pageSize,
      total_count: totalCount,
      total_pages: totalPages
    }
  };
}

/**
 * Creates a new transaction with strict validation, duplicate protection, and balance recalculation.
 */
function handleTransactionsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const txType = requireEnum(params.tx_type, ALLOWED_TX_TYPES, 'ประเภทธุรกรรม (tx_type)');
    const txDate = requireDateStr(params.tx_date, 'วันที่ทำรายการ (tx_date)');
    const txTime = optionalString(params.tx_time, 10) || '12:00';
    const accountId = requireString(params.account_id, 'บัญชีต้นทาง (account_id)', 64);
    const toAccountId = txType === 'transfer'
      ? requireString(params.to_account_id, 'บัญชีปลายทาง (to_account_id)', 64)
      : '';

    if (txType === 'transfer' && accountId === toAccountId) {
      throw createAppError('VALIDATION_ERROR', 'บัญชีต้นทางและบัญชีปลายทางของการโอนเงินต้องไม่เป็นบัญชีเดียวกัน', 400);
    }

    // For adjustment, amount can be negative or positive (non-zero). For others, strictly positive.
    const amount = requireNumber(
      params.amount,
      'จำนวนเงิน (amount)',
      txType === 'adjustment',
      false
    );

    const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
    let sourceAcc = null;
    let destAcc = null;
    for (let i = 0; i < allAccounts.length; i++) {
      if (allAccounts[i].user_id !== userId) continue;
      if (allAccounts[i].account_id === accountId) sourceAcc = allAccounts[i];
      if (toAccountId && allAccounts[i].account_id === toAccountId) destAcc = allAccounts[i];
    }

    if (!sourceAcc) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีต้นทางที่ระบุ หรือไม่มีสิทธิ์เข้าถึง', 404);
    }
    if (txType === 'transfer' && !destAcc) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีปลายทางที่ระบุ หรือไม่มีสิทธิ์เข้าถึง', 404);
    }

    const categoryId = txType === 'transfer'
      ? (optionalString(params.category_id, 64) || 'cat_trf_internal')
      : (txType === 'adjustment'
        ? (optionalString(params.category_id, 64) || 'cat_adj_reconcile')
        : requireString(params.category_id, 'หมวดหมู่หลัก (category_id)', 64));
    const subcategoryId = optionalString(params.subcategory_id, 64);
    const merchant = optionalString(params.merchant, 150);
    const description = optionalString(params.description, 500);
    const tags = Array.isArray(params.tags)
      ? params.tags.join(',')
      : optionalString(params.tags, 250);
    const receiptUrl = optionalString(params.receipt_url, 500);
    const referenceTxId = optionalString(params.reference_tx_id, 64);
    const exchangeRate = params.exchange_rate ? requireNumber(params.exchange_rate, 'อัตราแลกเปลี่ยน', false, false) : 1;
    const toAmount = (txType === 'transfer' && params.to_amount)
      ? requireNumber(params.to_amount, 'จำนวนเงินเข้าบัญชีปลายทาง (to_amount)', false, false)
      : amount;

    const idempotencyKey = optionalString(params.idempotency_key, 100);
    const dedupHash = computeTxDedupHash(userId, txDate, txType, accountId, amount, merchant || description);
    const allowDuplicate = toBoolean(params.allow_duplicate, false);

    // Check idempotency key and duplicate detection against existing user transactions
    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    for (let i = allTxs.length - 1; i >= 0; i--) {
      const existing = allTxs[i];
      if (existing.user_id !== userId) continue;
      if (idempotencyKey && existing.idempotency_key === idempotencyKey) {
        return {
          transaction: normalizeTransaction(existing),
          idempotent_replay: true
        };
      }
      if (!allowDuplicate && existing.status === 'posted' && existing.dedup_hash === dedupHash) {
        // Check if created within last 2 minutes with exact same hash
        const createdDiffMs = Date.now() - new Date(existing.created_at).getTime();
        if (createdDiffMs < 120000) {
          throw createAppError(
            'DUPLICATE_TRANSACTION',
            'ตรวจพบรายการซ้ำกับรายการที่เพิ่งบันทึกเมื่อสักครู่ หากต้องการบันทึกซ้ำกรุณายืนยันอีกครั้ง',
            409,
            { existing_transaction_id: existing.transaction_id }
          );
        }
      }
    }

    const now = nowIso();
    const txId = generateId('txn');
    const initialHistory = [{
      revision: 1,
      action: 'created',
      timestamp: now,
      amount: amount,
      tx_type: txType,
      account_id: accountId
    }];

    const newTx = {
      transaction_id: txId,
      user_id: userId,
      tx_date: txDate,
      tx_time: txTime,
      tx_type: txType,
      account_id: accountId,
      to_account_id: toAccountId,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      amount: amount,
      currency: sourceAcc.currency || 'THB',
      exchange_rate: exchangeRate,
      to_amount: toAmount,
      merchant: merchant,
      description: description,
      tags: tags,
      receipt_url: receiptUrl,
      reference_tx_id: referenceTxId,
      recurring_id: optionalString(params.recurring_id, 64),
      import_id: optionalString(params.import_id, 64),
      idempotency_key: idempotencyKey || ('ik_' + txId),
      dedup_hash: dedupHash,
      status: optionalString(params.status, 20) || 'posted',
      revision: 1,
      edit_history_json: JSON.stringify(initialHistory),
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.TRANSACTIONS, newTx);
    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'transactions.create', 'Transactions', txId, 'สร้างรายการ ' + txType + ' จำนวน ' + amount + ' ' + newTx.currency, {
      tx_type: txType,
      amount: amount,
      account_id: accountId,
      to_account_id: toAccountId
    });

    return {
      transaction: normalizeTransaction(newTx),
      accounts: updatedAccounts
    };
  });
}

/**
 * Updates an existing transaction and records a revision snapshot in `edit_history_json`.
 */
function handleTransactionsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const txId = requireString(params.transaction_id, 'รหัสธุรกรรม (transaction_id)', 64);

    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    let target = null;
    for (let i = 0; i < allTxs.length; i++) {
      if (allTxs[i].transaction_id === txId && allTxs[i].user_id === userId) {
        target = allTxs[i];
        break;
      }
    }

    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการธุรกรรมที่ต้องการแก้ไข', 404);
    }

    const previousSnapshot = {
      tx_date: target.tx_date,
      tx_type: target.tx_type,
      account_id: target.account_id,
      to_account_id: target.to_account_id,
      category_id: target.category_id,
      amount: Number(target.amount),
      merchant: target.merchant,
      description: target.description,
      status: target.status
    };

    if (params.tx_type !== undefined) {
      target.tx_type = requireEnum(params.tx_type, ALLOWED_TX_TYPES, 'ประเภทธุรกรรม');
    }
    if (params.tx_date !== undefined) {
      target.tx_date = requireDateStr(params.tx_date, 'วันที่ทำรายการ');
    }
    if (params.tx_time !== undefined) {
      target.tx_time = optionalString(params.tx_time, 10) || target.tx_time;
    }
    if (params.account_id !== undefined) {
      target.account_id = requireString(params.account_id, 'บัญชีต้นทาง', 64);
    }
    if (params.to_account_id !== undefined) {
      target.to_account_id = optionalString(params.to_account_id, 64);
    }
    if (target.tx_type === 'transfer') {
      if (!target.to_account_id) {
        throw createAppError('VALIDATION_ERROR', 'การโอนเงินต้องระบุบัญชีปลายทาง', 400);
      }
      if (target.account_id === target.to_account_id) {
        throw createAppError('VALIDATION_ERROR', 'บัญชีต้นทางและปลายทางต้องไม่ซ้ำกัน', 400);
      }
    }
    if (params.category_id !== undefined) {
      target.category_id = optionalString(params.category_id, 64);
    }
    if (params.subcategory_id !== undefined) {
      target.subcategory_id = optionalString(params.subcategory_id, 64);
    }
    if (params.amount !== undefined) {
      target.amount = requireNumber(params.amount, 'จำนวนเงิน', target.tx_type === 'adjustment', false);
      if (params.to_amount === undefined) {
        target.to_amount = target.amount;
      }
    }
    if (params.to_amount !== undefined) {
      target.to_amount = requireNumber(params.to_amount, 'จำนวนเงินปลายทาง', false, false);
    }
    if (params.merchant !== undefined) {
      target.merchant = optionalString(params.merchant, 150);
    }
    if (params.description !== undefined) {
      target.description = optionalString(params.description, 500);
    }
    if (params.tags !== undefined) {
      target.tags = Array.isArray(params.tags) ? params.tags.join(',') : optionalString(params.tags, 250);
    }
    if (params.receipt_url !== undefined) {
      target.receipt_url = optionalString(params.receipt_url, 500);
    }
    if (params.reference_tx_id !== undefined) {
      target.reference_tx_id = optionalString(params.reference_tx_id, 64);
    }

    const now = nowIso();
    const nextRevision = Number(target.revision || 1) + 1;
    let history = [];
    try {
      history = target.edit_history_json ? JSON.parse(target.edit_history_json) : [];
    } catch (e) {
      history = [];
    }

    history.push({
      revision: nextRevision,
      action: 'updated',
      timestamp: now,
      reason: optionalString(params.edit_reason, 200) || 'แก้ไขข้อมูลธุรกรรม',
      previous: previousSnapshot
    });

    target.revision = nextRevision;
    target.dedup_hash = computeTxDedupHash(userId, target.tx_date, target.tx_type, target.account_id, target.amount, target.merchant || target.description);
    target.edit_history_json = JSON.stringify(history);
    target.updated_at = now;

    updateSheetRowByIndex(SHEET_NAMES.TRANSACTIONS, target._rowIndex, target);
    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'transactions.update', 'Transactions', txId, 'แก้ไขรายการธุรกรรม (Rev ' + nextRevision + ')', {
      previous: previousSnapshot
    });

    return {
      transaction: normalizeTransaction(target),
      accounts: updatedAccounts
    };
  });
}

/**
 * Voids (cancels) or restores a transaction while preserving full audit history.
 */
function handleTransactionsVoid(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const txId = requireString(params.transaction_id, 'รหัสธุรกรรม (transaction_id)', 64);
    const reason = optionalString(params.reason, 250) || 'ยกเลิกรายการโดยผู้ใช้';
    const restore = toBoolean(params.restore, false);

    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    let target = null;
    for (let i = 0; i < allTxs.length; i++) {
      if (allTxs[i].transaction_id === txId && allTxs[i].user_id === userId) {
        target = allTxs[i];
        break;
      }
    }

    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการธุรกรรมที่ระบุ', 404);
    }

    const now = nowIso();
    const nextRevision = Number(target.revision || 1) + 1;
    let history = [];
    try {
      history = target.edit_history_json ? JSON.parse(target.edit_history_json) : [];
    } catch (e) {
      history = [];
    }

    const newStatus = restore ? 'posted' : 'voided';
    history.push({
      revision: nextRevision,
      action: restore ? 'restored' : 'voided',
      timestamp: now,
      reason: reason,
      previous_status: target.status
    });

    target.status = newStatus;
    target.revision = nextRevision;
    target.edit_history_json = JSON.stringify(history);
    target.updated_at = now;

    updateSheetRowByIndex(SHEET_NAMES.TRANSACTIONS, target._rowIndex, target);
    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);

    writeAuditLog(ctx, restore ? 'transactions.restore' : 'transactions.void', 'Transactions', txId, (restore ? 'กู้คืนรายการ: ' : 'ยกเลิกรายการ: ') + reason, {});

    return {
      transaction: normalizeTransaction(target),
      accounts: updatedAccounts
    };
  });
}

/**
 * Previews CSV import rows, performs auto-category matching and duplicate detection against existing transactions.
 */
function handleTransactionsImportPreview(ctx, params) {
  const userId = ctx.user.user_id;
  const accountId = requireString(params.account_id, 'บัญชีที่นำเข้า (account_id)', 64);
  const rows = params.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createAppError('VALIDATION_ERROR', 'ไม่พบข้อมูลแถว CSV สำหรับตรวจสอบ', 400);
  }
  if (rows.length > 500) {
    throw createAppError('VALIDATION_ERROR', 'รองรับการนำเข้าสูงสุดไม่เกิน 500 รายการต่อครั้ง', 400);
  }

  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
  const existingHashes = {};
  for (let i = 0; i < allTxs.length; i++) {
    const t = allTxs[i];
    if (t.user_id === userId && t.status === 'posted' && t.dedup_hash) {
      existingHashes[t.dedup_hash] = t.transaction_id;
    }
  }

  const categories = handleCategoriesList(ctx, {}).categories;
  const previewItems = [];
  let duplicateCount = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const txDate = String(r.tx_date || r.date || '').trim();
    const rawType = String(r.tx_type || r.type || 'expense').trim().toLowerCase();
    const txType = ALLOWED_TX_TYPES.indexOf(rawType) !== -1 ? rawType : 'expense';
    const amount = Math.abs(Number(r.amount || 0));
    const merchant = String(r.merchant || r.payee || '').trim();
    const description = String(r.description || r.note || '').trim();
    let categoryId = String(r.category_id || '').trim();

    // Auto-match category by name or keyword if not provided
    if (!categoryId) {
      const text = (merchant + ' ' + description).toLowerCase();
      if (text.indexOf('7-eleven') !== -1 || text.indexOf('food') !== -1 || text.indexOf('grabfood') !== -1 || text.indexOf('อาหาร') !== -1 || text.indexOf('กาแฟ') !== -1) {
        categoryId = 'cat_exp_food';
      } else if (text.indexOf('bts') !== -1 || text.indexOf('mrt') !== -1 || text.indexOf('ptt') !== -1 || text.indexOf('shell') !== -1 || text.indexOf('เดินทาง') !== -1) {
        categoryId = 'cat_exp_transport';
      } else if (text.indexOf('salary') !== -1 || text.indexOf('เงินเดือน') !== -1) {
        categoryId = 'cat_inc_salary';
      } else {
        categoryId = txType === 'income' ? 'cat_inc_other' : 'cat_exp_shopping';
      }
    }

    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) errors.push('รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
    if (!amount || isNaN(amount) || amount <= 0) errors.push('จำนวนเงินต้องมากกว่า 0');

    const dedupHash = computeTxDedupHash(userId, txDate, txType, accountId, amount, merchant || description);
    const isDuplicate = Boolean(existingHashes[dedupHash]);

    if (errors.length > 0) {
      invalidCount++;
    } else if (isDuplicate) {
      duplicateCount++;
    } else {
      validCount++;
    }

    previewItems.push({
      row_number: i + 1,
      tx_date: txDate,
      tx_time: String(r.tx_time || '12:00').substring(0, 5),
      tx_type: txType,
      account_id: accountId,
      category_id: categoryId,
      amount: amount,
      merchant: merchant,
      description: description,
      tags: String(r.tags || 'csv-import'),
      dedup_hash: dedupHash,
      is_duplicate: isDuplicate,
      existing_transaction_id: existingHashes[dedupHash] || null,
      is_valid: errors.length === 0,
      errors: errors
    });
  }

  return {
    summary: {
      total_rows: rows.length,
      valid_rows: validCount,
      duplicate_rows: duplicateCount,
      invalid_rows: invalidCount
    },
    items: previewItems
  };
}

/**
 * Commits validated CSV import rows in a single batch write and records Import_History.
 */
function handleTransactionsImportCommit(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const accountId = requireString(params.account_id, 'รหัสบัญชี (account_id)', 64);
    const fileName = optionalString(params.file_name, 150) || 'statement_import.csv';
    const skipDuplicates = toBoolean(params.skip_duplicates, true);
    const items = params.items;

    if (!Array.isArray(items) || items.length === 0) {
      throw createAppError('VALIDATION_ERROR', 'ไม่มีรายการสำหรับนำเข้า', 400);
    }

    const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
    let targetAcc = null;
    for (let i = 0; i < allAccounts.length; i++) {
      if (allAccounts[i].account_id === accountId && allAccounts[i].user_id === userId) {
        targetAcc = allAccounts[i];
        break;
      }
    }
    if (!targetAcc) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีที่ต้องการนำเข้าข้อมูล', 404);
    }

    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    const existingHashes = {};
    for (let i = 0; i < allTxs.length; i++) {
      const t = allTxs[i];
      if (t.user_id === userId && t.status === 'posted' && t.dedup_hash) {
        existingHashes[t.dedup_hash] = true;
      }
    }

    const now = nowIso();
    const importId = generateId('imp');
    const toInsert = [];
    let skippedDuplicates = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const txDate = requireDateStr(item.tx_date, 'วันที่ในแถวที่ ' + (i + 1));
      const txType = requireEnum(item.tx_type || 'expense', ALLOWED_TX_TYPES, 'ประเภทธุรกรรม');
      const amount = requireNumber(item.amount, 'จำนวนเงินในแถวที่ ' + (i + 1), txType === 'adjustment', false);
      const merchant = optionalString(item.merchant, 150);
      const description = optionalString(item.description, 500);
      const dedupHash = computeTxDedupHash(userId, txDate, txType, accountId, amount, merchant || description);

      if (skipDuplicates && existingHashes[dedupHash]) {
        skippedDuplicates++;
        continue;
      }

      existingHashes[dedupHash] = true;
      const txId = generateId('txn');
      toInsert.push({
        transaction_id: txId,
        user_id: userId,
        tx_date: txDate,
        tx_time: optionalString(item.tx_time, 10) || '12:00',
        tx_type: txType,
        account_id: accountId,
        to_account_id: optionalString(item.to_account_id, 64),
        category_id: optionalString(item.category_id, 64) || (txType === 'income' ? 'cat_inc_other' : 'cat_exp_shopping'),
        subcategory_id: optionalString(item.subcategory_id, 64),
        amount: amount,
        currency: targetAcc.currency || 'THB',
        exchange_rate: 1,
        to_amount: amount,
        merchant: merchant,
        description: description,
        tags: optionalString(item.tags, 200) || 'csv-import',
        receipt_url: '',
        reference_tx_id: '',
        recurring_id: '',
        import_id: importId,
        idempotency_key: 'imp_' + importId + '_' + i,
        dedup_hash: dedupHash,
        status: 'posted',
        revision: 1,
        edit_history_json: JSON.stringify([{ revision: 1, action: 'imported_csv', import_id: importId, timestamp: now }]),
        created_at: now,
        updated_at: now
      });
    }

    if (toInsert.length > 0) {
      batchAppendObjects(SHEET_NAMES.TRANSACTIONS, toInsert);
    }

    const importRecord = {
      import_id: importId,
      user_id: userId,
      source_type: 'csv_upload',
      file_name: fileName,
      account_id: accountId,
      total_rows: items.length,
      imported_rows: toInsert.length,
      skipped_duplicates: skippedDuplicates,
      status: 'completed',
      created_at: now
    };
    appendSheetObject(SHEET_NAMES.IMPORT_HISTORY, importRecord);

    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'transactions.importCsvCommit', 'Import_History', importId, 'นำเข้า CSV สำเร็จ ' + toInsert.length + ' รายการ (ข้ามซ้ำ ' + skippedDuplicates + ')', importRecord);

    return {
      import_record: importRecord,
      imported_count: toInsert.length,
      skipped_duplicates: skippedDuplicates,
      accounts: updatedAccounts
    };
  });
}



/** --- FILE: BudgetService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: BudgetService.gs (Phase 2 - Module D)
 * Description: Manages daily, weekly, monthly, and yearly budgets (overall & category-specific),
 *              real-time spent/remaining calculation, alert thresholds, rollover calculation,
 *              and Budget vs Actual comparison.
 */

const ALLOWED_BUDGET_PERIODS = ['daily', 'weekly', 'monthly', 'yearly'];

/**
 * Computes the date window [start, end] for a given budget period relative to a reference date (YYYY-MM-DD).
 */
function getBudgetPeriodWindow(periodType, refDateStr) {
  const parts = String(refDateStr || Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd')).split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10); // 1..12
  const d = parseInt(parts[2], 10);
  const pad2 = function(n) { return ('0' + n).slice(-2); };

  if (periodType === 'daily') {
    const dayStr = y + '-' + pad2(m) + '-' + pad2(d);
    return { start_date: dayStr, end_date: dayStr };
  }
  if (periodType === 'weekly') {
    const dt = new Date(Date.UTC(y, m - 1, d));
    const dow = dt.getUTCDay(); // 0=Sun..6=Sat -> make Monday start of week
    const diffToMon = (dow === 0) ? -6 : (1 - dow);
    const mon = new Date(dt.getTime() + diffToMon * 86400000);
    const sun = new Date(mon.getTime() + 6 * 86400000);
    const fmt = function(x) {
      return x.getUTCFullYear() + '-' + pad2(x.getUTCMonth() + 1) + '-' + pad2(x.getUTCDate());
    };
    return { start_date: fmt(mon), end_date: fmt(sun) };
  }
  if (periodType === 'yearly') {
    return { start_date: y + '-01-01', end_date: y + '-12-31' };
  }
  // Default: monthly
  const lastDay = new Date(y, m, 0).getDate();
  return {
    start_date: y + '-' + pad2(m) + '-01',
    end_date: y + '-' + pad2(m) + '-' + pad2(lastDay)
  };
}

/**
 * Lists all budgets for the user with real-time spent, remaining, percentage, alert status, and Budget vs Actual breakdown.
 */
function handleBudgetsList(ctx, params) {
  const userId = ctx.user.user_id;
  const p = params || {};
  const refDate = optionalString(p.reference_date, 10) || Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
  const includeInactive = toBoolean(p.include_inactive, false);

  const categories = handleCategoriesList(ctx, { include_inactive: true }).categories;
  const catMap = {};
  categories.forEach(function(c) { catMap[c.category_id] = c; });

  const allBudgets = readSheetObjects(SHEET_NAMES.BUDGETS).filter(function(b) {
    if (b.user_id !== userId) return false;
    const active = toBoolean(b.is_active, true);
    return includeInactive || active;
  });

  const userTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS).filter(function(tx) {
    return tx.user_id === userId && tx.status === 'posted';
  });

  const enrichedBudgets = allBudgets.map(function(b) {
    const periodType = b.period_type || 'monthly';
    const win = getBudgetPeriodWindow(periodType, refDate);
    const effectiveStart = (b.start_date && String(b.start_date) > win.start_date) ? String(b.start_date) : win.start_date;
    const effectiveEnd = (b.end_date && String(b.end_date) < win.end_date) ? String(b.end_date) : win.end_date;

    const baseLimit = Number(b.amount_limit || 0);
    const rolloverAmt = toBoolean(b.rollover_enabled, false) ? Number(b.rollover_amount || 0) : 0;
    const totalEffectiveLimit = Math.round((baseLimit + rolloverAmt) * 100) / 100;
    const catId = b.category_id || 'ALL';

    let grossExpense = 0;
    let refunds = 0;
    for (let i = 0; i < userTxs.length; i++) {
      const tx = userTxs[i];
      const d = String(tx.tx_date || '').substring(0, 10);
      if (d < effectiveStart || d > effectiveEnd) continue;
      if (catId !== 'ALL' && tx.category_id !== catId && tx.subcategory_id !== catId) continue;

      const amt = Number(tx.amount || 0);
      if (tx.tx_type === 'expense') grossExpense += amt;
      else if (tx.tx_type === 'refund') refunds += amt;
    }

    const actualSpent = Math.round(Math.max(0, grossExpense - refunds) * 100) / 100;
    const remaining = Math.round((totalEffectiveLimit - actualSpent) * 100) / 100;
    const usedPct = totalEffectiveLimit > 0 ? Math.round((actualSpent / totalEffectiveLimit) * 10000) / 100 : 0;
    const threshold = Number(b.alert_threshold_pct || 80);

    let alertStatus = 'normal';
    if (usedPct >= 100) alertStatus = 'exceeded';
    else if (usedPct >= threshold) alertStatus = 'warning';

    const catObj = catMap[catId];
    return {
      budget_id: b.budget_id,
      user_id: b.user_id,
      budget_name: b.budget_name,
      period_type: periodType,
      category_id: catId,
      category_name: catId === 'ALL' ? 'งบรวมทุกหมวดหมู่ (Overall)' : ((catObj && catObj.category_name) || catId),
      category_color: catId === 'ALL' ? '#2563EB' : ((catObj && catObj.color) || '#64748B'),
      amount_limit: baseLimit,
      rollover_enabled: toBoolean(b.rollover_enabled, false),
      rollover_amount: rolloverAmt,
      effective_limit: totalEffectiveLimit,
      spent_amount: actualSpent,
      remaining_amount: remaining,
      used_percentage: usedPct,
      alert_threshold_pct: threshold,
      alert_status: alertStatus,
      period_window: win,
      currency: b.currency || ctx.user.base_currency || 'THB',
      start_date: b.start_date || win.start_date,
      end_date: b.end_date || '',
      is_active: toBoolean(b.is_active, true),
      created_at: b.created_at,
      updated_at: b.updated_at
    };
  });

  return {
    reference_date: refDate,
    budgets: enrichedBudgets
  };
}

/**
 * Creates a new budget.
 */
function handleBudgetsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const budgetName = requireString(params.budget_name, 'ชื่องบประมาณ (budget_name)', 100);
    const periodType = requireEnum(params.period_type || 'monthly', ALLOWED_BUDGET_PERIODS, 'รอบงบประมาณ (period_type)');
    const categoryId = optionalString(params.category_id, 64) || 'ALL';
    const amountLimit = requireNumber(params.amount_limit, 'วงเงินงบประมาณ (amount_limit)', false, false);
    const currency = (optionalString(params.currency, 10) || ctx.user.base_currency || 'THB').toUpperCase();
    const startDate = optionalString(params.start_date, 10);
    const endDate = optionalString(params.end_date, 10);
    const rolloverEnabled = toBoolean(params.rollover_enabled, false);
    const rolloverAmount = params.rollover_amount ? requireNumber(params.rollover_amount, 'ยอดยกมา (rollover_amount)', true, true) : 0;
    const alertThreshold = params.alert_threshold_pct ? requireNumber(params.alert_threshold_pct, 'เกณฑ์แจ้งเตือน (%)', false, false) : 80;

    const now = nowIso();
    const newBudget = {
      budget_id: generateId('bdg'),
      user_id: userId,
      budget_name: budgetName,
      period_type: periodType,
      category_id: categoryId,
      amount_limit: amountLimit,
      currency: currency,
      start_date: startDate,
      end_date: endDate,
      rollover_enabled: rolloverEnabled ? 'TRUE' : 'FALSE',
      rollover_amount: rolloverAmount,
      alert_threshold_pct: alertThreshold,
      is_active: 'TRUE',
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.BUDGETS, newBudget);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'budgets.create', 'Budgets', newBudget.budget_id, 'สร้างงบประมาณ: ' + budgetName + ' (' + amountLimit + ' ' + currency + ')', newBudget);

    const listRes = handleBudgetsList(ctx, {});
    const enriched = listRes.budgets.filter(function(x) { return x.budget_id === newBudget.budget_id; })[0];
    return { budget: enriched || newBudget };
  });
}

/**
 * Updates an existing budget or processes rollover from previous period.
 */
function handleBudgetsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const budgetId = requireString(params.budget_id, 'รหัสงบประมาณ (budget_id)', 64);

    const allRows = readSheetObjects(SHEET_NAMES.BUDGETS);
    let target = null;
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i].budget_id === budgetId && allRows[i].user_id === userId) {
        target = allRows[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบงบประมาณที่ต้องการแก้ไข', 404);
    }

    if (params.budget_name !== undefined) target.budget_name = requireString(params.budget_name, 'ชื่องบประมาณ', 100);
    if (params.period_type !== undefined) target.period_type = requireEnum(params.period_type, ALLOWED_BUDGET_PERIODS, 'รอบงบประมาณ');
    if (params.category_id !== undefined) target.category_id = optionalString(params.category_id, 64) || 'ALL';
    if (params.amount_limit !== undefined) target.amount_limit = requireNumber(params.amount_limit, 'วงเงินงบประมาณ', false, false);
    if (params.rollover_enabled !== undefined) target.rollover_enabled = toBoolean(params.rollover_enabled, false) ? 'TRUE' : 'FALSE';
    if (params.rollover_amount !== undefined) target.rollover_amount = requireNumber(params.rollover_amount, 'ยอดยกมา', true, true);
    if (params.alert_threshold_pct !== undefined) target.alert_threshold_pct = requireNumber(params.alert_threshold_pct, 'เกณฑ์แจ้งเตือน (%)', false, false);
    if (params.is_active !== undefined) target.is_active = toBoolean(params.is_active, true) ? 'TRUE' : 'FALSE';

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.BUDGETS, target._rowIndex, target);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'budgets.update', 'Budgets', budgetId, 'แก้ไขงบประมาณ: ' + target.budget_name, {});

    const listRes = handleBudgetsList(ctx, { include_inactive: true });
    const enriched = listRes.budgets.filter(function(x) { return x.budget_id === budgetId; })[0];
    return { budget: enriched || target };
  });
}

/**
 * Deletes (deactivates) a budget.
 */
function handleBudgetsDelete(ctx, params) {
  return handleBudgetsUpdate(ctx, {
    budget_id: params.budget_id,
    is_active: false
  });
}


/** --- FILE: GoalService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: GoalService.gs (Phase 2 - Module E)
 * Description: Manages multiple Savings Goals, calculates required monthly savings,
 *              estimates completion time based on real contribution velocity,
 *              and records deposit/withdraw history in Goal_Contributions.
 */

const ALLOWED_GOAL_PRIORITIES = ['high', 'medium', 'low'];
const ALLOWED_GOAL_STATUSES = ['active', 'completed', 'paused', 'cancelled'];
const ALLOWED_CONTRIBUTION_TYPES = ['deposit', 'withdraw'];

/**
 * Enriches a goal row with calculated progress, required monthly savings, estimated completion date, and contributions.
 */
function enrichGoal(row, contributions) {
  const targetAmt = Math.max(0, Number(row.target_amount || 0));
  // Recalculate current_amount from contributions if any exist, otherwise use row.current_amount
  let computedCurrent = Number(row.current_amount || 0);
  if (contributions && contributions.length > 0) {
    let sum = 0;
    for (let i = 0; i < contributions.length; i++) {
      const c = contributions[i];
      const amt = Number(c.amount || 0);
      if (c.entry_type === 'deposit') sum += amt;
      else if (c.entry_type === 'withdraw') sum -= amt;
    }
    computedCurrent = Math.max(0, Math.round(sum * 100) / 100);
  }

  const remainingAmt = Math.max(0, Math.round((targetAmt - computedCurrent) * 100) / 100);
  const progressPct = targetAmt > 0 ? Math.min(100, Math.round((computedCurrent / targetAmt) * 10000) / 100) : 0;

  const today = new Date();
  const targetDateStr = String(row.target_date || '').substring(0, 10);
  let monthsRemaining = 0;
  let daysRemaining = 0;
  let requiredMonthly = 0;

  if (targetDateStr && /^\d{4}-\d{2}-\d{2}$/.test(targetDateStr)) {
    const targetDt = new Date(targetDateStr + 'T23:59:59Z');
    const diffMs = targetDt.getTime() - today.getTime();
    daysRemaining = Math.ceil(diffMs / 86400000);
    monthsRemaining = Math.max(0.25, Math.round((daysRemaining / 30.44) * 100) / 100);
    if (remainingAmt > 0) {
      requiredMonthly = daysRemaining > 0
        ? Math.round((remainingAmt / Math.max(1, daysRemaining / 30.44)) * 100) / 100
        : remainingAmt;
    }
  }

  // Estimate completion date based on actual average monthly net contribution
  let avgMonthlyContribution = 0;
  let estimatedCompletionDate = '';
  let estimatedMonthsToComplete = null;
  let healthStatus = remainingAmt <= 0 ? 'completed' : 'on_track';

  if (contributions && contributions.length > 0) {
    const sorted = contributions.slice().sort(function(a, b) {
      return String(a.tx_date).localeCompare(String(b.tx_date));
    });
    const firstDate = new Date(String(sorted[0].tx_date).substring(0, 10) + 'T00:00:00Z');
    const elapsedMonths = Math.max(1, (today.getTime() - firstDate.getTime()) / (86400000 * 30.44));
    avgMonthlyContribution = Math.round((computedCurrent / elapsedMonths) * 100) / 100;

    if (remainingAmt <= 0) {
      estimatedCompletionDate = sorted[sorted.length - 1].tx_date;
      estimatedMonthsToComplete = 0;
    } else if (avgMonthlyContribution > 0) {
      estimatedMonthsToComplete = Math.round((remainingAmt / avgMonthlyContribution) * 10) / 10;
      const estDate = new Date(today.getTime() + estimatedMonthsToComplete * 30.44 * 86400000);
      estimatedCompletionDate = Utilities.formatDate(estDate, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
      if (targetDateStr && estimatedCompletionDate > targetDateStr) {
        healthStatus = 'at_risk';
      }
    } else {
      healthStatus = 'at_risk';
    }
  } else if (remainingAmt > 0) {
    healthStatus = (daysRemaining < 30 && progressPct < 50) ? 'at_risk' : 'needs_contribution';
  }

  return {
    goal_id: row.goal_id,
    user_id: row.user_id,
    goal_name: row.goal_name,
    target_amount: targetAmt,
    current_amount: computedCurrent,
    remaining_amount: remainingAmt,
    progress_pct: progressPct,
    currency: row.currency || 'THB',
    target_date: targetDateStr,
    days_remaining: daysRemaining,
    required_monthly_saving: requiredMonthly,
    avg_monthly_contribution: avgMonthlyContribution,
    estimated_months_to_complete: estimatedMonthsToComplete,
    estimated_completion_date: estimatedCompletionDate,
    health_status: healthStatus,
    linked_account_id: row.linked_account_id || '',
    priority: row.priority || 'medium',
    status: remainingAmt <= 0 ? 'completed' : (row.status || 'active'),
    color: row.color || '#10B981',
    icon: row.icon || 'piggy-bank',
    notes: row.notes || '',
    contributions_count: contributions ? contributions.length : 0,
    recent_contributions: contributions ? contributions.slice().reverse().slice(0, 10) : [],
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Lists all savings goals and their contribution histories for the authenticated user.
 */
function handleGoalsList(ctx, params) {
  const userId = ctx.user.user_id;
  const allGoals = readSheetObjects(SHEET_NAMES.GOALS).filter(function(g) {
    return g.user_id === userId && g.status !== 'cancelled';
  });
  const allContribs = readSheetObjects(SHEET_NAMES.GOAL_CONTRIBUTIONS).filter(function(c) {
    return c.user_id === userId;
  });

  const contribByGoal = {};
  allContribs.forEach(function(c) {
    if (!contribByGoal[c.goal_id]) contribByGoal[c.goal_id] = [];
    contribByGoal[c.goal_id].push({
      contribution_id: c.contribution_id,
      goal_id: c.goal_id,
      tx_date: String(c.tx_date || '').substring(0, 10),
      entry_type: c.entry_type,
      amount: Number(c.amount || 0),
      linked_transaction_id: c.linked_transaction_id || '',
      note: c.note || '',
      created_at: c.created_at
    });
  });

  const goals = allGoals.map(function(g) {
    return enrichGoal(g, contribByGoal[g.goal_id] || []);
  });

  return { goals: goals };
}

/**
 * Creates a new Savings Goal (and records initial deposit if `initial_amount > 0`).
 */
function handleGoalsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const goalName = requireString(params.goal_name, 'ชื่อเป้าหมายการออม (goal_name)', 100);
    const targetAmount = requireNumber(params.target_amount, 'ยอดเป้าหมาย (target_amount)', false, false);
    const initialAmount = params.initial_amount ? requireNumber(params.initial_amount, 'ยอดออมเริ่มต้น', false, true) : 0;
    const currency = (optionalString(params.currency, 10) || ctx.user.base_currency || 'THB').toUpperCase();
    const targetDate = requireDateStr(params.target_date, 'วันครบกำหนดเป้าหมาย (target_date)');
    const linkedAccountId = optionalString(params.linked_account_id, 64);
    const priority = requireEnum(params.priority || 'medium', ALLOWED_GOAL_PRIORITIES, 'ระดับความสำคัญ (priority)');
    const color = optionalString(params.color, 20) || '#10B981';
    const icon = optionalString(params.icon, 40) || 'piggy-bank';
    const notes = optionalString(params.notes, 300);

    const now = nowIso();
    const goalId = generateId('gol');
    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

    const newGoal = {
      goal_id: goalId,
      user_id: userId,
      goal_name: goalName,
      target_amount: targetAmount,
      current_amount: initialAmount,
      currency: currency,
      target_date: targetDate,
      linked_account_id: linkedAccountId,
      priority: priority,
      status: initialAmount >= targetAmount ? 'completed' : 'active',
      color: color,
      icon: icon,
      notes: notes,
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.GOALS, newGoal);

    const contribs = [];
    if (initialAmount > 0) {
      const initContrib = {
        contribution_id: generateId('gct'),
        goal_id: goalId,
        user_id: userId,
        tx_date: todayStr,
        entry_type: 'deposit',
        amount: initialAmount,
        linked_transaction_id: '',
        note: 'ยอดเงินออมเริ่มต้นเมื่อสร้างเป้าหมาย',
        created_at: now
      };
      appendSheetObject(SHEET_NAMES.GOAL_CONTRIBUTIONS, initContrib);
      contribs.push(initContrib);
    }

    invalidateUserCache(userId);
    writeAuditLog(ctx, 'goals.create', 'Goals', goalId, 'สร้างเป้าหมายการออม: ' + goalName + ' (' + targetAmount + ' ' + currency + ')', newGoal);

    return { goal: enrichGoal(newGoal, contribs) };
  });
}

/**
 * Updates an existing Savings Goal.
 */
function handleGoalsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const goalId = requireString(params.goal_id, 'รหัสเป้าหมาย (goal_id)', 64);

    const allGoals = readSheetObjects(SHEET_NAMES.GOALS);
    let target = null;
    for (let i = 0; i < allGoals.length; i++) {
      if (allGoals[i].goal_id === goalId && allGoals[i].user_id === userId) {
        target = allGoals[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบเป้าหมายการออมที่ระบุ', 404);
    }

    if (params.goal_name !== undefined) target.goal_name = requireString(params.goal_name, 'ชื่อเป้าหมาย', 100);
    if (params.target_amount !== undefined) target.target_amount = requireNumber(params.target_amount, 'ยอดเป้าหมาย', false, false);
    if (params.target_date !== undefined) target.target_date = requireDateStr(params.target_date, 'วันครบกำหนด');
    if (params.linked_account_id !== undefined) target.linked_account_id = optionalString(params.linked_account_id, 64);
    if (params.priority !== undefined) target.priority = requireEnum(params.priority, ALLOWED_GOAL_PRIORITIES, 'ระดับความสำคัญ');
    if (params.status !== undefined) target.status = requireEnum(params.status, ALLOWED_GOAL_STATUSES, 'สถานะเป้าหมาย');
    if (params.color !== undefined) target.color = optionalString(params.color, 20) || target.color;
    if (params.notes !== undefined) target.notes = optionalString(params.notes, 300);

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.GOALS, target._rowIndex, target);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'goals.update', 'Goals', goalId, 'แก้ไขเป้าหมายการออม: ' + target.goal_name, {});

    const listRes = handleGoalsList(ctx, {});
    const enriched = listRes.goals.filter(function(x) { return x.goal_id === goalId; })[0];
    return { goal: enriched };
  });
}

/**
 * Records a deposit or withdrawal contribution to a Savings Goal and updates `current_amount`.
 */
function handleGoalsContribute(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const goalId = requireString(params.goal_id, 'รหัสเป้าหมาย (goal_id)', 64);
    const entryType = requireEnum(params.entry_type || 'deposit', ALLOWED_CONTRIBUTION_TYPES, 'ประเภทรายการ (deposit/withdraw)');
    const amount = requireNumber(params.amount, 'จำนวนเงิน (amount)', false, false);
    const txDate = optionalString(params.tx_date, 10) || Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const note = optionalString(params.note, 250) || (entryType === 'deposit' ? 'เติมเงินเข้าเป้าหมายการออม' : 'ถอนเงินจากเป้าหมายการออม');

    const allGoals = readSheetObjects(SHEET_NAMES.GOALS);
    let target = null;
    for (let i = 0; i < allGoals.length; i++) {
      if (allGoals[i].goal_id === goalId && allGoals[i].user_id === userId) {
        target = allGoals[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบเป้าหมายการออมที่ระบุ', 404);
    }

    const curAmt = Number(target.current_amount || 0);
    if (entryType === 'withdraw' && amount > curAmt) {
      throw createAppError('VALIDATION_ERROR', 'จำนวนเงินที่ถอนต้องไม่เกินยอดที่ออมไว้ปัจจุบัน (' + curAmt.toFixed(2) + ')', 400);
    }

    const now = nowIso();
    const contrib = {
      contribution_id: generateId('gct'),
      goal_id: goalId,
      user_id: userId,
      tx_date: txDate,
      entry_type: entryType,
      amount: amount,
      linked_transaction_id: optionalString(params.linked_transaction_id, 64),
      note: note,
      created_at: now
    };
    appendSheetObject(SHEET_NAMES.GOAL_CONTRIBUTIONS, contrib);

    const newAmt = entryType === 'deposit'
      ? Math.round((curAmt + amount) * 100) / 100
      : Math.round(Math.max(0, curAmt - amount) * 100) / 100;

    target.current_amount = newAmt;
    if (newAmt >= Number(target.target_amount || 0)) {
      target.status = 'completed';
    } else if (target.status === 'completed') {
      target.status = 'active';
    }
    target.updated_at = now;
    updateSheetRowByIndex(SHEET_NAMES.GOALS, target._rowIndex, target);

    invalidateUserCache(userId);
    writeAuditLog(ctx, 'goals.contribute', 'Goal_Contributions', contrib.contribution_id, (entryType === 'deposit' ? 'เติมเงินออม +' : 'ถอนเงินออม -') + amount + ' เป้าหมาย: ' + target.goal_name, contrib);

    const listRes = handleGoalsList(ctx, {});
    const enriched = listRes.goals.filter(function(x) { return x.goal_id === goalId; })[0];
    return {
      contribution: contrib,
      goal: enriched
    };
  });
}


/** --- FILE: DebtService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: DebtService.gs (Phase 3 — Module G: Debts, Amortization, DTI & Credit Card Tracking)
 * Description: Manages loans/debts (Debts sheet), payment history with principal/interest split
 *              (Debt_Payments sheet), amortization schedule calculation, Debt-to-Income (DTI) ratio,
 *              and Credit Card bill payment via non-duplicate internal transfer.
 */

const ALLOWED_DEBT_TYPES = [
  'mortgage',
  'auto_loan',
  'personal_loan',
  'credit_card_debt',
  'student_loan',
  'business_loan',
  'other'
];

const ALLOWED_DEBT_STATUSES = ['active', 'paid_off', 'archived'];

/**
 * Lists all debts, payment histories, credit card cycle tracking, and DTI metrics for the authenticated user.
 */
function handleDebtsList(ctx, params) {
  const userId = ctx.user.user_id;
  const includeArchived = toBoolean(params && params.include_archived, false);

  const allDebts = readSheetObjects(SHEET_NAMES.DEBTS);
  const allPayments = readSheetObjects(SHEET_NAMES.DEBT_PAYMENTS);
  const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);

  // Map payments by debt_id
  const paymentsByDebt = {};
  for (let i = 0; i < allPayments.length; i++) {
    const p = allPayments[i];
    if (p.user_id !== userId) continue;
    const dId = String(p.debt_id || '');
    if (!paymentsByDebt[dId]) paymentsByDebt[dId] = [];
    paymentsByDebt[dId].push(normalizeDebtPayment(p));
  }

  // Sort payments newest first
  Object.keys(paymentsByDebt).forEach(function(dId) {
    paymentsByDebt[dId].sort(function(a, b) {
      return String(b.payment_date).localeCompare(String(a.payment_date));
    });
  });

  // Calculate average monthly income from actual posted income transactions (last 90 days or current month)
  const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
  const currentYm = todayStr.substring(0, 7);
  let currentMonthIncome = 0;
  let totalIncomeAll = 0;
  const incomeMonths = {};

  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i];
    if (tx.user_id !== userId || tx.status !== 'posted') continue;
    if (tx.tx_type === 'income') {
      const amt = Number(tx.amount || 0);
      totalIncomeAll += amt;
      const ym = String(tx.tx_date || '').substring(0, 7);
      if (ym) incomeMonths[ym] = (incomeMonths[ym] || 0) + amt;
      if (ym === currentYm) currentMonthIncome += amt;
    }
  }

  const monthCount = Object.keys(incomeMonths).length;
  const referenceMonthlyIncome = currentMonthIncome > 0
    ? currentMonthIncome
    : (monthCount > 0 ? Math.round((totalIncomeAll / monthCount) * 100) / 100 : 0);

  // Enrich debts
  const enrichedDebts = [];
  let totalPrincipal = 0;
  let totalRemainingBalance = 0;
  let totalMinimumPayment = 0;
  let totalPaidPrincipal = 0;
  let totalPaidInterest = 0;

  for (let i = 0; i < allDebts.length; i++) {
    const d = allDebts[i];
    if (d.user_id !== userId) continue;
    if (!includeArchived && d.status === 'archived') continue;

    const payments = paymentsByDebt[d.debt_id] || [];
    const enriched = enrichDebtObject(d, payments, todayStr);
    enrichedDebts.push(enriched);

    if (enriched.status === 'active') {
      totalPrincipal += enriched.principal_amount;
      totalRemainingBalance += enriched.current_balance;
      totalMinimumPayment += enriched.minimum_payment;
    }
    totalPaidPrincipal += enriched.total_principal_paid;
    totalPaidInterest += enriched.total_interest_paid;
  }

  // Track Credit Card accounts (billing_day, due_day, utilization, statement balance)
  const creditCards = [];
  let totalCreditCardDebt = 0;
  let totalCreditCardMinPay = 0;

  for (let i = 0; i < allAccounts.length; i++) {
    const acc = allAccounts[i];
    if (acc.user_id !== userId || toBoolean(acc.is_archived, false)) continue;
    if (acc.account_type !== 'credit_card') continue;

    const curBal = Number(acc.current_balance || 0);
    const owedAmount = curBal < 0 ? Math.round(Math.abs(curBal) * 100) / 100 : 0;
    const creditLimit = Math.round(Number(acc.credit_limit || 0) * 100) / 100;
    const availableCredit = creditLimit > 0 ? Math.max(0, Math.round((creditLimit - owedAmount) * 100) / 100) : 0;
    const utilizationPct = creditLimit > 0 ? Math.round((owedAmount / creditLimit) * 10000) / 100 : 0;
    const billingDay = Number(acc.billing_day || 25);
    const dueDay = Number(acc.due_day || 10);
    const estMinPayment = owedAmount > 0 ? Math.round(Math.max(500, owedAmount * 0.10) * 100) / 100 : 0;

    totalCreditCardDebt += owedAmount;
    totalCreditCardMinPay += estMinPayment;

    creditCards.push({
      account_id: acc.account_id,
      account_name: acc.account_name,
      institution_name: acc.institution_name || '',
      currency: acc.currency || 'THB',
      current_balance: curBal,
      owed_amount: owedAmount,
      credit_limit: creditLimit,
      available_credit: availableCredit,
      utilization_pct: utilizationPct,
      billing_day: billingDay,
      due_day: dueDay,
      next_billing_date: computeNextDayOfMonthDate(todayStr, billingDay),
      next_due_date: computeNextDayOfMonthDate(todayStr, dueDay),
      estimated_minimum_payment: estMinPayment,
      status: owedAmount <= 0 ? 'paid_clear' : (utilizationPct >= 80 ? 'high_utilization' : 'statement_active')
    });
  }

  // Debt-to-Income (DTI) calculation
  const combinedMonthlyDebtService = Math.round((totalMinimumPayment + totalCreditCardMinPay) * 100) / 100;
  const dtiPct = referenceMonthlyIncome > 0
    ? Math.round((combinedMonthlyDebtService / referenceMonthlyIncome) * 10000) / 100
    : 0;
  const dtiStatus = dtiPct <= 35 ? 'healthy' : (dtiPct <= 49 ? 'moderate' : 'high_risk');

  return {
    summary: {
      active_debts_count: enrichedDebts.filter(function(x) { return x.status === 'active'; }).length,
      total_principal: Math.round(totalPrincipal * 100) / 100,
      total_remaining_balance: Math.round(totalRemainingBalance * 100) / 100,
      total_credit_card_owed: Math.round(totalCreditCardDebt * 100) / 100,
      total_combined_liability: Math.round((totalRemainingBalance + totalCreditCardDebt) * 100) / 100,
      total_minimum_payment: Math.round(totalMinimumPayment * 100) / 100,
      total_credit_card_min_payment: Math.round(totalCreditCardMinPay * 100) / 100,
      combined_monthly_debt_service: combinedMonthlyDebtService,
      reference_monthly_income: referenceMonthlyIncome,
      dti_percentage: dtiPct,
      dti_status: dtiStatus,
      total_principal_paid: Math.round(totalPaidPrincipal * 100) / 100,
      total_interest_paid: Math.round(totalPaidInterest * 100) / 100
    },
    debts: enrichedDebts,
    credit_cards: creditCards
  };
}

/**
 * Creates a new loan/debt record in the Debts sheet.
 */
function handleDebtsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const debtName = requireString(params.debt_name, 'ชื่อหนี้สิน/สินเชื่อ (debt_name)', 120);
    const debtType = requireEnum(params.debt_type || 'personal_loan', ALLOWED_DEBT_TYPES, 'ประเภทหนี้สิน (debt_type)');
    const lenderName = optionalString(params.lender_name, 120);
    const linkedAccountId = optionalString(params.linked_account_id, 64);
    const principalAmount = requireNumber(params.principal_amount, 'ยอดเงินต้นตั้งต้น (principal_amount)', false, false);
    const currentBalance = (params.current_balance !== undefined && params.current_balance !== '')
      ? requireNumber(params.current_balance, 'ยอดหนี้คงเหลือปัจจุบัน (current_balance)', false, true)
      : principalAmount;
    const interestRateAnnual = (params.interest_rate_annual !== undefined && params.interest_rate_annual !== '')
      ? requireNumber(params.interest_rate_annual, 'อัตราดอกเบี้ยต่อปี % (interest_rate_annual)', false, true)
      : 0;
    const minimumPayment = requireNumber(params.minimum_payment, 'ยอดผ่อนชำระต่อเดือน (minimum_payment)', false, false);
    const dueDay = params.due_day ? Math.min(31, Math.max(1, Math.round(Number(params.due_day)))) : 15;
    const startDate = params.start_date
      ? requireDateStr(params.start_date, 'วันเริ่มต้นสัญญา (start_date)')
      : Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const targetPayoffDate = params.target_payoff_date ? requireDateStr(params.target_payoff_date, 'วันเป้าหมายปลดหนี้') : '';

    const now = nowIso();
    const debtId = generateId('dbt');
    const newDebt = {
      debt_id: debtId,
      user_id: userId,
      debt_name: debtName,
      debt_type: debtType,
      lender_name: lenderName,
      linked_account_id: linkedAccountId,
      principal_amount: principalAmount,
      current_balance: currentBalance,
      interest_rate_annual: interestRateAnnual,
      minimum_payment: minimumPayment,
      due_day: dueDay,
      start_date: startDate,
      target_payoff_date: targetPayoffDate,
      status: currentBalance <= 0 ? 'paid_off' : 'active',
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.DEBTS, newDebt);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'debts.create', 'Debts', debtId, 'เพิ่มรายการหนี้สิน: ' + debtName + ' ยอด ' + currentBalance, {
      debt_type: debtType,
      principal_amount: principalAmount,
      current_balance: currentBalance,
      interest_rate_annual: interestRateAnnual
    });

    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    return {
      debt: enrichDebtObject(newDebt, [], todayStr)
    };
  });
}

/**
 * Updates an existing debt record.
 */
function handleDebtsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const debtId = requireString(params.debt_id, 'รหัสหนี้สิน (debt_id)', 64);

    const allDebts = readSheetObjects(SHEET_NAMES.DEBTS);
    let target = null;
    for (let i = 0; i < allDebts.length; i++) {
      if (allDebts[i].debt_id === debtId && allDebts[i].user_id === userId) {
        target = allDebts[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบข้อมูลหนี้สินที่ต้องการแก้ไข', 404);
    }

    if (params.debt_name !== undefined) target.debt_name = requireString(params.debt_name, 'ชื่อหนี้สิน', 120);
    if (params.debt_type !== undefined) target.debt_type = requireEnum(params.debt_type, ALLOWED_DEBT_TYPES, 'ประเภทหนี้สิน');
    if (params.lender_name !== undefined) target.lender_name = optionalString(params.lender_name, 120);
    if (params.linked_account_id !== undefined) target.linked_account_id = optionalString(params.linked_account_id, 64);
    if (params.principal_amount !== undefined) target.principal_amount = requireNumber(params.principal_amount, 'เงินต้น', false, false);
    if (params.current_balance !== undefined) target.current_balance = requireNumber(params.current_balance, 'ยอดคงเหลือ', false, true);
    if (params.interest_rate_annual !== undefined) target.interest_rate_annual = requireNumber(params.interest_rate_annual, 'อัตราดอกเบี้ยต่อปี', false, true);
    if (params.minimum_payment !== undefined) target.minimum_payment = requireNumber(params.minimum_payment, 'ยอดผ่อนขั้นต่ำ', false, false);
    if (params.due_day !== undefined) target.due_day = Math.min(31, Math.max(1, Math.round(Number(params.due_day))));
    if (params.target_payoff_date !== undefined) target.target_payoff_date = optionalString(params.target_payoff_date, 20);
    if (params.status !== undefined) target.status = requireEnum(params.status, ALLOWED_DEBT_STATUSES, 'สถานะหนี้สิน');

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.DEBTS, target._rowIndex, target);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'debts.update', 'Debts', debtId, 'แก้ไขข้อมูลหนี้สิน: ' + target.debt_name, {
      status: target.status,
      current_balance: target.current_balance
    });

    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    return {
      debt: enrichDebtObject(target, [], todayStr)
    };
  });
}

/**
 * Records a loan/debt installment payment (splitting principal, interest, and fee)
 * into Debt_Payments, updates remaining balance in Debts, and optionally posts an actual transaction.
 */
function handleDebtsPay(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const debtId = requireString(params.debt_id, 'รหัสหนี้สิน (debt_id)', 64);
    const paymentDate = params.payment_date
      ? requireDateStr(params.payment_date, 'วันที่ชำระ (payment_date)')
      : Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const totalAmount = requireNumber(params.total_amount, 'ยอดชำระรวม (total_amount)', false, false);

    const allDebts = readSheetObjects(SHEET_NAMES.DEBTS);
    let targetDebt = null;
    for (let i = 0; i < allDebts.length; i++) {
      if (allDebts[i].debt_id === debtId && allDebts[i].user_id === userId) {
        targetDebt = allDebts[i];
        break;
      }
    }
    if (!targetDebt) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการหนี้สินที่ต้องการชำระ', 404);
    }

    const currentBal = Number(targetDebt.current_balance || 0);
    const annualRate = Number(targetDebt.interest_rate_annual || 0);
    const defaultMonthlyInterest = Math.round((currentBal * (annualRate / 100) / 12) * 100) / 100;

    const feeAmount = (params.fee_amount !== undefined && params.fee_amount !== '')
      ? requireNumber(params.fee_amount, 'ค่าธรรมเนียม (fee_amount)', false, true)
      : 0;
    const interestPaid = (params.interest_paid !== undefined && params.interest_paid !== '')
      ? requireNumber(params.interest_paid, 'ดอกเบี้ยจ่าย (interest_paid)', false, true)
      : Math.min(totalAmount - feeAmount, defaultMonthlyInterest);
    const principalPaid = (params.principal_paid !== undefined && params.principal_paid !== '')
      ? requireNumber(params.principal_paid, 'เงินต้นที่ตัดชำระ (principal_paid)', false, true)
      : Math.max(0, Math.round((totalAmount - interestPaid - feeAmount) * 100) / 100);

    const remainingBalance = Math.max(0, Math.round((currentBal - principalPaid) * 100) / 100);
    const now = nowIso();
    let linkedTxId = optionalString(params.linked_transaction_id, 64);

    // If payment account is specified, create an actual transaction in Transactions sheet
    const paymentAccountId = optionalString(params.payment_account_id, 64);
    if (paymentAccountId && !linkedTxId) {
      // IMPORTANT: If the debt is linked to a credit_card account inside PFM, use 'transfer' to prevent double-counting expenses!
      const isCreditCardTransfer = Boolean(targetDebt.linked_account_id && targetDebt.linked_account_id !== paymentAccountId);
      const txRes = handleTransactionsCreate(ctx, {
        tx_type: isCreditCardTransfer ? 'transfer' : 'expense',
        tx_date: paymentDate,
        account_id: paymentAccountId,
        to_account_id: isCreditCardTransfer ? targetDebt.linked_account_id : '',
        category_id: isCreditCardTransfer ? 'cat_trf_internal' : 'cat_exp_debt',
        amount: totalAmount,
        merchant: targetDebt.lender_name || targetDebt.debt_name,
        description: 'ชำระหนี้ ' + targetDebt.debt_name + ' (ตัดเงินต้น ' + principalPaid + ', ดอกเบี้ย ' + interestPaid + ')',
        tags: 'debt-payment',
        allow_duplicate: true
      });
      linkedTxId = txRes.transaction.transaction_id;
    }

    const paymentId = generateId('dpm');
    const paymentRecord = {
      payment_id: paymentId,
      debt_id: debtId,
      user_id: userId,
      payment_date: paymentDate,
      total_amount: totalAmount,
      principal_paid: principalPaid,
      interest_paid: interestPaid,
      fee_amount: feeAmount,
      remaining_balance: remainingBalance,
      linked_transaction_id: linkedTxId,
      created_at: now
    };

    appendSheetObject(SHEET_NAMES.DEBT_PAYMENTS, paymentRecord);

    targetDebt.current_balance = remainingBalance;
    if (remainingBalance <= 0) {
      targetDebt.status = 'paid_off';
    }
    targetDebt.updated_at = now;
    updateSheetRowByIndex(SHEET_NAMES.DEBTS, targetDebt._rowIndex, targetDebt);

    invalidateUserCache(userId);
    writeAuditLog(ctx, 'debts.pay', 'Debt_Payments', paymentId, 'ชำระหนี้ ' + targetDebt.debt_name + ' รวม ' + totalAmount + ' (เงินต้น ' + principalPaid + ', ดอกเบี้ย ' + interestPaid + ')', {
      debt_id: debtId,
      total_amount: totalAmount,
      principal_paid: principalPaid,
      interest_paid: interestPaid,
      remaining_balance: remainingBalance
    });

    return {
      payment: normalizeDebtPayment(paymentRecord),
      debt: targetDebt
    };
  });
}

/**
 * Pays a Credit Card statement balance by recording an internal TRANSFER from a bank/cash account
 * to the credit card account — strictly preventing duplicate expense counting (Criteria #4 & Module G).
 */
function handleDebtsPayCreditCard(ctx, params) {
  const userId = ctx.user.user_id;
  const fromAccountId = requireString(params.from_account_id, 'บัญชีที่ใช้จ่ายชำระ (from_account_id)', 64);
  const creditCardAccountId = requireString(params.credit_card_account_id, 'บัญชีบัตรเครดิต (credit_card_account_id)', 64);
  const amount = requireNumber(params.amount, 'จำนวนเงินที่ชำระบัตรเครดิต (amount)', false, false);
  const paymentDate = params.payment_date
    ? requireDateStr(params.payment_date, 'วันที่ชำระบัตรเครดิต')
    : Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

  if (fromAccountId === creditCardAccountId) {
    throw createAppError('VALIDATION_ERROR', 'บัญชีต้นทางและบัญชีบัตรเครดิตต้องเป็นคนละบัญชีกัน', 400);
  }

  // Record strictly as 'transfer' so individual card purchases remain the only counted expenses
  const txRes = handleTransactionsCreate(ctx, {
    tx_type: 'transfer',
    tx_date: paymentDate,
    account_id: fromAccountId,
    to_account_id: creditCardAccountId,
    category_id: 'cat_trf_internal',
    amount: amount,
    merchant: 'ชำระยอดบัตรเครดิต (Credit Card Settlement)',
    description: optionalString(params.note, 300) || 'ชำระบิลบัตรเครดิตผ่านการโอนปิดยอด (ไม่นับรายจ่ายซ้ำ)',
    tags: 'credit-card-payment,non-duplicate-transfer',
    idempotency_key: optionalString(params.idempotency_key, 100),
    allow_duplicate: true
  });

  writeAuditLog(ctx, 'debts.payCreditCard', 'Transactions', txRes.transaction.transaction_id, 'ชำระยอดบัตรเครดิตแบบ Transfer ไม่นับรายจ่ายซ้ำ จำนวน ' + amount, {
    from_account_id: fromAccountId,
    credit_card_account_id: creditCardAccountId,
    amount: amount
  });

  return {
    transaction: txRes.transaction,
    accounts: txRes.accounts,
    non_duplicate_guarantee: 'RECORDED_AS_INTERNAL_TRANSFER_NO_EXPENSE_DOUBLE_COUNT'
  };
}

/**
 * Generates an amortization schedule for a specific debt or custom loan parameters.
 */
function handleDebtsAmortization(ctx, params) {
  const userId = ctx.user.user_id;
  let balance = Number(params.current_balance || 0);
  let annualRate = Number(params.interest_rate_annual || 0);
  let monthlyPayment = Number(params.monthly_payment || 0);
  let debtName = optionalString(params.debt_name, 120) || 'จำลองตารางผ่อนชำระ';

  if (params.debt_id) {
    const allDebts = readSheetObjects(SHEET_NAMES.DEBTS);
    for (let i = 0; i < allDebts.length; i++) {
      if (allDebts[i].debt_id === params.debt_id && allDebts[i].user_id === userId) {
        balance = Number(allDebts[i].current_balance || 0);
        annualRate = Number(allDebts[i].interest_rate_annual || 0);
        monthlyPayment = Number(params.monthly_payment || allDebts[i].minimum_payment || 0);
        debtName = allDebts[i].debt_name;
        break;
      }
    }
  }

  if (balance <= 0) {
    return {
      debt_name: debtName,
      months_to_payoff: 0,
      total_interest: 0,
      total_payment: 0,
      schedule: []
    };
  }

  const scheduleObj = computeAmortizationTable(balance, annualRate, monthlyPayment, 120);
  return {
    debt_name: debtName,
    starting_balance: balance,
    interest_rate_annual: annualRate,
    monthly_payment: monthlyPayment,
    months_to_payoff: scheduleObj.months_to_payoff,
    estimated_payoff_date: scheduleObj.estimated_payoff_date,
    total_interest: scheduleObj.total_interest,
    total_payment: scheduleObj.total_payment,
    warning: scheduleObj.warning,
    schedule: scheduleObj.schedule
  };
}

/**
 * Helper to compute amortization schedule up to maxInstallments.
 */
function computeAmortizationTable(balance, annualRatePct, monthlyPayment, maxInstallments) {
  const maxMonths = maxInstallments || 120;
  const monthlyRate = (Number(annualRatePct || 0) / 100) / 12;
  let rem = Math.round(Number(balance || 0) * 100) / 100;
  const pmt = Math.round(Number(monthlyPayment || 0) * 100) / 100;

  const firstMonthInterest = Math.round(rem * monthlyRate * 100) / 100;
  if (pmt <= firstMonthInterest && rem > 0) {
    return {
      months_to_payoff: null,
      estimated_payoff_date: null,
      total_interest: 0,
      total_payment: 0,
      warning: 'ยอดผ่อนต่อเดือนน้อยกว่าหรือเท่ากับดอกเบี้ยรายเดือน (' + firstMonthInterest + ') ทำให้เงินต้นไม่ลดลง',
      schedule: []
    };
  }

  const schedule = [];
  let totalInterest = 0;
  let totalPayment = 0;
  let monthIdx = 0;
  const baseDate = new Date();

  while (rem > 0.01 && monthIdx < maxMonths) {
    monthIdx++;
    const interest = Math.round(rem * monthlyRate * 100) / 100;
    let actualPmt = pmt;
    let principal = Math.round((actualPmt - interest) * 100) / 100;
    if (principal >= rem) {
      principal = rem;
      actualPmt = Math.round((principal + interest) * 100) / 100;
    }
    rem = Math.max(0, Math.round((rem - principal) * 100) / 100);
    totalInterest = Math.round((totalInterest + interest) * 100) / 100;
    totalPayment = Math.round((totalPayment + actualPmt) * 100) / 100;

    const d = new Date(baseDate.getFullYear(), baseDate.getMonth() + monthIdx, baseDate.getDate());
    const dateStr = Utilities.formatDate(d, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

    schedule.push({
      installment_no: monthIdx,
      estimated_date: dateStr,
      payment_amount: actualPmt,
      principal_paid: principal,
      interest_paid: interest,
      remaining_balance: rem
    });
  }

  return {
    months_to_payoff: monthIdx,
    estimated_payoff_date: schedule.length > 0 ? schedule[schedule.length - 1].estimated_date : null,
    total_interest: totalInterest,
    total_payment: totalPayment,
    warning: rem > 0.01 ? 'แสดงตารางสูงสุด ' + maxMonths + ' งวด (ยังเหลือยอดคงค้าง ' + rem + ')' : null,
    schedule: schedule
  };
}

/**
 * Enriches a raw Debt row with computed payoff进度, totals paid, and next due date.
 */
function enrichDebtObject(d, payments, todayStr) {
  const principal = Math.round(Number(d.principal_amount || 0) * 100) / 100;
  const curBal = Math.round(Number(d.current_balance || 0) * 100) / 100;
  const rate = Math.round(Number(d.interest_rate_annual || 0) * 100) / 100;
  const minPay = Math.round(Number(d.minimum_payment || 0) * 100) / 100;
  const dueDay = Number(d.due_day || 15);

  let paidPrincipal = 0;
  let paidInterest = 0;
  let paidFees = 0;
  for (let i = 0; i < payments.length; i++) {
    paidPrincipal += Number(payments[i].principal_paid || 0);
    paidInterest += Number(payments[i].interest_paid || 0);
    paidFees += Number(payments[i].fee_amount || 0);
  }

  const paidOffPct = principal > 0
    ? Math.min(100, Math.max(0, Math.round(((principal - curBal) / principal) * 10000) / 100))
    : 100;

  const amortPreview = curBal > 0 ? computeAmortizationTable(curBal, rate, minPay, 60) : { months_to_payoff: 0, estimated_payoff_date: todayStr, total_interest: 0 };

  return {
    debt_id: d.debt_id,
    debt_name: d.debt_name,
    debt_type: d.debt_type || 'personal_loan',
    lender_name: d.lender_name || '',
    linked_account_id: d.linked_account_id || '',
    principal_amount: principal,
    current_balance: curBal,
    paid_off_pct: paidOffPct,
    interest_rate_annual: rate,
    minimum_payment: minPay,
    due_day: dueDay,
    next_due_date: computeNextDayOfMonthDate(todayStr, dueDay),
    start_date: String(d.start_date || ''),
    target_payoff_date: String(d.target_payoff_date || ''),
    estimated_months_remaining: amortPreview.months_to_payoff,
    estimated_payoff_date: amortPreview.estimated_payoff_date,
    projected_remaining_interest: amortPreview.total_interest,
    total_principal_paid: Math.round(paidPrincipal * 100) / 100,
    total_interest_paid: Math.round(paidInterest * 100) / 100,
    total_fees_paid: Math.round(paidFees * 100) / 100,
    payment_count: payments.length,
    payments: payments,
    status: d.status || (curBal <= 0 ? 'paid_off' : 'active'),
    created_at: d.created_at,
    updated_at: d.updated_at
  };
}

function normalizeDebtPayment(p) {
  return {
    payment_id: p.payment_id,
    debt_id: p.debt_id,
    payment_date: String(p.payment_date || ''),
    total_amount: Math.round(Number(p.total_amount || 0) * 100) / 100,
    principal_paid: Math.round(Number(p.principal_paid || 0) * 100) / 100,
    interest_paid: Math.round(Number(p.interest_paid || 0) * 100) / 100,
    fee_amount: Math.round(Number(p.fee_amount || 0) * 100) / 100,
    remaining_balance: Math.round(Number(p.remaining_balance || 0) * 100) / 100,
    linked_transaction_id: p.linked_transaction_id || '',
    created_at: p.created_at
  };
}

function computeNextDayOfMonthDate(todayStr, dayOfMonth) {
  const parts = String(todayStr).split('-');
  const yr = Number(parts[0]);
  const mo = Number(parts[1]) - 1;
  const dy = Number(parts[2]);
  const targetDay = Math.min(28, Math.max(1, Number(dayOfMonth || 15)));
  let candidate = new Date(yr, mo, targetDay);
  if (targetDay < dy) {
    candidate = new Date(yr, mo + 1, targetDay);
  }
  return Utilities.formatDate(candidate, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
}



/** --- FILE: BillService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: BillService.gs (Phase 3 — Module G: Bills & Due Reminders + Module I: Import History)
 * Description: Manages bills (Bills sheet), due date tracking, automatic recurring bill generation on payment,
 *              and Import_History retrieval.
 */

const ALLOWED_BILL_STATUSES = ['unpaid', 'paid', 'overdue', 'cancelled'];
const ALLOWED_BILL_FREQUENCIES = ['once', 'weekly', 'monthly', 'quarterly', 'yearly'];

/**
 * Lists all bills for the authenticated user, automatically detecting overdue status and upcoming alerts.
 */
function handleBillsList(ctx, params) {
  const userId = ctx.user.user_id;
  const statusFilter = optionalString(params && params.status, 20);
  const allBills = readSheetObjects(SHEET_NAMES.BILLS);
  const allCategories = readSheetObjects(SHEET_NAMES.CATEGORIES);

  const catMap = {};
  for (let i = 0; i < allCategories.length; i++) {
    catMap[allCategories[i].category_id] = allCategories[i];
  }

  const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
  const todayTime = new Date(todayStr + 'T00:00:00').getTime();

  const bills = [];
  let unpaidTotal = 0;
  let overdueTotal = 0;
  let dueSoonTotal = 0;
  let paidThisMonthTotal = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  const currentYm = todayStr.substring(0, 7);

  for (let i = 0; i < allBills.length; i++) {
    const b = allBills[i];
    if (b.user_id !== userId) continue;

    const enriched = enrichBillObject(b, catMap, todayStr, todayTime);
    if (statusFilter && enriched.effective_status !== statusFilter) continue;

    bills.push(enriched);

    if (enriched.effective_status === 'overdue') {
      overdueTotal += enriched.amount;
      unpaidTotal += enriched.amount;
      overdueCount++;
    } else if (enriched.effective_status === 'unpaid') {
      unpaidTotal += enriched.amount;
      if (enriched.is_due_soon) {
        dueSoonTotal += enriched.amount;
        dueSoonCount++;
      }
    } else if (enriched.effective_status === 'paid' && String(enriched.due_date).substring(0, 7) === currentYm) {
      paidThisMonthTotal += enriched.amount;
    }
  }

  // Sort: overdue first, then unpaid by due_date ascending, then paid
  bills.sort(function(a, b) {
    const order = { overdue: 0, unpaid: 1, paid: 2, cancelled: 3 };
    const oa = order[a.effective_status] !== undefined ? order[a.effective_status] : 9;
    const ob = order[b.effective_status] !== undefined ? order[b.effective_status] : 9;
    if (oa !== ob) return oa - ob;
    return String(a.due_date).localeCompare(String(b.due_date));
  });

  return {
    summary: {
      total_bills: bills.length,
      unpaid_total: Math.round(unpaidTotal * 100) / 100,
      overdue_count: overdueCount,
      overdue_total: Math.round(overdueTotal * 100) / 100,
      due_soon_count: dueSoonCount,
      due_soon_total: Math.round(dueSoonTotal * 100) / 100,
      paid_this_month_total: Math.round(paidThisMonthTotal * 100) / 100
    },
    bills: bills
  };
}

/**
 * Creates a new bill reminder in the Bills sheet.
 */
function handleBillsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const billName = requireString(params.bill_name, 'ชื่อบิล/รายการแจ้งเตือน (bill_name)', 120);
    const categoryId = optionalString(params.category_id, 64) || 'cat_exp_utilities';
    const amount = requireNumber(params.amount, 'จำนวนเงินตามบิล (amount)', false, false);
    const currency = optionalString(params.currency, 10) || ctx.user.base_currency || 'THB';
    const dueDate = requireDateStr(params.due_date, 'วันครบกำหนดชำระ (due_date)');
    const isRecurring = toBoolean(params.is_recurring, false);
    const frequency = isRecurring
      ? requireEnum(params.frequency || 'monthly', ALLOWED_BILL_FREQUENCIES, 'ความถี่ของบิล (frequency)')
      : 'once';
    const remindDaysBefore = (params.remind_days_before !== undefined && params.remind_days_before !== '')
      ? Math.max(0, Math.min(60, Math.round(Number(params.remind_days_before))))
      : 3;
    const notes = optionalString(params.notes, 300);

    const now = nowIso();
    const billId = generateId('bil');
    const newBill = {
      bill_id: billId,
      user_id: userId,
      bill_name: billName,
      category_id: categoryId,
      amount: amount,
      currency: currency,
      due_date: dueDate,
      is_recurring: isRecurring,
      frequency: frequency,
      status: 'unpaid',
      remind_days_before: remindDaysBefore,
      paid_transaction_id: '',
      notes: notes,
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.BILLS, newBill);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'bills.create', 'Bills', billId, 'สร้างบิลแจ้งเตือน: ' + billName + ' ครบกำหนด ' + dueDate, {
      amount: amount,
      due_date: dueDate,
      is_recurring: isRecurring
    });

    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const todayTime = new Date(todayStr + 'T00:00:00').getTime();
    return {
      bill: enrichBillObject(newBill, {}, todayStr, todayTime)
    };
  });
}

/**
 * Updates an existing bill record.
 */
function handleBillsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const billId = requireString(params.bill_id, 'รหัสบิล (bill_id)', 64);

    const allBills = readSheetObjects(SHEET_NAMES.BILLS);
    let target = null;
    for (let i = 0; i < allBills.length; i++) {
      if (allBills[i].bill_id === billId && allBills[i].user_id === userId) {
        target = allBills[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบบิลที่ต้องการแก้ไข', 404);
    }

    if (params.bill_name !== undefined) target.bill_name = requireString(params.bill_name, 'ชื่อบิล', 120);
    if (params.category_id !== undefined) target.category_id = optionalString(params.category_id, 64);
    if (params.amount !== undefined) target.amount = requireNumber(params.amount, 'จำนวนเงิน', false, false);
    if (params.due_date !== undefined) target.due_date = requireDateStr(params.due_date, 'วันครบกำหนด');
    if (params.is_recurring !== undefined) target.is_recurring = toBoolean(params.is_recurring, false);
    if (params.frequency !== undefined) target.frequency = requireEnum(params.frequency, ALLOWED_BILL_FREQUENCIES, 'ความถี่');
    if (params.remind_days_before !== undefined) target.remind_days_before = Math.max(0, Math.round(Number(params.remind_days_before)));
    if (params.status !== undefined) target.status = requireEnum(params.status, ALLOWED_BILL_STATUSES, 'สถานะบิล');
    if (params.notes !== undefined) target.notes = optionalString(params.notes, 300);

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.BILLS, target._rowIndex, target);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'bills.update', 'Bills', billId, 'แก้ไขข้อมูลบิล: ' + target.bill_name, {
      status: target.status,
      due_date: target.due_date
    });

    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const todayTime = new Date(todayStr + 'T00:00:00').getTime();
    return {
      bill: enrichBillObject(target, {}, todayStr, todayTime)
    };
  });
}

/**
 * Marks a bill as paid, creates a real transaction in Transactions (or transfer if paying a credit card bill),
 * and automatically generates the next recurring bill if `is_recurring = true`.
 */
function handleBillsPay(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const billId = requireString(params.bill_id, 'รหัสบิล (bill_id)', 64);
    const accountId = requireString(params.account_id, 'บัญชีที่ใช้ชำระบิล (account_id)', 64);
    const paymentDate = params.payment_date
      ? requireDateStr(params.payment_date, 'วันที่ชำระบิล')
      : Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

    const allBills = readSheetObjects(SHEET_NAMES.BILLS);
    let targetBill = null;
    for (let i = 0; i < allBills.length; i++) {
      if (allBills[i].bill_id === billId && allBills[i].user_id === userId) {
        targetBill = allBills[i];
        break;
      }
    }
    if (!targetBill) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการบิลที่ต้องการชำระ', 404);
    }
    if (targetBill.status === 'paid') {
      throw createAppError('ALREADY_PAID', 'บิลรายการนี้ถูกบันทึกว่าชำระเรียบร้อยแล้ว', 409);
    }

    const payAmount = (params.amount !== undefined && params.amount !== '')
      ? requireNumber(params.amount, 'จำนวนเงินที่ชำระจริง', false, false)
      : Number(targetBill.amount || 0);

    // Optional: if this bill is a credit card statement payment, post as transfer to prevent duplicate expense
    const toCreditCardAccountId = optionalString(params.credit_card_account_id, 64);
    const isTransfer = Boolean(toCreditCardAccountId && toCreditCardAccountId !== accountId);

    const txRes = handleTransactionsCreate(ctx, {
      tx_type: isTransfer ? 'transfer' : 'expense',
      tx_date: paymentDate,
      account_id: accountId,
      to_account_id: isTransfer ? toCreditCardAccountId : '',
      category_id: isTransfer ? 'cat_trf_internal' : (targetBill.category_id || 'cat_exp_utilities'),
      amount: payAmount,
      merchant: targetBill.bill_name,
      description: 'ชำระบิล: ' + targetBill.bill_name + ' (ครบกำหนด ' + targetBill.due_date + ')',
      tags: 'bill-payment',
      idempotency_key: 'billpay_' + billId + '_' + targetBill.due_date,
      allow_duplicate: true
    });

    const now = nowIso();
    targetBill.status = 'paid';
    targetBill.paid_transaction_id = txRes.transaction.transaction_id;
    targetBill.updated_at = now;
    updateSheetRowByIndex(SHEET_NAMES.BILLS, targetBill._rowIndex, targetBill);

    // If recurring bill, create next cycle bill automatically
    let nextBill = null;
    if (toBoolean(targetBill.is_recurring, false) && targetBill.frequency && targetBill.frequency !== 'once') {
      const nextDueDate = advanceBillDueDate(String(targetBill.due_date), String(targetBill.frequency));
      const nextBillId = generateId('bil');
      nextBill = {
        bill_id: nextBillId,
        user_id: userId,
        bill_name: targetBill.bill_name,
        category_id: targetBill.category_id,
        amount: targetBill.amount,
        currency: targetBill.currency || 'THB',
        due_date: nextDueDate,
        is_recurring: true,
        frequency: targetBill.frequency,
        status: 'unpaid',
        remind_days_before: targetBill.remind_days_before || 3,
        paid_transaction_id: '',
        notes: targetBill.notes || '',
        created_at: now,
        updated_at: now
      };
      appendSheetObject(SHEET_NAMES.BILLS, nextBill);
    }

    invalidateUserCache(userId);
    writeAuditLog(ctx, 'bills.pay', 'Bills', billId, 'ชำระบิล ' + targetBill.bill_name + ' จำนวน ' + payAmount, {
      bill_id: billId,
      paid_transaction_id: txRes.transaction.transaction_id,
      next_bill_id: nextBill ? nextBill.bill_id : null
    });

    return {
      paid_bill: targetBill,
      transaction: txRes.transaction,
      next_recurring_bill: nextBill
    };
  });
}

/**
 * Lists CSV / Statement import history records from Import_History sheet (Module I).
 */
function handleImportsList(ctx, params) {
  const userId = ctx.user.user_id;
  const allImports = readSheetObjects(SHEET_NAMES.IMPORT_HISTORY);
  const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);

  const accMap = {};
  for (let i = 0; i < allAccounts.length; i++) {
    if (allAccounts[i].user_id === userId) {
      accMap[allAccounts[i].account_id] = allAccounts[i].account_name;
    }
  }

  const userImports = [];
  for (let i = allImports.length - 1; i >= 0; i--) {
    const imp = allImports[i];
    if (imp.user_id !== userId) continue;
    userImports.push({
      import_id: imp.import_id,
      source_type: imp.source_type || 'csv_upload',
      file_name: imp.file_name || 'statement.csv',
      account_id: imp.account_id,
      account_name: accMap[imp.account_id] || imp.account_id,
      total_rows: Number(imp.total_rows || 0),
      imported_rows: Number(imp.imported_rows || 0),
      skipped_duplicates: Number(imp.skipped_duplicates || 0),
      status: imp.status || 'completed',
      created_at: imp.created_at
    });
  }

  return {
    imports: userImports
  };
}

function enrichBillObject(b, catMap, todayStr, todayTime) {
  const dueStr = String(b.due_date || todayStr);
  const dueTime = new Date(dueStr + 'T00:00:00').getTime();
  const daysUntilDue = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));
  const remindDays = Number(b.remind_days_before !== undefined && b.remind_days_before !== '' ? b.remind_days_before : 3);
  const rawStatus = String(b.status || 'unpaid');

  let effectiveStatus = rawStatus;
  if (rawStatus === 'unpaid' && daysUntilDue < 0) {
    effectiveStatus = 'overdue';
  }
  const isDueSoon = (effectiveStatus === 'unpaid' && daysUntilDue >= 0 && daysUntilDue <= remindDays);
  const catObj = catMap[b.category_id];

  return {
    bill_id: b.bill_id,
    bill_name: b.bill_name,
    category_id: b.category_id || 'cat_exp_utilities',
    category_name: catObj ? catObj.category_name : 'บิลและสาธารณูปโภค',
    amount: Math.round(Number(b.amount || 0) * 100) / 100,
    currency: b.currency || 'THB',
    due_date: dueStr,
    days_until_due: daysUntilDue,
    is_recurring: toBoolean(b.is_recurring, false),
    frequency: b.frequency || 'once',
    status: rawStatus,
    effective_status: effectiveStatus,
    remind_days_before: remindDays,
    is_due_soon: isDueSoon,
    paid_transaction_id: b.paid_transaction_id || '',
    notes: b.notes || '',
    created_at: b.created_at,
    updated_at: b.updated_at
  };
}

function advanceBillDueDate(dateStr, freq) {
  const parts = String(dateStr).split('-');
  const yr = Number(parts[0]);
  const mo = Number(parts[1]) - 1;
  const dy = Number(parts[2]);
  let d = new Date(yr, mo, dy);
  if (freq === 'weekly') {
    d = new Date(yr, mo, dy + 7);
  } else if (freq === 'quarterly') {
    d = new Date(yr, mo + 3, dy);
  } else if (freq === 'yearly') {
    d = new Date(yr + 1, mo, dy);
  } else {
    d = new Date(yr, mo + 1, dy);
  }
  return Utilities.formatDate(d, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
}



/** --- FILE: RecurringService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: RecurringService.gs (Phase 2 - Module F)
 * Description: Manages recurring income, expense, and transfer schedules (daily, weekly, monthly, yearly),
 *              separates forecasted upcoming occurrences from actual posted transactions,
 *              and prevents duplicate creation from automated triggers via deterministic idempotency keys.
 */

const ALLOWED_RECURRING_FREQ = ['daily', 'weekly', 'monthly', 'yearly'];
const ALLOWED_RECURRING_TX_TYPES = ['income', 'expense', 'transfer'];

/**
 * Advances a YYYY-MM-DD date string by `intervalCount` units of `frequency`.
 */
function advanceRecurringDate(dateStr, frequency, intervalCount) {
  const parts = String(dateStr).split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10); // 1..12
  const d = parseInt(parts[2], 10);
  const step = Math.max(1, parseInt(intervalCount || 1, 10));
  const pad2 = function(n) { return ('0' + n).slice(-2); };

  if (frequency === 'daily') {
    const dt = new Date(Date.UTC(y, m - 1, d + step));
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }
  if (frequency === 'weekly') {
    const dt = new Date(Date.UTC(y, m - 1, d + step * 7));
    return dt.getUTCFullYear() + '-' + pad2(dt.getUTCMonth() + 1) + '-' + pad2(dt.getUTCDate());
  }
  if (frequency === 'yearly') {
    const targetY = y + step;
    const maxDay = new Date(targetY, m, 0).getDate();
    return targetY + '-' + pad2(m) + '-' + pad2(Math.min(d, maxDay));
  }
  // Default: monthly
  let totalMonths = (y * 12 + (m - 1)) + step;
  const targetY = Math.floor(totalMonths / 12);
  const targetM = (totalMonths % 12) + 1;
  const maxDay = new Date(targetY, targetM, 0).getDate();
  return targetY + '-' + pad2(targetM) + '-' + pad2(Math.min(d, maxDay));
}

/**
 * Generates up to `maxCount` forecasted future occurrences for a recurring rule within [fromDate, horizonEnd].
 */
function generateForecastedOccurrences(rule, fromDate, horizonEnd, maxCount) {
  const results = [];
  if (rule.status !== 'active') return results;

  let cursor = String(rule.next_run_date || rule.start_date || '').substring(0, 10);
  const endDate = rule.end_date ? String(rule.end_date).substring(0, 10) : '';
  const limit = maxCount || 12;
  let guard = 0;

  while (cursor && cursor <= horizonEnd && results.length < limit && guard < 100) {
    guard++;
    if (endDate && cursor > endDate) break;
    if (cursor >= fromDate) {
      results.push({
        recurring_id: rule.recurring_id,
        title: rule.title,
        scheduled_date: cursor,
        tx_type: rule.tx_type,
        account_id: rule.account_id,
        to_account_id: rule.to_account_id || '',
        category_id: rule.category_id || '',
        amount: Number(rule.amount || 0),
        currency: rule.currency || 'THB',
        is_forecast: true
      });
    }
    cursor = advanceRecurringDate(cursor, rule.frequency || 'monthly', rule.interval_count || 1);
  }
  return results;
}

/**
 * Normalizes a recurring row for API response.
 */
function normalizeRecurring(row) {
  return {
    recurring_id: row.recurring_id,
    user_id: row.user_id,
    title: row.title,
    tx_type: row.tx_type,
    account_id: row.account_id,
    to_account_id: row.to_account_id || '',
    category_id: row.category_id || '',
    amount: Number(row.amount || 0),
    currency: row.currency || 'THB',
    frequency: row.frequency || 'monthly',
    interval_count: Math.max(1, parseInt(row.interval_count || 1, 10)),
    start_date: String(row.start_date || '').substring(0, 10),
    end_date: row.end_date ? String(row.end_date).substring(0, 10) : '',
    next_run_date: String(row.next_run_date || '').substring(0, 10),
    last_run_date: row.last_run_date ? String(row.last_run_date).substring(0, 10) : '',
    auto_post: toBoolean(row.auto_post, true),
    status: row.status || 'active',
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Lists all recurring rules for the user, plus separated upcoming forecasted occurrences (next 90 days)
 * and already posted actual transactions linked to recurring rules.
 */
function handleRecurringList(ctx, params) {
  const userId = ctx.user.user_id;
  const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
  const horizonDate = new Date(Date.now() + 90 * 86400000);
  const horizonEnd = Utilities.formatDate(horizonDate, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

  const rules = readSheetObjects(SHEET_NAMES.RECURRING)
    .filter(function(r) { return r.user_id === userId; })
    .map(normalizeRecurring);

  let upcomingForecasts = [];
  rules.forEach(function(r) {
    const occ = generateForecastedOccurrences(r, todayStr, horizonEnd, 6);
    upcomingForecasts = upcomingForecasts.concat(occ);
  });
  upcomingForecasts.sort(function(a, b) {
    return String(a.scheduled_date).localeCompare(String(b.scheduled_date));
  });

  // Actual transactions generated from recurring rules
  const actualPosted = readSheetObjects(SHEET_NAMES.TRANSACTIONS)
    .filter(function(tx) {
      return tx.user_id === userId && tx.status === 'posted' && Boolean(tx.recurring_id);
    })
    .map(normalizeTransaction)
    .sort(function(a, b) { return String(b.tx_date).localeCompare(String(a.tx_date)); })
    .slice(0, 20);

  return {
    recurring_rules: rules,
    upcoming_forecasts: upcomingForecasts,
    actual_generated_transactions: actualPosted
  };
}

/**
 * Creates a new recurring rule.
 */
function handleRecurringCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const title = requireString(params.title, 'ชื่อรายการประจำ (title)', 100);
    const txType = requireEnum(params.tx_type || 'expense', ALLOWED_RECURRING_TX_TYPES, 'ประเภทธุรกรรม (tx_type)');
    const accountId = requireString(params.account_id, 'บัญชีต้นทาง (account_id)', 64);
    const toAccountId = txType === 'transfer' ? requireString(params.to_account_id, 'บัญชีปลายทาง', 64) : '';
    const categoryId = optionalString(params.category_id, 64) || (txType === 'transfer' ? 'cat_trf_internal' : 'cat_exp_housing');
    const amount = requireNumber(params.amount, 'จำนวนเงิน (amount)', false, false);
    const currency = (optionalString(params.currency, 10) || ctx.user.base_currency || 'THB').toUpperCase();
    const frequency = requireEnum(params.frequency || 'monthly', ALLOWED_RECURRING_FREQ, 'ความถี่ (frequency)');
    const intervalCount = Math.max(1, parseInt(params.interval_count || 1, 10));
    const startDate = requireDateStr(params.start_date, 'วันเริ่มต้น (start_date)');
    const endDate = params.end_date ? requireDateStr(params.end_date, 'วันสิ้นสุด (end_date)') : '';
    const nextRunDate = params.next_run_date ? requireDateStr(params.next_run_date, 'วันทำงานครั้งถัดไป') : startDate;
    const autoPost = toBoolean(params.auto_post, true);

    const now = nowIso();
    const newRule = {
      recurring_id: generateId('rec'),
      user_id: userId,
      title: title,
      tx_type: txType,
      account_id: accountId,
      to_account_id: toAccountId,
      category_id: categoryId,
      amount: amount,
      currency: currency,
      frequency: frequency,
      interval_count: intervalCount,
      start_date: startDate,
      end_date: endDate,
      next_run_date: nextRunDate,
      last_run_date: '',
      auto_post: autoPost ? 'TRUE' : 'FALSE',
      status: 'active',
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.RECURRING, newRule);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'recurring.create', 'Recurring', newRule.recurring_id, 'สร้างรายการประจำ: ' + title + ' (' + frequency + ')', newRule);

    return { recurring: normalizeRecurring(newRule) };
  });
}

/**
 * Updates an existing recurring rule.
 */
function handleRecurringUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const recId = requireString(params.recurring_id, 'รหัสรายการประจำ (recurring_id)', 64);

    const allRows = readSheetObjects(SHEET_NAMES.RECURRING);
    let target = null;
    for (let i = 0; i < allRows.length; i++) {
      if (allRows[i].recurring_id === recId && allRows[i].user_id === userId) {
        target = allRows[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการประจำที่ระบุ', 404);
    }

    if (params.title !== undefined) target.title = requireString(params.title, 'ชื่อรายการประจำ', 100);
    if (params.tx_type !== undefined) target.tx_type = requireEnum(params.tx_type, ALLOWED_RECURRING_TX_TYPES, 'ประเภทธุรกรรม');
    if (params.account_id !== undefined) target.account_id = requireString(params.account_id, 'บัญชีต้นทาง', 64);
    if (params.to_account_id !== undefined) target.to_account_id = optionalString(params.to_account_id, 64);
    if (params.category_id !== undefined) target.category_id = optionalString(params.category_id, 64);
    if (params.amount !== undefined) target.amount = requireNumber(params.amount, 'จำนวนเงิน', false, false);
    if (params.frequency !== undefined) target.frequency = requireEnum(params.frequency, ALLOWED_RECURRING_FREQ, 'ความถี่');
    if (params.interval_count !== undefined) target.interval_count = Math.max(1, parseInt(params.interval_count || 1, 10));
    if (params.start_date !== undefined) target.start_date = requireDateStr(params.start_date, 'วันเริ่มต้น');
    if (params.end_date !== undefined) target.end_date = params.end_date ? requireDateStr(params.end_date, 'วันสิ้นสุด') : '';
    if (params.next_run_date !== undefined) target.next_run_date = requireDateStr(params.next_run_date, 'วันทำงานครั้งถัดไป');
    if (params.auto_post !== undefined) target.auto_post = toBoolean(params.auto_post, true) ? 'TRUE' : 'FALSE';
    if (params.status !== undefined) target.status = requireEnum(params.status, ['active', 'paused', 'completed'], 'สถานะ');

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.RECURRING, target._rowIndex, target);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'recurring.update', 'Recurring', recId, 'แก้ไขรายการประจำ: ' + target.title, {});

    return { recurring: normalizeRecurring(target) };
  });
}

/**
 * Processes all due recurring rules up to `as_of_date` (defaults to today).
 * Prevents duplicate transactions using deterministic idempotency key `rec_<recurring_id>_<scheduled_date>`.
 * Can be called via API (`recurring.processDue`) or time-based Google Apps Script Trigger.
 */
function handleRecurringProcessDue(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const asOfDate = (params && params.as_of_date)
      ? requireDateStr(params.as_of_date, 'วันที่ประมวลผล (as_of_date)')
      : Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

    const allRules = readSheetObjects(SHEET_NAMES.RECURRING).filter(function(r) {
      return r.user_id === userId && r.status === 'active' && toBoolean(r.auto_post, true);
    });

    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    const existingIdempotencyKeys = {};
    for (let i = 0; i < allTxs.length; i++) {
      if (allTxs[i].user_id === userId && allTxs[i].idempotency_key) {
        existingIdempotencyKeys[allTxs[i].idempotency_key] = allTxs[i].transaction_id;
      }
    }

    const now = nowIso();
    const createdTxs = [];
    const skippedDuplicates = [];
    const updatedRules = [];

    for (let i = 0; i < allRules.length; i++) {
      const rule = allRules[i];
      let nextRun = String(rule.next_run_date || rule.start_date || '').substring(0, 10);
      const endDate = rule.end_date ? String(rule.end_date).substring(0, 10) : '';
      let modified = false;
      let safetyCounter = 0;

      while (nextRun && nextRun <= asOfDate && safetyCounter < 36) {
        safetyCounter++;
        if (endDate && nextRun > endDate) {
          rule.status = 'completed';
          modified = true;
          break;
        }

        const detKey = 'rec_' + rule.recurring_id + '_' + nextRun;
        if (existingIdempotencyKeys[detKey]) {
          skippedDuplicates.push({
            recurring_id: rule.recurring_id,
            scheduled_date: nextRun,
            existing_transaction_id: existingIdempotencyKeys[detKey]
          });
        } else {
          const txId = generateId('txn');
          const amt = Number(rule.amount || 0);
          const newTx = {
            transaction_id: txId,
            user_id: userId,
            tx_date: nextRun,
            tx_time: '08:00',
            tx_type: rule.tx_type,
            account_id: rule.account_id,
            to_account_id: rule.to_account_id || '',
            category_id: rule.category_id || '',
            subcategory_id: '',
            amount: amt,
            currency: rule.currency || 'THB',
            exchange_rate: 1,
            to_amount: amt,
            merchant: rule.title,
            description: 'สร้างอัตโนมัติจากรายการประจำ (' + rule.frequency + ')',
            tags: 'recurring,auto',
            receipt_url: '',
            reference_tx_id: '',
            recurring_id: rule.recurring_id,
            import_id: '',
            idempotency_key: detKey,
            dedup_hash: computeTxDedupHash(userId, nextRun, rule.tx_type, rule.account_id, amt, rule.title),
            status: 'posted',
            revision: 1,
            edit_history_json: JSON.stringify([{
              revision: 1,
              action: 'created_by_recurring_trigger',
              recurring_id: rule.recurring_id,
              scheduled_date: nextRun,
              timestamp: now
            }]),
            created_at: now,
            updated_at: now
          };
          appendSheetObject(SHEET_NAMES.TRANSACTIONS, newTx);
          existingIdempotencyKeys[detKey] = txId;
          createdTxs.push(normalizeTransaction(newTx));
        }

        rule.last_run_date = nextRun;
        nextRun = advanceRecurringDate(nextRun, rule.frequency || 'monthly', rule.interval_count || 1);
        rule.next_run_date = nextRun;
        if (endDate && nextRun > endDate) {
          rule.status = 'completed';
        }
        modified = true;
      }

      if (modified) {
        rule.updated_at = now;
        updateSheetRowByIndex(SHEET_NAMES.RECURRING, rule._rowIndex, rule);
        updatedRules.push(normalizeRecurring(rule));
      }
    }

    if (createdTxs.length > 0) {
      recalculateUserAccountBalances(userId);
      invalidateUserCache(userId);
    }

    writeAuditLog(ctx, 'recurring.processDue', 'Recurring', userId, 'ประมวลผลรายการประจำ สร้างใหม่ ' + createdTxs.length + ' รายการ (ป้องกันซ้ำ ' + skippedDuplicates.length + ')', {
      as_of_date: asOfDate,
      created_count: createdTxs.length,
      skipped_count: skippedDuplicates.length
    });

    return {
      as_of_date: asOfDate,
      created_count: createdTxs.length,
      skipped_duplicates_count: skippedDuplicates.length,
      created_transactions: createdTxs,
      skipped_duplicates: skippedDuplicates,
      updated_rules: updatedRules
    };
  });
}

/**
 * Time-driven trigger entry point for Google Apps Script Triggers (runs across all active users).
 */
function runDailyRecurringTrigger() {
  const users = readSheetObjects(SHEET_NAMES.USERS).filter(function(u) { return u.status === 'active'; });
  users.forEach(function(u) {
    try {
      handleRecurringProcessDue({ requestId: generateId('trig'), user: u }, {});
    } catch (e) {
      Logger.log('Recurring trigger error for user ' + u.user_id + ': ' + e.message);
    }
  });
}


/** --- FILE: NotificationService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: NotificationService.gs (Phase 3 — Smart Alerts & Notifications Engine)
 * Description: Manages persistent user notifications in the Notifications sheet, evaluates real-time
 *              financial rules (overdue/due-soon bills, budget thresholds, debt/credit card due dates,
 *              and savings goals at risk) with deduplication by reference_id.
 */

/**
 * Lists notifications for the authenticated user, with unread count.
 */
function handleNotificationsList(ctx, params) {
  const userId = ctx.user.user_id;
  const unreadOnly = toBoolean(params && params.unread_only, false);
  const allNotifs = readSheetObjects(SHEET_NAMES.NOTIFICATIONS);

  const items = [];
  let unreadCount = 0;

  for (let i = allNotifs.length - 1; i >= 0; i--) {
    const n = allNotifs[i];
    if (n.user_id !== userId) continue;
    const isRead = toBoolean(n.is_read, false);
    if (!isRead) unreadCount++;
    if (unreadOnly && isRead) continue;

    items.push({
      notification_id: n.notification_id,
      notif_type: n.notif_type || 'system',
      severity: n.severity || 'info',
      title: n.title || '',
      message: n.message || '',
      reference_id: n.reference_id || '',
      is_read: isRead,
      created_at: n.created_at
    });
  }

  return {
    unread_count: unreadCount,
    total_count: items.length,
    notifications: items.slice(0, 100)
  };
}

/**
 * Evaluates live database conditions (Bills, Budgets, Debts, Credit Cards, Savings Goals)
 * and persists new alerts into the Notifications sheet (deduplicating via reference_id).
 */
function handleNotificationsGenerateAlerts(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const currentYm = todayStr.substring(0, 7);

    const existingNotifs = readSheetObjects(SHEET_NAMES.NOTIFICATIONS);
    const existingRefSet = {};
    for (let i = 0; i < existingNotifs.length; i++) {
      if (existingNotifs[i].user_id === userId && existingNotifs[i].reference_id) {
        existingRefSet[String(existingNotifs[i].reference_id)] = true;
      }
    }

    const newAlerts = [];
    const now = nowIso();

    // 1. Check Bills (Overdue & Due Soon)
    const billsData = handleBillsList(ctx, {});
    const bills = billsData.bills || [];
    for (let i = 0; i < bills.length; i++) {
      const b = bills[i];
      if (b.effective_status === 'overdue') {
        const refId = 'alert_bill_overdue_' + b.bill_id + '_' + b.due_date;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'bill_overdue',
            severity: 'danger',
            title: 'บิลเกินกำหนดชำระ: ' + b.bill_name,
            message: 'รายการ "' + b.bill_name + '" ยอด ' + b.amount + ' ' + b.currency + ' เกินกำหนดชำระตั้งแต่วันที่ ' + b.due_date,
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      } else if (b.is_due_soon) {
        const refId = 'alert_bill_duesoon_' + b.bill_id + '_' + b.due_date;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'bill_due',
            severity: 'warning',
            title: 'บิลใกล้ครบกำหนดชำระ: ' + b.bill_name,
            message: 'รายการ "' + b.bill_name + '" ยอด ' + b.amount + ' ' + b.currency + ' จะครบกำหนดในวันที่ ' + b.due_date + ' (อีก ' + b.days_until_due + ' วัน)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      }
    }

    // 2. Check Budgets (Warning & Over Budget)
    const budgetsData = handleBudgetsList(ctx, {});
    const budgets = budgetsData.budgets || [];
    for (let i = 0; i < budgets.length; i++) {
      const bdg = budgets[i];
      if (bdg.status === 'over_budget' || bdg.status === 'exceeded') {
        const refId = 'alert_budget_over_' + bdg.budget_id + '_' + currentYm;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'budget_alert',
            severity: 'danger',
            title: 'ใช้งบประมาณเกินวงเงิน: ' + bdg.budget_name,
            message: 'งบ "' + bdg.budget_name + '" ใช้ไปแล้ว ' + bdg.spent_amount + ' จากวงเงินสุทธิ ' + bdg.effective_limit + ' (' + bdg.used_pct + '%)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      } else if (bdg.status === 'warning') {
        const refId = 'alert_budget_warn_' + bdg.budget_id + '_' + currentYm;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'budget_alert',
            severity: 'warning',
            title: 'งบประมาณใกล้เต็ม: ' + bdg.budget_name,
            message: 'งบ "' + bdg.budget_name + '" ใช้ไปถึงเกณฑ์แจ้งเตือนแล้ว (' + bdg.used_pct + '% ของวงเงิน)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      }
    }

    // 3. Check Debts & Credit Cards (High DTI or Active Credit Card Statement)
    const debtsData = handleDebtsList(ctx, {});
    if (debtsData.summary && debtsData.summary.dti_status === 'high_risk') {
      const refId = 'alert_dti_high_' + currentYm;
      if (!existingRefSet[refId]) {
        existingRefSet[refId] = true;
        newAlerts.push({
          notification_id: generateId('ntf'),
          user_id: userId,
          notif_type: 'debt_alert',
          severity: 'danger',
          title: 'ภาระหนี้ต่อรายได้ (DTI) อยู่ในเกณฑ์สูง (' + debtsData.summary.dti_percentage + '%)',
          message: 'ยอดผ่อนหนี้ขั้นต่ำต่อเดือนรวม ' + debtsData.summary.combined_monthly_debt_service + ' คิดเป็น ' + debtsData.summary.dti_percentage + '% ของรายได้ ควรวางแผนลดภาระหนี้ดอกเบี้ยสูง',
          reference_id: refId,
          is_read: false,
          created_at: now
        });
      }
    }

    const creditCards = debtsData.credit_cards || [];
    for (let i = 0; i < creditCards.length; i++) {
      const cc = creditCards[i];
      if (cc.owed_amount > 0) {
        const refId = 'alert_cc_due_' + cc.account_id + '_' + cc.next_due_date;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'credit_card_due',
            severity: cc.utilization_pct >= 80 ? 'danger' : 'info',
            title: 'ยอดค้างชำระบัตรเครดิต: ' + cc.account_name,
            message: 'มียอดค้างชำระ ' + cc.owed_amount + ' ' + cc.currency + ' กำหนดชำระวันที่ ' + cc.next_due_date + ' (ใช้วงเงินไป ' + cc.utilization_pct + '%)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      }
    }

    if (newAlerts.length > 0) {
      batchAppendObjects(SHEET_NAMES.NOTIFICATIONS, newAlerts);
      writeAuditLog(ctx, 'notifications.generateAlerts', 'Notifications', userId, 'สร้างรายการแจ้งเตือนอัตโนมัติ ' + newAlerts.length + ' รายการ', {
        generated_count: newAlerts.length
      });
    }

    const updatedList = handleNotificationsList(ctx, {});
    return {
      generated_count: newAlerts.length,
      generated_alerts: newAlerts,
      unread_count: updatedList.unread_count,
      notifications: updatedList.notifications
    };
  });
}

/**
 * Marks one notification or all notifications for the user as read.
 */
function handleNotificationsMarkRead(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const markAll = toBoolean(params && params.mark_all, false);
    const notifId = optionalString(params && params.notification_id, 64);

    if (!markAll && !notifId) {
      throw createAppError('VALIDATION_ERROR', 'กรุณาระบุ notification_id หรือตั้งค่า mark_all = true', 400);
    }

    const allNotifs = readSheetObjects(SHEET_NAMES.NOTIFICATIONS);
    let updatedCount = 0;

    for (let i = 0; i < allNotifs.length; i++) {
      const n = allNotifs[i];
      if (n.user_id !== userId) continue;
      if (toBoolean(n.is_read, false)) continue;

      if (markAll || n.notification_id === notifId) {
        n.is_read = true;
        updateSheetRowByIndex(SHEET_NAMES.NOTIFICATIONS, n._rowIndex, n);
        updatedCount++;
        if (!markAll) break;
      }
    }

    return {
      updated_count: updatedCount,
      notifications_state: handleNotificationsList(ctx, {})
    };
  });
}



/** --- FILE: ReportService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: ReportService.gs (Phase 2 - Module H)
 * Description: Comprehensive financial reports & analytics:
 *              - Income & Expense by Category & Account
 *              - Cashflow & Net Worth (Assets vs Liabilities)
 *              - Budget vs Actual, Savings Goals & Debt Summary
 *              - Period comparison: Monthly, Quarterly (Q1-Q4), Yearly
 *              - Strict separation between Actuals (`Transactions`) and Projections (`Recurring` / `Budgets`)
 */

function handleReportsOverview(ctx, params) {
  const userId = ctx.user.user_id;
  const p = params || {};
  const now = new Date();
  const curYear = parseInt(p.year || now.getFullYear(), 10);
  const pad2 = function(n) { return ('0' + n).slice(-2); };

  const defaultStart = curYear + '-01-01';
  const defaultEnd = curYear + '-12-31';
  const startDate = optionalString(p.start_date, 10) || defaultStart;
  const endDate = optionalString(p.end_date, 10) || defaultEnd;
  const filterAccountId = optionalString(p.account_id, 64);

  const accounts = recalculateUserAccountBalances(userId).filter(function(a) {
    return !a.is_archived;
  });
  const accMap = {};
  accounts.forEach(function(a) { accMap[a.account_id] = a; });

  const categories = handleCategoriesList(ctx, { include_inactive: true }).categories;
  const catMap = {};
  categories.forEach(function(c) { catMap[c.category_id] = c; });

  // 1. Net Worth & Assets vs Liabilities (Actuals)
  let totalAssets = 0;
  let totalLiabilities = 0;
  const assetAccounts = [];
  const liabilityAccounts = [];

  accounts.forEach(function(a) {
    const bal = Number(a.current_balance || 0);
    if (a.account_type === 'credit_card' || bal < 0) {
      totalLiabilities += Math.abs(bal);
      liabilityAccounts.push(a);
    } else {
      totalAssets += bal;
      assetAccounts.push(a);
    }
  });
  const netWorth = Math.round((totalAssets - totalLiabilities) * 100) / 100;

  // 2. Fetch Actual Posted Transactions
  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS)
    .filter(function(tx) {
      if (tx.user_id !== userId || tx.status !== 'posted') return false;
      if (filterAccountId && tx.account_id !== filterAccountId && tx.to_account_id !== filterAccountId) return false;
      return true;
    })
    .map(normalizeTransaction);

  // Buckets for Monthly (1..12), Quarterly (Q1..Q4), and Yearly (curYear-1 vs curYear)
  const monthlyComparison = [];
  const monthlyMap = {};
  for (let m = 1; m <= 12; m++) {
    const ym = curYear + '-' + pad2(m);
    const bucket = { period: ym, income: 0, expense: 0, net: 0, savings_rate_pct: 0 };
    monthlyComparison.push(bucket);
    monthlyMap[ym] = bucket;
  }

  const quarterlyComparison = [
    { quarter: curYear + '-Q1', label: 'ไตรมาส 1 (ม.ค.-มี.ค.)', income: 0, expense: 0, net: 0 },
    { quarter: curYear + '-Q2', label: 'ไตรมาส 2 (เม.ย.-มิ.ย.)', income: 0, expense: 0, net: 0 },
    { quarter: curYear + '-Q3', label: 'ไตรมาส 3 (ก.ค.-ก.ย.)', income: 0, expense: 0, net: 0 },
    { quarter: curYear + '-Q4', label: 'ไตรมาส 4 (ต.ค.-ธ.ค.)', income: 0, expense: 0, net: 0 }
  ];

  const yearlyMap = {};
  yearlyMap[String(curYear - 1)] = { year: String(curYear - 1), income: 0, expense: 0, net: 0 };
  yearlyMap[String(curYear)] = { year: String(curYear), income: 0, expense: 0, net: 0 };

  // Selected Range Actual Aggregations
  let actualIncome = 0;
  let actualGrossExpense = 0;
  let actualRefunds = 0;
  let actualTransferVolume = 0;
  const byCategory = {};
  const byAccount = {};

  accounts.forEach(function(a) {
    byAccount[a.account_id] = {
      account_id: a.account_id,
      account_name: a.account_name,
      account_type: a.account_type,
      currency: a.currency,
      opening_balance: a.opening_balance,
      inflow_income: 0,
      outflow_expense: 0,
      transfer_in: 0,
      transfer_out: 0,
      current_balance: a.current_balance
    };
  });

  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i];
    const d = tx.tx_date;
    const yr = d.substring(0, 4);
    const ym = d.substring(0, 7);
    const mo = parseInt(d.substring(5, 7), 10);
    const qIdx = Math.floor((mo - 1) / 3);
    const amt = Number(tx.amount || 0);

    // Yearly comparison ( excluding transfers )
    if (yearlyMap[yr]) {
      if (tx.tx_type === 'income') yearlyMap[yr].income += amt;
      else if (tx.tx_type === 'expense') yearlyMap[yr].expense += amt;
      else if (tx.tx_type === 'refund') yearlyMap[yr].expense = Math.max(0, yearlyMap[yr].expense - amt);
    }

    // Monthly & Quarterly for curYear
    if (yr === String(curYear)) {
      if (monthlyMap[ym]) {
        if (tx.tx_type === 'income') monthlyMap[ym].income += amt;
        else if (tx.tx_type === 'expense') monthlyMap[ym].expense += amt;
        else if (tx.tx_type === 'refund') monthlyMap[ym].expense = Math.max(0, monthlyMap[ym].expense - amt);
      }
      if (quarterlyComparison[qIdx]) {
        if (tx.tx_type === 'income') quarterlyComparison[qIdx].income += amt;
        else if (tx.tx_type === 'expense') quarterlyComparison[qIdx].expense += amt;
        else if (tx.tx_type === 'refund') quarterlyComparison[qIdx].expense = Math.max(0, quarterlyComparison[qIdx].expense - amt);
      }
    }

    // Selected date window [startDate, endDate]
    if (d >= startDate && d <= endDate) {
      const cid = tx.category_id || 'uncategorized';
      if (!byCategory[cid]) {
        const cObj = catMap[cid] || { category_name: 'อื่นๆ', category_type: tx.tx_type, color: '#64748B' };
        byCategory[cid] = {
          category_id: cid,
          category_name: cObj.category_name,
          category_type: cObj.category_type,
          color: cObj.color,
          income_amount: 0,
          expense_amount: 0,
          tx_count: 0
        };
      }
      byCategory[cid].tx_count += 1;

      if (tx.tx_type === 'income') {
        actualIncome += amt;
        byCategory[cid].income_amount += amt;
        if (byAccount[tx.account_id]) byAccount[tx.account_id].inflow_income += amt;
      } else if (tx.tx_type === 'expense') {
        actualGrossExpense += amt;
        byCategory[cid].expense_amount += amt;
        if (byAccount[tx.account_id]) byAccount[tx.account_id].outflow_expense += amt;
      } else if (tx.tx_type === 'refund') {
        actualRefunds += amt;
        byCategory[cid].expense_amount = Math.max(0, byCategory[cid].expense_amount - amt);
        if (byAccount[tx.account_id]) byAccount[tx.account_id].outflow_expense = Math.max(0, byAccount[tx.account_id].outflow_expense - amt);
      } else if (tx.tx_type === 'transfer') {
        actualTransferVolume += amt;
        if (byAccount[tx.account_id]) byAccount[tx.account_id].transfer_out += amt;
        if (tx.to_account_id && byAccount[tx.to_account_id]) byAccount[tx.to_account_id].transfer_in += amt;
      }
    }
  }

  // Finalize Monthly, Quarterly, Yearly numbers
  monthlyComparison.forEach(function(m) {
    m.income = Math.round(m.income * 100) / 100;
    m.expense = Math.round(m.expense * 100) / 100;
    m.net = Math.round((m.income - m.expense) * 100) / 100;
    m.savings_rate_pct = m.income > 0 ? Math.round(((m.income - m.expense) / m.income) * 10000) / 100 : 0;
  });

  quarterlyComparison.forEach(function(q) {
    q.income = Math.round(q.income * 100) / 100;
    q.expense = Math.round(q.expense * 100) / 100;
    q.net = Math.round((q.income - q.expense) * 100) / 100;
  });

  const yearlyComparison = Object.keys(yearlyMap).map(function(yrKey) {
    const y = yearlyMap[yrKey];
    y.income = Math.round(y.income * 100) / 100;
    y.expense = Math.round(y.expense * 100) / 100;
    y.net = Math.round((y.income - y.expense) * 100) / 100;
    return y;
  });

  const actualNetExpense = Math.round(Math.max(0, actualGrossExpense - actualRefunds) * 100) / 100;
  const actualNetCashflow = Math.round((actualIncome - actualNetExpense) * 100) / 100;
  const actualSavingsRate = actualIncome > 0 ? Math.round(((actualIncome - actualNetExpense) / actualIncome) * 10000) / 100 : 0;

  // 3. Projected / Forecasted Data (Separated strictly from Actuals!)
  const recurringData = handleRecurringList(ctx, {});
  let projectedRecurringIncome90d = 0;
  let projectedRecurringExpense90d = 0;
  (recurringData.upcoming_forecasts || []).forEach(function(f) {
    if (f.tx_type === 'income') projectedRecurringIncome90d += Number(f.amount || 0);
    else if (f.tx_type === 'expense') projectedRecurringExpense90d += Number(f.amount || 0);
  });

  // 4. Budgets, Savings Goals, and Debts Summary
  const budgetsReport = handleBudgetsList(ctx, {}).budgets;
  const goalsReport = handleGoalsList(ctx, {}).goals;
  const totalGoalTarget = goalsReport.reduce(function(s, g) { return s + g.target_amount; }, 0);
  const totalGoalSaved = goalsReport.reduce(function(s, g) { return s + g.current_amount; }, 0);
  const debtsData = handleDebtsList(ctx, {});

  return {
    period: {
      year: curYear,
      start_date: startDate,
      end_date: endDate
    },
    actuals_summary: {
      is_actual_data: true,
      income: Math.round(actualIncome * 100) / 100,
      gross_expense: Math.round(actualGrossExpense * 100) / 100,
      refunds: Math.round(actualRefunds * 100) / 100,
      net_expense: actualNetExpense,
      net_cashflow: actualNetCashflow,
      savings_rate_pct: actualSavingsRate,
      internal_transfers_volume: Math.round(actualTransferVolume * 100) / 100
    },
    projections_summary: {
      is_forecast_data: true,
      horizon_days: 90,
      projected_income_90d: Math.round(projectedRecurringIncome90d * 100) / 100,
      projected_expense_90d: Math.round(projectedRecurringExpense90d * 100) / 100,
      projected_net_90d: Math.round((projectedRecurringIncome90d - projectedRecurringExpense90d) * 100) / 100,
      upcoming_occurrences: (recurringData.upcoming_forecasts || []).slice(0, 15)
    },
    net_worth_report: {
      total_assets: Math.round(totalAssets * 100) / 100,
      total_liabilities: Math.round((totalLiabilities + Number(debtsData.summary.total_remaining_balance || 0)) * 100) / 100,
      net_worth: Math.round((netWorth - Number(debtsData.summary.total_remaining_balance || 0)) * 100) / 100,
      debt_to_asset_ratio_pct: totalAssets > 0
        ? Math.round(((totalLiabilities + Number(debtsData.summary.total_remaining_balance || 0)) / totalAssets) * 10000) / 100
        : 0
    },
    category_report: Object.keys(byCategory).map(function(k) { return byCategory[k]; }).sort(function(a, b) {
      return (b.expense_amount + b.income_amount) - (a.expense_amount + a.income_amount);
    }),
    account_report: Object.keys(byAccount).map(function(k) { return byAccount[k]; }),
    monthly_comparison: monthlyComparison,
    quarterly_comparison: quarterlyComparison,
    yearly_comparison: yearlyComparison,
    budgets_vs_actual: budgetsReport,
    savings_goals_summary: {
      total_goals: goalsReport.length,
      total_target_amount: Math.round(totalGoalTarget * 100) / 100,
      total_saved_amount: Math.round(totalGoalSaved * 100) / 100,
      overall_progress_pct: totalGoalTarget > 0 ? Math.round((totalGoalSaved / totalGoalTarget) * 10000) / 100 : 0,
      goals: goalsReport
    },
    debts_report: debtsData
  };
}


/** --- FILE: DashboardService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: DashboardService.gs
 * Description: Real-time aggregation from Google Sheets for Dashboard KPIs, MoM comparisons,
 *              6-month trends, category breakdown, near-limit budgets, upcoming bills, and recent transactions.
 *              Strictly excludes internal transfers (`transfer`) from income/expense totals.
 */

function handleDashboardSummary(ctx, params) {
  const userId = ctx.user.user_id;
  const p = params || {};

  const filterAccountId = optionalString(p.account_id, 64);
  const filterCategoryId = optionalString(p.category_id, 64);
  const filterCurrency = optionalString(p.currency, 10).toUpperCase();

  // Default period: current month if not specified
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1..12
  const pad2 = function(n) { return ('0' + n).slice(-2); };

  const defaultStart = currentYear + '-' + pad2(currentMonth) + '-01';
  const lastDayOfCurMonth = new Date(currentYear, currentMonth, 0).getDate();
  const defaultEnd = currentYear + '-' + pad2(currentMonth) + '-' + pad2(lastDayOfCurMonth);

  const startDate = optionalString(p.start_date, 10) || defaultStart;
  const endDate = optionalString(p.end_date, 10) || defaultEnd;

  // Previous month date range for MoM comparison
  const refDateParts = startDate.split('-');
  const refYear = parseInt(refDateParts[0], 10) || currentYear;
  const refMonth = parseInt(refDateParts[1], 10) || currentMonth;
  let prevYear = refYear;
  let prevMonth = refMonth - 1;
  if (prevMonth < 1) {
    prevMonth = 12;
    prevYear -= 1;
  }
  const prevStart = prevYear + '-' + pad2(prevMonth) + '-01';
  const prevLastDay = new Date(prevYear, prevMonth, 0).getDate();
  const prevEnd = prevYear + '-' + pad2(prevMonth) + '-' + pad2(prevLastDay);

  // Recalculate and fetch real accounts
  const accounts = recalculateUserAccountBalances(userId).filter(function(a) {
    if (a.is_archived) return false;
    if (filterAccountId && a.account_id !== filterAccountId) return false;
    if (filterCurrency && a.currency !== filterCurrency) return false;
    return true;
  });

  // Categories map
  const categoriesList = handleCategoriesList(ctx, { include_inactive: true }).categories;
  const categoryMap = {};
  categoriesList.forEach(function(c) {
    categoryMap[c.category_id] = c;
  });

  // Calculate total balance by currency and Net Worth
  let totalAssets = 0;
  let totalLiabilities = 0;
  let totalNetBalance = 0;
  const balancesByCurrency = {};

  accounts.forEach(function(acc) {
    const bal = Number(acc.current_balance || 0);
    const cur = acc.currency || 'THB';
    balancesByCurrency[cur] = Math.round(((balancesByCurrency[cur] || 0) + bal) * 100) / 100;
    if (acc.include_in_net_worth) {
      totalNetBalance += bal;
      if (bal >= 0) totalAssets += bal;
      else totalLiabilities += Math.abs(bal);
    }
  });

  // Fetch all user posted transactions
  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS)
    .filter(function(tx) {
      if (tx.user_id !== userId) return false;
      if (tx.status !== 'posted') return false;
      if (filterAccountId && tx.account_id !== filterAccountId && tx.to_account_id !== filterAccountId) return false;
      if (filterCategoryId && tx.category_id !== filterCategoryId && tx.subcategory_id !== filterCategoryId) return false;
      if (filterCurrency && String(tx.currency || '').toUpperCase() !== filterCurrency) return false;
      return true;
    })
    .map(normalizeTransaction);

  // Selected period metrics (excluding `transfer` from income/expense!)
  let periodIncome = 0;
  let periodGrossExpense = 0;
  let periodRefunds = 0;
  let periodTransfersVolume = 0;

  // Previous month metrics for MoM comparison
  let prevMonthIncome = 0;
  let prevMonthExpense = 0;

  // Category expense breakdown in selected period
  const expenseByCategory = {};

  // 6-Month trend buckets ending at refYear-refMonth
  const trendMonths = [];
  const trendMap = {};
  for (let mOffset = 5; mOffset >= 0; mOffset--) {
    let ty = refYear;
    let tm = refMonth - mOffset;
    while (tm < 1) {
      tm += 12;
      ty -= 1;
    }
    const ymKey = ty + '-' + pad2(tm);
    trendMonths.push(ymKey);
    trendMap[ymKey] = {
      month: ymKey,
      income: 0,
      expense: 0,
      net: 0
    };
  }

  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i];
    const d = tx.tx_date;
    const ym = d.substring(0, 7);
    const amt = Number(tx.amount || 0);

    // 6-month trend aggregation (transfers excluded from income/expense)
    if (trendMap[ym]) {
      if (tx.tx_type === 'income') {
        trendMap[ym].income += amt;
      } else if (tx.tx_type === 'expense') {
        trendMap[ym].expense += amt;
      } else if (tx.tx_type === 'refund') {
        trendMap[ym].expense = Math.max(0, trendMap[ym].expense - amt);
      }
    }

    // Previous month comparison
    if (d >= prevStart && d <= prevEnd) {
      if (tx.tx_type === 'income') prevMonthIncome += amt;
      else if (tx.tx_type === 'expense') prevMonthExpense += amt;
      else if (tx.tx_type === 'refund') prevMonthExpense -= amt;
    }

    // Selected period KPIs
    if (d >= startDate && d <= endDate) {
      if (tx.tx_type === 'income') {
        periodIncome += amt;
      } else if (tx.tx_type === 'expense') {
        periodGrossExpense += amt;
        const catId = tx.category_id || 'uncategorized';
        expenseByCategory[catId] = (expenseByCategory[catId] || 0) + amt;
      } else if (tx.tx_type === 'refund') {
        periodRefunds += amt;
        const catId = tx.category_id || 'uncategorized';
        expenseByCategory[catId] = (expenseByCategory[catId] || 0) - amt;
      } else if (tx.tx_type === 'transfer') {
        periodTransfersVolume += amt;
      }
    }
  }

  prevMonthExpense = Math.max(0, prevMonthExpense);
  const periodNetExpense = Math.max(0, periodGrossExpense - periodRefunds);
  const periodNetCashflow = Math.round((periodIncome - periodNetExpense) * 100) / 100;
  const savingsRatePct = periodIncome > 0
    ? Math.round(((periodIncome - periodNetExpense) / periodIncome) * 10000) / 100
    : 0;

  const prevNetCashflow = Math.round((prevMonthIncome - prevMonthExpense) * 100) / 100;
  const calcChangePct = function(cur, prev) {
    if (prev === 0) return cur > 0 ? 100 : 0;
    return Math.round(((cur - prev) / Math.abs(prev)) * 10000) / 100;
  };

  // Finalize 6-month trends
  const monthlyTrends = trendMonths.map(function(ymKey) {
    const bucket = trendMap[ymKey];
    const inc = Math.round(bucket.income * 100) / 100;
    const exp = Math.round(Math.max(0, bucket.expense) * 100) / 100;
    return {
      month: ymKey,
      income: inc,
      expense: exp,
      net: Math.round((inc - exp) * 100) / 100
    };
  });

  // Finalize category breakdown
  const categoryBreakdown = Object.keys(expenseByCategory)
    .map(function(catId) {
      const val = Math.round(Math.max(0, expenseByCategory[catId]) * 100) / 100;
      const catObj = categoryMap[catId] || { category_name: 'อื่นๆ', color: '#64748B', icon: 'tag' };
      return {
        category_id: catId,
        category_name: catObj.category_name,
        color: catObj.color,
        icon: catObj.icon,
        amount: val,
        percentage: periodNetExpense > 0 ? Math.round((val / periodNetExpense) * 10000) / 100 : 0
      };
    })
    .filter(function(item) { return item.amount > 0; })
    .sort(function(a, b) { return b.amount - a.amount; });

  // Budgets near limit (from real Budgets sheet)
  const allBudgets = readSheetObjects(SHEET_NAMES.BUDGETS).filter(function(b) {
    return b.user_id === userId && toBoolean(b.is_active, true);
  });
  const budgetsOverview = allBudgets.map(function(b) {
    const limit = Number(b.amount_limit || 0) + Number(b.rollover_amount || 0);
    const catId = b.category_id || 'ALL';
    const spent = catId === 'ALL' ? periodNetExpense : Number(expenseByCategory[catId] || 0);
    const usedPct = limit > 0 ? Math.round((spent / limit) * 10000) / 100 : 0;
    return {
      budget_id: b.budget_id,
      budget_name: b.budget_name,
      category_id: catId,
      category_name: catId === 'ALL' ? 'งบรวมทุกหมวดหมู่' : ((categoryMap[catId] && categoryMap[catId].category_name) || catId),
      amount_limit: limit,
      spent_amount: Math.round(spent * 100) / 100,
      remaining_amount: Math.round((limit - spent) * 100) / 100,
      used_percentage: usedPct,
      alert_threshold_pct: Number(b.alert_threshold_pct || 80),
      is_near_or_over: usedPct >= Number(b.alert_threshold_pct || 80)
    };
  }).sort(function(a, b) { return b.used_percentage - a.used_percentage; });

  // Upcoming bills (from real Bills sheet)
  const todayStr = Utilities.formatDate(now, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
  const upcomingBills = readSheetObjects(SHEET_NAMES.BILLS)
    .filter(function(bill) {
      return bill.user_id === userId && (bill.status === 'unpaid' || bill.status === 'overdue');
    })
    .map(function(bill) {
      const dueStr = String(bill.due_date || '').substring(0, 10);
      const diffDays = dueStr ? Math.ceil((new Date(dueStr).getTime() - new Date(todayStr).getTime()) / 86400000) : 0;
      return {
        bill_id: bill.bill_id,
        bill_name: bill.bill_name,
        amount: Number(bill.amount || 0),
        currency: bill.currency || 'THB',
        due_date: dueStr,
        days_remaining: diffDays,
        status: diffDays < 0 ? 'overdue' : bill.status
      };
    })
    .sort(function(a, b) { return String(a.due_date).localeCompare(String(b.due_date)); })
    .slice(0, 8);

  // Recent 10 transactions
  const recentTransactions = allTxs.slice().sort(function(a, b) {
    const ka = a.tx_date + ' ' + a.tx_time + ' ' + a.created_at;
    const kb = b.tx_date + ' ' + b.tx_time + ' ' + b.created_at;
    return kb.localeCompare(ka);
  }).slice(0, 10);

  return {
    filters_applied: {
      start_date: startDate,
      end_date: endDate,
      account_id: filterAccountId || 'ALL',
      category_id: filterCategoryId || 'ALL',
      currency: filterCurrency || 'ALL'
    },
    kpis: {
      total_net_balance: Math.round(totalNetBalance * 100) / 100,
      total_assets: Math.round(totalAssets * 100) / 100,
      total_liabilities: Math.round(totalLiabilities * 100) / 100,
      balances_by_currency: balancesByCurrency,
      period_income: Math.round(periodIncome * 100) / 100,
      period_expense: Math.round(periodNetExpense * 100) / 100,
      period_gross_expense: Math.round(periodGrossExpense * 100) / 100,
      period_refunds: Math.round(periodRefunds * 100) / 100,
      period_transfers_volume: Math.round(periodTransfersVolume * 100) / 100,
      period_net_cashflow: periodNetCashflow,
      savings_rate_pct: savingsRatePct
    },
    month_comparison: {
      current_period: {
        start_date: startDate,
        end_date: endDate,
        income: Math.round(periodIncome * 100) / 100,
        expense: Math.round(periodNetExpense * 100) / 100,
        net_cashflow: periodNetCashflow
      },
      previous_month: {
        start_date: prevStart,
        end_date: prevEnd,
        income: Math.round(prevMonthIncome * 100) / 100,
        expense: Math.round(prevMonthExpense * 100) / 100,
        net_cashflow: prevNetCashflow
      },
      income_change_pct: calcChangePct(periodIncome, prevMonthIncome),
      expense_change_pct: calcChangePct(periodNetExpense, prevMonthExpense),
      net_change_pct: calcChangePct(periodNetCashflow, prevNetCashflow)
    },
    accounts: accounts,
    monthly_trends: monthlyTrends,
    category_breakdown: categoryBreakdown,
    budgets_near_limit: budgetsOverview,
    upcoming_bills: upcomingBills,
    recent_transactions: recentTransactions
  };
}



/** --- FILE: SmartFinanceService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: SmartFinanceService.gs (Phase 4 — Module J: Smart Finance, Automation Rules & Anomaly Analytics)
 * Description: Manages user-configurable automation rules (Rules sheet), auto-categorization,
 *              spending anomaly detection, 30/60/90-day cashflow forecasting, goal/budget risk analysis,
 *              and optional Gmail / Google Calendar reminders (strictly no external Bank API).
 */

const ALLOWED_RULE_FIELDS = ['merchant', 'description', 'any_text', 'amount'];
const ALLOWED_RULE_OPERATORS = ['contains', 'equals', 'starts_with', 'gt', 'lt'];

/**
 * Lists all automation rules for the authenticated user sorted by priority.
 */
function handleRulesList(ctx, params) {
  const userId = ctx.user.user_id;
  const allRules = readSheetObjects(SHEET_NAMES.RULES);
  const allCats = readSheetObjects(SHEET_NAMES.CATEGORIES);

  const catMap = {};
  for (let i = 0; i < allCats.length; i++) {
    catMap[allCats[i].category_id] = allCats[i].category_name;
  }

  const rules = [];
  for (let i = 0; i < allRules.length; i++) {
    const r = allRules[i];
    if (r.user_id !== userId) continue;
    rules.push(normalizeRuleObject(r, catMap));
  }

  rules.sort(function(a, b) {
    return a.priority - b.priority;
  });

  return {
    total_rules: rules.length,
    active_rules: rules.filter(function(x) { return x.is_active; }).length,
    rules: rules
  };
}

/**
 * Creates a new automation rule in the Rules sheet.
 */
function handleRulesCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const ruleName = requireString(params.rule_name, 'ชื่อกฎอัตโนมัติ (rule_name)', 120);
    const matchField = requireEnum(params.match_field || 'any_text', ALLOWED_RULE_FIELDS, 'ฟิลด์ที่ตรวจสอบ (match_field)');
    const matchOperator = requireEnum(params.match_operator || 'contains', ALLOWED_RULE_OPERATORS, 'เงื่อนไขการจับคู่ (match_operator)');
    const matchValue = requireString(params.match_value, 'คำค้นหาหรือค่าที่ต้องการจับคู่ (match_value)', 150);
    const assignCategoryId = requireString(params.assign_category_id, 'หมวดหมู่ที่ต้องการกำหนด (assign_category_id)', 64);
    const assignTags = optionalString(params.assign_tags, 150);
    const isActive = toBoolean(params.is_active, true);
    const priority = params.priority ? Math.max(1, Math.min(999, Math.round(Number(params.priority)))) : 10;

    const now = nowIso();
    const ruleId = generateId('rul');
    const newRule = {
      rule_id: ruleId,
      user_id: userId,
      rule_name: ruleName,
      match_field: matchField,
      match_operator: matchOperator,
      match_value: matchValue,
      assign_category_id: assignCategoryId,
      assign_tags: assignTags,
      is_active: isActive,
      priority: priority,
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.RULES, newRule);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'rules.create', 'Rules', ruleId, 'สร้างกฎอัตโนมัติ: ' + ruleName, {
      match_field: matchField,
      match_operator: matchOperator,
      match_value: matchValue,
      assign_category_id: assignCategoryId
    });

    return {
      rule: normalizeRuleObject(newRule, {})
    };
  });
}

/**
 * Updates or toggles an automation rule in the Rules sheet.
 */
function handleRulesUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const ruleId = requireString(params.rule_id, 'รหัสกฎอัตโนมัติ (rule_id)', 64);

    const allRules = readSheetObjects(SHEET_NAMES.RULES);
    let target = null;
    for (let i = 0; i < allRules.length; i++) {
      if (allRules[i].rule_id === ruleId && allRules[i].user_id === userId) {
        target = allRules[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบกฎอัตโนมัติที่ต้องการแก้ไข', 404);
    }

    if (params.rule_name !== undefined) target.rule_name = requireString(params.rule_name, 'ชื่อกฎ', 120);
    if (params.match_field !== undefined) target.match_field = requireEnum(params.match_field, ALLOWED_RULE_FIELDS, 'ฟิลด์');
    if (params.match_operator !== undefined) target.match_operator = requireEnum(params.match_operator, ALLOWED_RULE_OPERATORS, 'ตัวดำเนินการ');
    if (params.match_value !== undefined) target.match_value = requireString(params.match_value, 'ค่าที่จับคู่', 150);
    if (params.assign_category_id !== undefined) target.assign_category_id = requireString(params.assign_category_id, 'หมวดหมู่', 64);
    if (params.assign_tags !== undefined) target.assign_tags = optionalString(params.assign_tags, 150);
    if (params.is_active !== undefined) target.is_active = toBoolean(params.is_active, true);
    if (params.priority !== undefined) target.priority = Math.max(1, Math.min(999, Math.round(Number(params.priority))));

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.RULES, target._rowIndex, target);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'rules.update', 'Rules', ruleId, 'อัปเดตกฎอัตโนมัติ: ' + target.rule_name + ' (is_active=' + target.is_active + ')', {
      is_active: target.is_active
    });

    return {
      rule: normalizeRuleObject(target, {})
    };
  });
}

/**
 * Deletes an automation rule from the Rules sheet.
 */
function handleRulesDelete(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const ruleId = requireString(params.rule_id, 'รหัสกฎอัตโนมัติ (rule_id)', 64);
    const ss = getSpreadsheet();
    const sheet = ss.getSheetByName(SHEET_NAMES.RULES);
    const allRules = readSheetObjects(SHEET_NAMES.RULES);

    let target = null;
    for (let i = 0; i < allRules.length; i++) {
      if (allRules[i].rule_id === ruleId && allRules[i].user_id === userId) {
        target = allRules[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบกฎอัตโนมัติที่ต้องการลบ', 404);
    }

    sheet.deleteRow(target._rowIndex);
    writeAuditLog(ctx, 'rules.delete', 'Rules', ruleId, 'ลบกฎอัตโนมัติ: ' + target.rule_name, {});
    return { deleted_rule_id: ruleId };
  });
}

/**
 * Evaluates active user rules + smart keyword heuristics to recommend a category and tags,
 * plus checks whether a transaction looks like a duplicate.
 */
function handleRulesEvaluate(ctx, params) {
  const userId = ctx.user.user_id;
  const merchant = optionalString(params.merchant, 150);
  const description = optionalString(params.description, 300);
  const amount = Number(params.amount || 0);
  const txType = optionalString(params.tx_type, 20) || 'expense';

  const rulesRes = handleRulesList(ctx, {});
  const activeRules = (rulesRes.rules || []).filter(function(r) { return r.is_active; });

  for (let i = 0; i < activeRules.length; i++) {
    const r = activeRules[i];
    if (doesRuleMatch(r, merchant, description, amount)) {
      return {
        matched_by: 'user_rule',
        rule_id: r.rule_id,
        rule_name: r.rule_name,
        suggested_category_id: r.assign_category_id,
        suggested_category_name: r.assign_category_name,
        suggested_tags: r.assign_tags
      };
    }
  }

  // Fallback smart keyword heuristics
  const combined = (merchant + ' ' + description).toLowerCase();
  let fallbackCat = txType === 'income' ? 'cat_inc_other' : 'cat_exp_shopping';
  let fallbackTags = 'auto-suggested';

  if (combined.indexOf('7-eleven') !== -1 || combined.indexOf('กาแฟ') !== -1 || combined.indexOf('อาหาร') !== -1 || combined.indexOf('grabfood') !== -1) {
    fallbackCat = 'cat_exp_food';
    fallbackTags = 'food,daily';
  } else if (combined.indexOf('bts') !== -1 || combined.indexOf('mrt') !== -1 || combined.indexOf('ปตท') !== -1 || combined.indexOf('น้ำมัน') !== -1 || combined.indexOf('เดินทาง') !== -1) {
    fallbackCat = 'cat_exp_transport';
    fallbackTags = 'transport';
  } else if (combined.indexOf('ไฟฟ้า') !== -1 || combined.indexOf('ประปา') !== -1 || combined.indexOf('ais') !== -1 || combined.indexOf('true') !== -1 || combined.indexOf('อินเทอร์เน็ต') !== -1) {
    fallbackCat = 'cat_exp_utilities';
    fallbackTags = 'utilities,bills';
  } else if (combined.indexOf('ค่าเช่า') !== -1 || combined.indexOf('คอนโด') !== -1) {
    fallbackCat = 'cat_exp_housing';
    fallbackTags = 'housing';
  } else if (combined.indexOf('เงินเดือน') !== -1 || combined.indexOf('salary') !== -1) {
    fallbackCat = 'cat_inc_salary';
    fallbackTags = 'salary,income';
  }

  return {
    matched_by: 'smart_heuristic',
    rule_id: null,
    rule_name: 'Smart Keyword Recommendation',
    suggested_category_id: fallbackCat,
    suggested_tags: fallbackTags
  };
}

/**
 * Generates comprehensive Smart Finance Analytics (Phase 4 — Module J):
 * 1. Spending Anomaly Detection (transactions significantly higher than category average)
 * 2. 30 / 60 / 90-Day Cashflow Forecast (combining current liquid balance, Recurring, unpaid Bills, and Debt installments)
 * 3. Budget & Savings Goal Risk Analysis
 */
function handleSmartAnalyticsInsights(ctx, params) {
  const userId = ctx.user.user_id;
  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
  const allCats = readSheetObjects(SHEET_NAMES.CATEGORIES);
  const catMap = {};
  for (let i = 0; i < allCats.length; i++) {
    catMap[allCats[i].category_id] = allCats[i].category_name;
  }

  // 1. Anomaly Detection across posted expense transactions
  const catStats = {};
  const userExpenses = [];
  for (let i = 0; i < allTxs.length; i++) {
    const tx = allTxs[i];
    if (tx.user_id !== userId || tx.status !== 'posted' || tx.tx_type !== 'expense') continue;
    const amt = Number(tx.amount || 0);
    if (amt <= 0) continue;
    const cid = tx.category_id || 'uncategorized';
    if (!catStats[cid]) catStats[cid] = { sum: 0, count: 0, values: [] };
    catStats[cid].sum += amt;
    catStats[cid].count++;
    catStats[cid].values.push(amt);
    userExpenses.push(tx);
  }

  const anomalies = [];
  for (let i = 0; i < userExpenses.length; i++) {
    const tx = userExpenses[i];
    const cid = tx.category_id || 'uncategorized';
    const st = catStats[cid];
    const amt = Number(tx.amount || 0);
    const avg = st && st.count > 0 ? st.sum / st.count : amt;

    // Flag if transaction is >= 1.75x of category average (when >= 2 items) or high single spend >= 5,000 THB
    if ((st.count >= 2 && amt >= avg * 1.75 && amt - avg >= 500) || amt >= 5000) {
      const ratio = avg > 0 ? Math.round((amt / avg) * 100) / 100 : 1;
      anomalies.push({
        transaction_id: tx.transaction_id,
        tx_date: String(tx.tx_date || ''),
        merchant: tx.merchant || tx.description || 'ไม่ระบุร้านค้า',
        category_id: cid,
        category_name: catMap[cid] || cid,
        amount: Math.round(amt * 100) / 100,
        category_average: Math.round(avg * 100) / 100,
        multiplier_vs_avg: ratio,
        reason: st.count >= 2 && amt >= avg * 1.75
          ? 'สูงกว่าค่าเฉลี่ยของหมวดหมู่นี้ถึง ' + ratio + ' เท่า'
          : 'รายจ่ายก้อนใหญ่ผิดปกติ (High-Value Outflow)'
      });
    }
  }
  anomalies.sort(function(a, b) { return b.amount - a.amount; });

  // 2. Cashflow Forecast (30, 60, 90 days)
  const accs = recalculateUserAccountBalances(userId);
  let liquidBalance = 0;
  for (let i = 0; i < accs.length; i++) {
    if (accs[i].is_archived) continue;
    if (accs[i].account_type === 'cash' || accs[i].account_type === 'bank' || accs[i].account_type === 'ewallet') {
      liquidBalance += Number(accs[i].current_balance || 0);
    }
  }

  const recData = handleRecurringList(ctx, {});
  const billsData = handleBillsList(ctx, {});
  const debtsData = handleDebtsList(ctx, {});

  const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
  const todayMs = new Date(todayStr + 'T00:00:00').getTime();

  const buildHorizonForecast = function(days) {
    let recInc = 0;
    let recExp = 0;
    const forecasts = recData.upcoming_forecasts || [];
    for (let i = 0; i < forecasts.length; i++) {
      const f = forecasts[i];
      const fMs = new Date(String(f.scheduled_date) + 'T00:00:00').getTime();
      const diffDays = Math.round((fMs - todayMs) / 86400000);
      if (diffDays >= 0 && diffDays <= days) {
        if (f.tx_type === 'income') recInc += Number(f.amount || 0);
        else if (f.tx_type === 'expense') recExp += Number(f.amount || 0);
      }
    }

    let unpaidBillsAmt = 0;
    const bills = billsData.bills || [];
    for (let i = 0; i < bills.length; i++) {
      if (bills[i].effective_status !== 'paid' && bills[i].days_until_due <= days) {
        unpaidBillsAmt += Number(bills[i].amount || 0);
      }
    }

    const monthsFactor = Math.max(1, Math.round(days / 30));
    const debtCommitments = Number((debtsData.summary && debtsData.summary.combined_monthly_debt_service) || 0) * monthsFactor;

    const totalOutflow = Math.round((recExp + unpaidBillsAmt + debtCommitments) * 100) / 100;
    const netFlow = Math.round((recInc - totalOutflow) * 100) / 100;
    const endingCash = Math.round((liquidBalance + netFlow) * 100) / 100;

    return {
      horizon_days: days,
      starting_liquid_cash: Math.round(liquidBalance * 100) / 100,
      expected_income: Math.round(recInc * 100) / 100,
      expected_recurring_expense: Math.round(recExp * 100) / 100,
      unpaid_bills_due: Math.round(unpaidBillsAmt * 100) / 100,
      debt_service_commitments: Math.round(debtCommitments * 100) / 100,
      total_expected_outflow: totalOutflow,
      projected_net_cashflow: netFlow,
      projected_ending_cash: endingCash,
      cashflow_status: endingCash < 0 ? 'deficit_risk' : (netFlow < 0 ? 'drawdown' : 'surplus')
    };
  };

  // 3. Budget & Goal Risk Alerts
  const budgets = handleBudgetsList(ctx, {}).budgets || [];
  const goals = handleGoalsList(ctx, {}).goals || [];

  const atRiskBudgets = budgets.filter(function(b) {
    return b.status === 'warning' || b.status === 'over_budget' || b.status === 'exceeded';
  });
  const atRiskGoals = goals.filter(function(g) {
    return g.risk_status === 'at_risk' || g.risk_status === 'behind' || (g.progress_pct < 100 && g.days_remaining < 60);
  });

  return {
    starting_liquid_balance: Math.round(liquidBalance * 100) / 100,
    anomalies_detected: anomalies.slice(0, 15),
    cashflow_forecasts: {
      days_30: buildHorizonForecast(30),
      days_60: buildHorizonForecast(60),
      days_90: buildHorizonForecast(90)
    },
    risk_radar: {
      at_risk_budgets_count: atRiskBudgets.length,
      at_risk_budgets: atRiskBudgets,
      at_risk_goals_count: atRiskGoals.length,
      at_risk_goals: atRiskGoals
    }
  };
}

/**
 * Optional Email & Google Calendar Reminder Dispatch (Module J — when authorized in GAS).
 */
function handleSmartSendReminderExternal(ctx, params) {
  const userId = ctx.user.user_id;
  const channel = requireEnum(params.channel || 'email', ['email', 'calendar'], 'ช่องทางแจ้งเตือน (channel)');
  const title = requireString(params.title, 'หัวข้อแจ้งเตือน (title)', 150);
  const message = requireString(params.message, 'ข้อความแจ้งเตือน (message)', 1000);
  const eventDate = params.event_date ? requireDateStr(params.event_date, 'วันที่นัดหมาย') : Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

  let dispatched = false;
  let detail = '';

  try {
    if (channel === 'email') {
      MailApp.sendEmail({
        to: ctx.user.email,
        subject: '[PFM Pro Alert] ' + title,
        body: message
      });
      dispatched = true;
      detail = 'ส่งอีเมลแจ้งเตือนไปยัง ' + ctx.user.email + ' สำเร็จ';
    } else if (channel === 'calendar') {
      const cal = CalendarApp.getDefaultCalendar();
      if (!cal) {
        throw createAppError('CALENDAR_UNAVAILABLE', 'ไม่พบ Google Calendar หลักของบัญชีนี้', 400);
      }
      const parts = eventDate.split('-');
      const dt = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
      cal.createAllDayEvent('[PFM Pro] ' + title, dt, { description: message });
      dispatched = true;
      detail = 'สร้างกิจกรรมแจ้งเตือนใน Google Calendar วันที่ ' + eventDate + ' สำเร็จ';
    }
  } catch (e) {
    detail = 'บันทึกคำสั่งแจ้งเตือนในระบบแล้ว (หากรันบน GAS Web App จริง ต้องอนุญาตสิทธิ์ MailApp/CalendarApp: ' + e.message + ')';
  }

  writeAuditLog(ctx, 'automation.sendReminder', 'Notifications', userId, 'ส่งการแจ้งเตือนผ่าน ' + channel + ': ' + title, {
    channel: channel,
    dispatched: dispatched,
    event_date: eventDate
  });

  return {
    channel: channel,
    dispatched: dispatched,
    detail: detail
  };
}

function doesRuleMatch(rule, merchant, description, amount) {
  const field = String(rule.match_field || 'any_text');
  const op = String(rule.match_operator || 'contains');
  const targetVal = String(rule.match_value || '').toLowerCase().trim();
  if (!targetVal) return false;

  if (field === 'amount') {
    const numTarget = Number(targetVal);
    if (isNaN(numTarget)) return false;
    if (op === 'gt') return amount > numTarget;
    if (op === 'lt') return amount < numTarget;
    if (op === 'equals') return Math.abs(amount - numTarget) < 0.01;
    return false;
  }

  let sourceText = '';
  if (field === 'merchant') sourceText = String(merchant || '').toLowerCase();
  else if (field === 'description') sourceText = String(description || '').toLowerCase();
  else sourceText = (String(merchant || '') + ' ' + String(description || '')).toLowerCase();

  if (op === 'equals') return sourceText.trim() === targetVal;
  if (op === 'starts_with') return sourceText.trim().indexOf(targetVal) === 0;
  return sourceText.indexOf(targetVal) !== -1;
}

function normalizeRuleObject(r, catMap) {
  return {
    rule_id: r.rule_id,
    rule_name: r.rule_name,
    match_field: r.match_field || 'any_text',
    match_operator: r.match_operator || 'contains',
    match_value: String(r.match_value || ''),
    assign_category_id: r.assign_category_id,
    assign_category_name: (catMap && catMap[r.assign_category_id]) || r.assign_category_id,
    assign_tags: r.assign_tags || '',
    is_active: toBoolean(r.is_active, true),
    priority: Number(r.priority || 10),
    created_at: r.created_at,
    updated_at: r.updated_at
  };
}



/** --- FILE: SystemService.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: SystemService.gs
 * Description: User-isolated Backup, Restore, and Audit Log inspection.
 */

const USER_SCOPED_SHEETS = [
  SHEET_NAMES.ACCOUNTS,
  SHEET_NAMES.TRANSACTIONS,
  SHEET_NAMES.CATEGORIES,
  SHEET_NAMES.BUDGETS,
  SHEET_NAMES.GOALS,
  SHEET_NAMES.GOAL_CONTRIBUTIONS,
  SHEET_NAMES.RECURRING,
  SHEET_NAMES.DEBTS,
  SHEET_NAMES.DEBT_PAYMENTS,
  SHEET_NAMES.BILLS,
  SHEET_NAMES.RULES,
  SHEET_NAMES.NOTIFICATIONS,
  SHEET_NAMES.IMPORT_HISTORY,
  SHEET_NAMES.SETTINGS
];

/**
 * Exports all rows belonging to the authenticated user across all sheets as a verified JSON backup.
 */
function handleSystemBackupExport(ctx) {
  const userId = ctx.user.user_id;
  const tables = {};

  for (let i = 0; i < USER_SCOPED_SHEETS.length; i++) {
    const sheetName = USER_SCOPED_SHEETS[i];
    const rows = readSheetObjects(sheetName).filter(function(r) {
      return r.user_id === userId;
    }).map(function(r) {
      const copy = Object.assign({}, r);
      delete copy._rowIndex;
      return copy;
    });
    tables[sheetName] = rows;
  }

  writeAuditLog(ctx, 'system.backupExport', 'System', userId, 'ส่งออกไฟล์สำรองข้อมูลผู้ใช้', {});

  return {
    backup: {
      app: APP_CONFIG.APP_NAME,
      version: APP_CONFIG.VERSION,
      exported_at: nowIso(),
      user: sanitizeUser(ctx.user),
      tables: tables
    }
  };
}

/**
 * Restores non-duplicate records from a user backup JSON snapshot into Google Sheets.
 */
function handleSystemBackupRestore(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const backup = params && params.backup;
    if (!backup || !backup.tables || typeof backup.tables !== 'object') {
      throw createAppError('VALIDATION_ERROR', 'โครงสร้างไฟล์สำรองข้อมูลไม่ถูกต้อง', 400);
    }

    const restoredCounts = {};
    const primaryKeys = {
      [SHEET_NAMES.ACCOUNTS]: 'account_id',
      [SHEET_NAMES.TRANSACTIONS]: 'transaction_id',
      [SHEET_NAMES.CATEGORIES]: 'category_id',
      [SHEET_NAMES.BUDGETS]: 'budget_id',
      [SHEET_NAMES.GOALS]: 'goal_id',
      [SHEET_NAMES.GOAL_CONTRIBUTIONS]: 'contribution_id',
      [SHEET_NAMES.RECURRING]: 'recurring_id',
      [SHEET_NAMES.DEBTS]: 'debt_id',
      [SHEET_NAMES.DEBT_PAYMENTS]: 'payment_id',
      [SHEET_NAMES.BILLS]: 'bill_id',
      [SHEET_NAMES.RULES]: 'rule_id',
      [SHEET_NAMES.NOTIFICATIONS]: 'notification_id',
      [SHEET_NAMES.IMPORT_HISTORY]: 'import_id',
      [SHEET_NAMES.SETTINGS]: 'setting_id'
    };

    for (let i = 0; i < USER_SCOPED_SHEETS.length; i++) {
      const sheetName = USER_SCOPED_SHEETS[i];
      const incomingRows = backup.tables[sheetName];
      if (!Array.isArray(incomingRows) || incomingRows.length === 0) {
        restoredCounts[sheetName] = 0;
        continue;
      }

      const pk = primaryKeys[sheetName];
      const existingRows = readSheetObjects(sheetName);
      const existingIds = {};
      existingRows.forEach(function(r) {
        if (r[pk]) existingIds[r[pk]] = true;
      });

      const toAppend = [];
      incomingRows.forEach(function(item) {
        // Force ownership to current authenticated user_id for security
        const safeItem = Object.assign({}, item, { user_id: userId });
        if (pk && safeItem[pk] && !existingIds[safeItem[pk]]) {
          toAppend.push(safeItem);
          existingIds[safeItem[pk]] = true;
        }
      });

      if (toAppend.length > 0) {
        batchAppendObjects(sheetName, toAppend);
      }
      restoredCounts[sheetName] = toAppend.length;
    }

    recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'system.backupRestore', 'System', userId, 'กู้คืนข้อมูลจากไฟล์สำรอง', restoredCounts);

    return {
      restored_counts: restoredCounts,
      timestamp: nowIso()
    };
  });
}

/**
 * Lists recent audit logs for the authenticated user.
 */
function handleSystemAuditLogs(ctx, params) {
  const userId = ctx.user.user_id;
  const limit = Math.min(100, Math.max(1, parseInt((params && params.limit) || 50, 10)));

  const logs = readSheetObjects(SHEET_NAMES.AUDIT_LOGS)
    .filter(function(l) { return l.user_id === userId; })
    .reverse()
    .slice(0, limit)
    .map(function(l) {
      return {
        log_id: l.log_id,
        request_id: l.request_id,
        action: l.action,
        entity_type: l.entity_type,
        entity_id: l.entity_id,
        summary: l.summary,
        created_at: l.created_at
      };
    });

  return { audit_logs: logs };
}



/** --- FILE: Setup.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: Setup.gs
 * Description: Automated database schema creation, header verification, and isolated demo data seeding.
 */

const DEFAULT_SYSTEM_CATEGORIES = [
  ['cat_inc_salary', 'SYSTEM', '', 'เงินเดือนประจำ (Salary)', 'income', '#10B981', 'briefcase', true, true],
  ['cat_inc_bonus', 'SYSTEM', 'cat_inc_salary', 'โบนัสและคอมมิชชัน (Bonus)', 'income', '#059669', 'award', true, true],
  ['cat_inc_freelance', 'SYSTEM', '', 'รายได้เสริม / ฟรีแลนซ์', 'income', '#34D399', 'laptop', true, true],
  ['cat_inc_invest', 'SYSTEM', '', 'ผลตอบแทนการลงทุน / ปันผล', 'income', '#0EA5E9', 'trending-up', true, true],
  ['cat_inc_other', 'SYSTEM', '', 'รายรับอื่นๆ', 'income', '#6366F1', 'plus-circle', true, true],
  ['cat_exp_food', 'SYSTEM', '', 'อาหารและเครื่องดื่ม', 'expense', '#F59E0B', 'utensils', true, true],
  ['cat_exp_food_dining', 'SYSTEM', 'cat_exp_food', 'ทานอาหารนอกบ้าน', 'expense', '#D97706', 'coffee', true, true],
  ['cat_exp_food_grocery', 'SYSTEM', 'cat_exp_food', 'ของสด / ซูเปอร์มาร์เก็ต', 'expense', '#FBBF24', 'shopping-basket', true, true],
  ['cat_exp_transport', 'SYSTEM', '', 'การเดินทางและยานพาหนะ', 'expense', '#3B82F6', 'car', true, true],
  ['cat_exp_transport_fuel', 'SYSTEM', 'cat_exp_transport', 'ค่าน้ำมัน / ชาร์จไฟ', 'expense', '#2563EB', 'fuel', true, true],
  ['cat_exp_transport_transit', 'SYSTEM', 'cat_exp_transport', 'รถไฟฟ้า / แท็กซี่ / ทางด่วน', 'expense', '#60A5FA', 'train', true, true],
  ['cat_exp_housing', 'SYSTEM', '', 'ที่อยู่อาศัยและสาธารณูปโภค', 'expense', '#8B5CF6', 'home', true, true],
  ['cat_exp_housing_rent', 'SYSTEM', 'cat_exp_housing', 'ค่าเช่า / ผ่อนบ้าน', 'expense', '#7C3AED', 'key', true, true],
  ['cat_exp_housing_util', 'SYSTEM', 'cat_exp_housing', 'ค่าน้ำ / ค่าไฟ / อินเทอร์เน็ต', 'expense', '#A78BFA', 'zap', true, true],
  ['cat_exp_shopping', 'SYSTEM', '', 'ช้อปปิ้งและของใช้ส่วนตัว', 'expense', '#EC4899', 'shopping-bag', true, true],
  ['cat_exp_health', 'SYSTEM', '', 'สุขภาพและการแพทย์', 'expense', '#EF4444', 'heart-pulse', true, true],
  ['cat_exp_entertainment', 'SYSTEM', '', 'บันเทิงและสมาชิกรายเดือน', 'expense', '#14B8A6', 'film', true, true],
  ['cat_exp_education', 'SYSTEM', '', 'การศึกษาและพัฒนาตนเอง', 'expense', '#06B6D4', 'book-open', true, true],
  ['cat_exp_debt_interest', 'SYSTEM', '', 'ดอกเบี้ยและค่าธรรมเนียมการเงิน', 'expense', '#DC2626', 'percent', true, true],
  ['cat_trf_internal', 'SYSTEM', '', 'โอนเงินระหว่างบัญชี', 'transfer', '#64748B', 'arrow-left-right', true, true],
  ['cat_adj_reconcile', 'SYSTEM', '', 'ปรับปรุงยอดเงิน (กระทบยอด)', 'adjustment', '#94A3B8', 'sliders', true, true]
];

/**
 * Automatically creates all 16 required sheets, configures headers, and seeds system categories.
 * Can be triggered directly from Apps Script editor or via API action `system.setup`.
 */
function setupDatabase() {
  return withWriteLock(function() {
    const ss = getSpreadsheet();
    const createdSheets = [];
    const verifiedSheets = [];
    const sheetKeys = Object.keys(SHEET_NAMES);

    for (let i = 0; i < sheetKeys.length; i++) {
      const sheetName = SHEET_NAMES[sheetKeys[i]];
      const expectedHeaders = SHEET_HEADERS[sheetName];
      let sheet = ss.getSheetByName(sheetName);

      if (!sheet) {
        sheet = ss.insertSheet(sheetName);
        createdSheets.push(sheetName);
      } else {
        verifiedSheets.push(sheetName);
      }

      // Ensure header row matches schema
      const lastCol = Math.max(sheet.getLastColumn(), expectedHeaders.length);
      const currentHeaders = sheet.getLastRow() >= 1
        ? sheet.getRange(1, 1, 1, expectedHeaders.length).getValues()[0]
        : [];

      let needsHeaderWrite = false;
      for (let c = 0; c < expectedHeaders.length; c++) {
        if (String(currentHeaders[c] || '').trim() !== expectedHeaders[c]) {
          needsHeaderWrite = true;
          break;
        }
      }

      if (needsHeaderWrite) {
        const headerRange = sheet.getRange(1, 1, 1, expectedHeaders.length);
        headerRange.setValues([expectedHeaders]);
        headerRange.setFontWeight('bold');
        headerRange.setBackground('#0F172A');
        headerRange.setFontColor('#F8FAFC');
        sheet.setFrozenRows(1);
      }
    }

    // Remove default 'Sheet1' if it still exists and is not one of our 16 sheets
    const defaultSheet = ss.getSheetByName('Sheet1');
    if (defaultSheet && ss.getSheets().length > 1) {
      ss.deleteSheet(defaultSheet);
    }

    // Seed default SYSTEM categories if missing
    const existingCats = readSheetObjects(SHEET_NAMES.CATEGORIES);
    const existingCatIds = {};
    existingCats.forEach(function(c) {
      existingCatIds[c.category_id] = true;
    });

    const now = nowIso();
    const catsToAppend = [];
    DEFAULT_SYSTEM_CATEGORIES.forEach(function(row) {
      if (!existingCatIds[row[0]]) {
        catsToAppend.push({
          category_id: row[0],
          user_id: row[1],
          parent_id: row[2],
          category_name: row[3],
          category_type: row[4],
          color: row[5],
          icon: row[6],
          is_system: row[7],
          is_active: row[8],
          created_at: now,
          updated_at: now
        });
      }
    });

    if (catsToAppend.length > 0) {
      batchAppendObjects(SHEET_NAMES.CATEGORIES, catsToAppend);
    }

    return {
      spreadsheet_id: ss.getId(),
      spreadsheet_name: ss.getName(),
      created_sheets: createdSheets,
      verified_sheets: verifiedSheets,
      seeded_categories_count: catsToAppend.length,
      timestamp: now
    };
  });
}



/** --- FILE: Code.gs --- */
/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: Code.gs
 * Description: Main API Router (doGet / doPost) with unified JSON response envelope,
 *              request tracing, authentication enforcement, and safe error handling.
 */

const PUBLIC_ACTIONS = [
  'system.ping',
  'system.setup',
  'auth.register',
  'auth.login'
];

/**
 * Handles HTTP GET requests (Health check / API status).
 */
function doGet(e) {
  const requestId = generateId('req');
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'system.ping';

  try {
    if (action === 'system.ping') {
      return createJsonResponse({
        ok: true,
        request_id: requestId,
        action: 'system.ping',
        timestamp: nowIso(),
        data: {
          service: APP_CONFIG.APP_NAME,
          version: APP_CONFIG.VERSION,
          status: 'healthy'
        }
      });
    }
    return createJsonResponse({
      ok: false,
      request_id: requestId,
      action: action,
      timestamp: nowIso(),
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'กรุณาเรียกใช้งาน API ผ่าน HTTP POST'
      }
    });
  } catch (err) {
    return createErrorResponse(requestId, action, err);
  }
}

/**
 * Handles HTTP POST requests from Standalone Frontend.
 * Supports JSON payload sent with Content-Type: text/plain;charset=utf-8 to avoid GAS CORS preflight issues.
 */
function doPost(e) {
  const requestId = generateId('req');
  let action = 'unknown';

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw createAppError('BAD_REQUEST', 'ไม่พบข้อมูล JSON Payload ในคำขอ', 400);
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw createAppError('INVALID_JSON', 'รูปแบบ JSON ในคำขอไม่ถูกต้อง', 400);
    }

    action = requireString(payload.action, 'API Action (action)', 80);
    const params = payload.params || {};
    const ctx = {
      requestId: requestId,
      action: action,
      user: null
    };

    // Enforce authentication on all non-public actions
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      ctx.user = authenticateRequest(payload);
    }

    const resultData = routeAction(ctx, action, params);

    return createJsonResponse({
      ok: true,
      request_id: requestId,
      action: action,
      timestamp: nowIso(),
      data: resultData
    });
  } catch (err) {
    return createErrorResponse(requestId, action, err);
  }
}

/**
 * Dispatches validated action to the corresponding domain service handler.
 */
function routeAction(ctx, action, params) {
  switch (action) {
    // System & Setup
    case 'system.ping':
      return {
        service: APP_CONFIG.APP_NAME,
        version: APP_CONFIG.VERSION,
        status: 'healthy'
      };
    case 'system.setup':
      return setupDatabase();
    case 'system.backupExport':
      return handleSystemBackupExport(ctx);
    case 'system.backupRestore':
      return handleSystemBackupRestore(ctx, params);
    case 'system.auditLogs':
      return handleSystemAuditLogs(ctx, params);

    // Authentication & User Profile
    case 'auth.register':
      return handleAuthRegister(ctx, params);
    case 'auth.login':
      return handleAuthLogin(ctx, params);
    case 'auth.logout':
      return handleAuthLogout(ctx);
    case 'auth.me':
      return { user: sanitizeUser(ctx.user) };
    case 'auth.updateProfile':
      return handleAuthUpdateProfile(ctx, params);

    // Categories
    case 'categories.list':
      return handleCategoriesList(ctx, params);
    case 'categories.create':
      return handleCategoriesCreate(ctx, params);
    case 'categories.update':
      return handleCategoriesUpdate(ctx, params);

    // Accounts
    case 'accounts.list':
      return handleAccountsList(ctx, params);
    case 'accounts.create':
      return handleAccountsCreate(ctx, params);
    case 'accounts.update':
      return handleAccountsUpdate(ctx, params);
    case 'accounts.reconcile':
      return handleAccountsReconcile(ctx, params);
    case 'accounts.balanceHistory':
      return handleAccountsBalanceHistory(ctx, params);

    // Transactions
    case 'transactions.list':
      return handleTransactionsList(ctx, params);
    case 'transactions.create':
      return handleTransactionsCreate(ctx, params);
    case 'transactions.update':
      return handleTransactionsUpdate(ctx, params);
    case 'transactions.void':
      return handleTransactionsVoid(ctx, params);
    case 'transactions.importCsvPreview':
      return handleTransactionsImportPreview(ctx, params);
    case 'transactions.importCsvCommit':
      return handleTransactionsImportCommit(ctx, params);

    // Dashboard
    case 'dashboard.summary':
      return handleDashboardSummary(ctx, params);

    // Phase 2: Budgets (Module D)
    case 'budgets.list':
      return handleBudgetsList(ctx, params);
    case 'budgets.create':
      return handleBudgetsCreate(ctx, params);
    case 'budgets.update':
      return handleBudgetsUpdate(ctx, params);
    case 'budgets.delete':
      return handleBudgetsDelete(ctx, params);

    // Phase 2: Savings Goals (Module E)
    case 'goals.list':
      return handleGoalsList(ctx, params);
    case 'goals.create':
      return handleGoalsCreate(ctx, params);
    case 'goals.update':
      return handleGoalsUpdate(ctx, params);
    case 'goals.contribute':
      return handleGoalsContribute(ctx, params);

    // Phase 2: Recurring Transactions (Module F)
    case 'recurring.list':
      return handleRecurringList(ctx, params);
    case 'recurring.create':
      return handleRecurringCreate(ctx, params);
    case 'recurring.update':
      return handleRecurringUpdate(ctx, params);
    case 'recurring.processDue':
      return handleRecurringProcessDue(ctx, params);

    // Phase 2: Reports & Analytics (Module H)
    case 'reports.overview':
      return handleReportsOverview(ctx, params);

    // Phase 3: Debts, Amortization & Credit Cards (Module G)
    case 'debts.list':
      return handleDebtsList(ctx, params);
    case 'debts.create':
      return handleDebtsCreate(ctx, params);
    case 'debts.update':
      return handleDebtsUpdate(ctx, params);
    case 'debts.pay':
      return handleDebtsPay(ctx, params);
    case 'debts.payCreditCard':
      return handleDebtsPayCreditCard(ctx, params);
    case 'debts.amortization':
      return handleDebtsAmortization(ctx, params);

    // Phase 3: Bills & Reminders (Module G) + Import History (Module I)
    case 'bills.list':
      return handleBillsList(ctx, params);
    case 'bills.create':
      return handleBillsCreate(ctx, params);
    case 'bills.update':
      return handleBillsUpdate(ctx, params);
    case 'bills.pay':
      return handleBillsPay(ctx, params);
    case 'imports.list':
      return handleImportsList(ctx, params);

    // Phase 3: Smart Alerts & Notifications
    case 'notifications.list':
      return handleNotificationsList(ctx, params);
    case 'notifications.generateAlerts':
      return handleNotificationsGenerateAlerts(ctx, params);
    case 'notifications.markRead':
      return handleNotificationsMarkRead(ctx, params);

    // Phase 4: Smart Finance, Automation Rules & Anomaly Analytics (Module J)
    case 'rules.list':
      return handleRulesList(ctx, params);
    case 'rules.create':
      return handleRulesCreate(ctx, params);
    case 'rules.update':
      return handleRulesUpdate(ctx, params);
    case 'rules.delete':
      return handleRulesDelete(ctx, params);
    case 'rules.evaluate':
      return handleRulesEvaluate(ctx, params);
    case 'analytics.insights':
      return handleSmartAnalyticsInsights(ctx, params);
    case 'automation.sendReminder':
      return handleSmartSendReminderExternal(ctx, params);

    default:
      throw createAppError('UNKNOWN_ACTION', 'ไม่รองรับคำสั่ง API Action: ' + action, 404);
  }
}

/**
 * Formats a standard JSON ContentService output.
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Formats an error response without leaking internal stack traces or secrets.
 */
function createErrorResponse(requestId, action, err) {
  const isKnown = Boolean(err && err.isAppError);
  const code = isKnown ? err.code : 'INTERNAL_ERROR';
  const message = isKnown
    ? err.message
    : 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง (อ้างอิง: ' + requestId + ')';

  if (!isKnown) {
    Logger.log('[ERROR ' + requestId + '] ' + (err && err.stack ? err.stack : String(err)));
  }

  return createJsonResponse({
    ok: false,
    request_id: requestId,
    action: action,
    timestamp: nowIso(),
    error: {
      code: code,
      message: message,
      details: isKnown ? (err.details || null) : null
    }
  });
}



