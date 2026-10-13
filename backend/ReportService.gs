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
