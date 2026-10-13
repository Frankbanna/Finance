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

