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
