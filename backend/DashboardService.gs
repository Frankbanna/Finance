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

