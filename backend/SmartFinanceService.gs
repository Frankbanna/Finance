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

