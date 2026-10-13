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
