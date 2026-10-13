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

