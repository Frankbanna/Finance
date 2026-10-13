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
