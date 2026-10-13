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

