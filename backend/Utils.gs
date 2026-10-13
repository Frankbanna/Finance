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

