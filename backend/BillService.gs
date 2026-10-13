/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: BillService.gs (Phase 3 — Module G: Bills & Due Reminders + Module I: Import History)
 * Description: Manages bills (Bills sheet), due date tracking, automatic recurring bill generation on payment,
 *              and Import_History retrieval.
 */

const ALLOWED_BILL_STATUSES = ['unpaid', 'paid', 'overdue', 'cancelled'];
const ALLOWED_BILL_FREQUENCIES = ['once', 'weekly', 'monthly', 'quarterly', 'yearly'];

/**
 * Lists all bills for the authenticated user, automatically detecting overdue status and upcoming alerts.
 */
function handleBillsList(ctx, params) {
  const userId = ctx.user.user_id;
  const statusFilter = optionalString(params && params.status, 20);
  const allBills = readSheetObjects(SHEET_NAMES.BILLS);
  const allCategories = readSheetObjects(SHEET_NAMES.CATEGORIES);

  const catMap = {};
  for (let i = 0; i < allCategories.length; i++) {
    catMap[allCategories[i].category_id] = allCategories[i];
  }

  const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
  const todayTime = new Date(todayStr + 'T00:00:00').getTime();

  const bills = [];
  let unpaidTotal = 0;
  let overdueTotal = 0;
  let dueSoonTotal = 0;
  let paidThisMonthTotal = 0;
  let overdueCount = 0;
  let dueSoonCount = 0;
  const currentYm = todayStr.substring(0, 7);

  for (let i = 0; i < allBills.length; i++) {
    const b = allBills[i];
    if (b.user_id !== userId) continue;

    const enriched = enrichBillObject(b, catMap, todayStr, todayTime);
    if (statusFilter && enriched.effective_status !== statusFilter) continue;

    bills.push(enriched);

    if (enriched.effective_status === 'overdue') {
      overdueTotal += enriched.amount;
      unpaidTotal += enriched.amount;
      overdueCount++;
    } else if (enriched.effective_status === 'unpaid') {
      unpaidTotal += enriched.amount;
      if (enriched.is_due_soon) {
        dueSoonTotal += enriched.amount;
        dueSoonCount++;
      }
    } else if (enriched.effective_status === 'paid' && String(enriched.due_date).substring(0, 7) === currentYm) {
      paidThisMonthTotal += enriched.amount;
    }
  }

  // Sort: overdue first, then unpaid by due_date ascending, then paid
  bills.sort(function(a, b) {
    const order = { overdue: 0, unpaid: 1, paid: 2, cancelled: 3 };
    const oa = order[a.effective_status] !== undefined ? order[a.effective_status] : 9;
    const ob = order[b.effective_status] !== undefined ? order[b.effective_status] : 9;
    if (oa !== ob) return oa - ob;
    return String(a.due_date).localeCompare(String(b.due_date));
  });

  return {
    summary: {
      total_bills: bills.length,
      unpaid_total: Math.round(unpaidTotal * 100) / 100,
      overdue_count: overdueCount,
      overdue_total: Math.round(overdueTotal * 100) / 100,
      due_soon_count: dueSoonCount,
      due_soon_total: Math.round(dueSoonTotal * 100) / 100,
      paid_this_month_total: Math.round(paidThisMonthTotal * 100) / 100
    },
    bills: bills
  };
}

/**
 * Creates a new bill reminder in the Bills sheet.
 */
function handleBillsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const billName = requireString(params.bill_name, 'ชื่อบิล/รายการแจ้งเตือน (bill_name)', 120);
    const categoryId = optionalString(params.category_id, 64) || 'cat_exp_utilities';
    const amount = requireNumber(params.amount, 'จำนวนเงินตามบิล (amount)', false, false);
    const currency = optionalString(params.currency, 10) || ctx.user.base_currency || 'THB';
    const dueDate = requireDateStr(params.due_date, 'วันครบกำหนดชำระ (due_date)');
    const isRecurring = toBoolean(params.is_recurring, false);
    const frequency = isRecurring
      ? requireEnum(params.frequency || 'monthly', ALLOWED_BILL_FREQUENCIES, 'ความถี่ของบิล (frequency)')
      : 'once';
    const remindDaysBefore = (params.remind_days_before !== undefined && params.remind_days_before !== '')
      ? Math.max(0, Math.min(60, Math.round(Number(params.remind_days_before))))
      : 3;
    const notes = optionalString(params.notes, 300);

    const now = nowIso();
    const billId = generateId('bil');
    const newBill = {
      bill_id: billId,
      user_id: userId,
      bill_name: billName,
      category_id: categoryId,
      amount: amount,
      currency: currency,
      due_date: dueDate,
      is_recurring: isRecurring,
      frequency: frequency,
      status: 'unpaid',
      remind_days_before: remindDaysBefore,
      paid_transaction_id: '',
      notes: notes,
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.BILLS, newBill);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'bills.create', 'Bills', billId, 'สร้างบิลแจ้งเตือน: ' + billName + ' ครบกำหนด ' + dueDate, {
      amount: amount,
      due_date: dueDate,
      is_recurring: isRecurring
    });

    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const todayTime = new Date(todayStr + 'T00:00:00').getTime();
    return {
      bill: enrichBillObject(newBill, {}, todayStr, todayTime)
    };
  });
}

/**
 * Updates an existing bill record.
 */
function handleBillsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const billId = requireString(params.bill_id, 'รหัสบิล (bill_id)', 64);

    const allBills = readSheetObjects(SHEET_NAMES.BILLS);
    let target = null;
    for (let i = 0; i < allBills.length; i++) {
      if (allBills[i].bill_id === billId && allBills[i].user_id === userId) {
        target = allBills[i];
        break;
      }
    }
    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบบิลที่ต้องการแก้ไข', 404);
    }

    if (params.bill_name !== undefined) target.bill_name = requireString(params.bill_name, 'ชื่อบิล', 120);
    if (params.category_id !== undefined) target.category_id = optionalString(params.category_id, 64);
    if (params.amount !== undefined) target.amount = requireNumber(params.amount, 'จำนวนเงิน', false, false);
    if (params.due_date !== undefined) target.due_date = requireDateStr(params.due_date, 'วันครบกำหนด');
    if (params.is_recurring !== undefined) target.is_recurring = toBoolean(params.is_recurring, false);
    if (params.frequency !== undefined) target.frequency = requireEnum(params.frequency, ALLOWED_BILL_FREQUENCIES, 'ความถี่');
    if (params.remind_days_before !== undefined) target.remind_days_before = Math.max(0, Math.round(Number(params.remind_days_before)));
    if (params.status !== undefined) target.status = requireEnum(params.status, ALLOWED_BILL_STATUSES, 'สถานะบิล');
    if (params.notes !== undefined) target.notes = optionalString(params.notes, 300);

    target.updated_at = nowIso();
    updateSheetRowByIndex(SHEET_NAMES.BILLS, target._rowIndex, target);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'bills.update', 'Bills', billId, 'แก้ไขข้อมูลบิล: ' + target.bill_name, {
      status: target.status,
      due_date: target.due_date
    });

    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const todayTime = new Date(todayStr + 'T00:00:00').getTime();
    return {
      bill: enrichBillObject(target, {}, todayStr, todayTime)
    };
  });
}

/**
 * Marks a bill as paid, creates a real transaction in Transactions (or transfer if paying a credit card bill),
 * and automatically generates the next recurring bill if `is_recurring = true`.
 */
function handleBillsPay(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const billId = requireString(params.bill_id, 'รหัสบิล (bill_id)', 64);
    const accountId = requireString(params.account_id, 'บัญชีที่ใช้ชำระบิล (account_id)', 64);
    const paymentDate = params.payment_date
      ? requireDateStr(params.payment_date, 'วันที่ชำระบิล')
      : Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');

    const allBills = readSheetObjects(SHEET_NAMES.BILLS);
    let targetBill = null;
    for (let i = 0; i < allBills.length; i++) {
      if (allBills[i].bill_id === billId && allBills[i].user_id === userId) {
        targetBill = allBills[i];
        break;
      }
    }
    if (!targetBill) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการบิลที่ต้องการชำระ', 404);
    }
    if (targetBill.status === 'paid') {
      throw createAppError('ALREADY_PAID', 'บิลรายการนี้ถูกบันทึกว่าชำระเรียบร้อยแล้ว', 409);
    }

    const payAmount = (params.amount !== undefined && params.amount !== '')
      ? requireNumber(params.amount, 'จำนวนเงินที่ชำระจริง', false, false)
      : Number(targetBill.amount || 0);

    // Optional: if this bill is a credit card statement payment, post as transfer to prevent duplicate expense
    const toCreditCardAccountId = optionalString(params.credit_card_account_id, 64);
    const isTransfer = Boolean(toCreditCardAccountId && toCreditCardAccountId !== accountId);

    const txRes = handleTransactionsCreate(ctx, {
      tx_type: isTransfer ? 'transfer' : 'expense',
      tx_date: paymentDate,
      account_id: accountId,
      to_account_id: isTransfer ? toCreditCardAccountId : '',
      category_id: isTransfer ? 'cat_trf_internal' : (targetBill.category_id || 'cat_exp_utilities'),
      amount: payAmount,
      merchant: targetBill.bill_name,
      description: 'ชำระบิล: ' + targetBill.bill_name + ' (ครบกำหนด ' + targetBill.due_date + ')',
      tags: 'bill-payment',
      idempotency_key: 'billpay_' + billId + '_' + targetBill.due_date,
      allow_duplicate: true
    });

    const now = nowIso();
    targetBill.status = 'paid';
    targetBill.paid_transaction_id = txRes.transaction.transaction_id;
    targetBill.updated_at = now;
    updateSheetRowByIndex(SHEET_NAMES.BILLS, targetBill._rowIndex, targetBill);

    // If recurring bill, create next cycle bill automatically
    let nextBill = null;
    if (toBoolean(targetBill.is_recurring, false) && targetBill.frequency && targetBill.frequency !== 'once') {
      const nextDueDate = advanceBillDueDate(String(targetBill.due_date), String(targetBill.frequency));
      const nextBillId = generateId('bil');
      nextBill = {
        bill_id: nextBillId,
        user_id: userId,
        bill_name: targetBill.bill_name,
        category_id: targetBill.category_id,
        amount: targetBill.amount,
        currency: targetBill.currency || 'THB',
        due_date: nextDueDate,
        is_recurring: true,
        frequency: targetBill.frequency,
        status: 'unpaid',
        remind_days_before: targetBill.remind_days_before || 3,
        paid_transaction_id: '',
        notes: targetBill.notes || '',
        created_at: now,
        updated_at: now
      };
      appendSheetObject(SHEET_NAMES.BILLS, nextBill);
    }

    invalidateUserCache(userId);
    writeAuditLog(ctx, 'bills.pay', 'Bills', billId, 'ชำระบิล ' + targetBill.bill_name + ' จำนวน ' + payAmount, {
      bill_id: billId,
      paid_transaction_id: txRes.transaction.transaction_id,
      next_bill_id: nextBill ? nextBill.bill_id : null
    });

    return {
      paid_bill: targetBill,
      transaction: txRes.transaction,
      next_recurring_bill: nextBill
    };
  });
}

/**
 * Lists CSV / Statement import history records from Import_History sheet (Module I).
 */
function handleImportsList(ctx, params) {
  const userId = ctx.user.user_id;
  const allImports = readSheetObjects(SHEET_NAMES.IMPORT_HISTORY);
  const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);

  const accMap = {};
  for (let i = 0; i < allAccounts.length; i++) {
    if (allAccounts[i].user_id === userId) {
      accMap[allAccounts[i].account_id] = allAccounts[i].account_name;
    }
  }

  const userImports = [];
  for (let i = allImports.length - 1; i >= 0; i--) {
    const imp = allImports[i];
    if (imp.user_id !== userId) continue;
    userImports.push({
      import_id: imp.import_id,
      source_type: imp.source_type || 'csv_upload',
      file_name: imp.file_name || 'statement.csv',
      account_id: imp.account_id,
      account_name: accMap[imp.account_id] || imp.account_id,
      total_rows: Number(imp.total_rows || 0),
      imported_rows: Number(imp.imported_rows || 0),
      skipped_duplicates: Number(imp.skipped_duplicates || 0),
      status: imp.status || 'completed',
      created_at: imp.created_at
    });
  }

  return {
    imports: userImports
  };
}

function enrichBillObject(b, catMap, todayStr, todayTime) {
  const dueStr = String(b.due_date || todayStr);
  const dueTime = new Date(dueStr + 'T00:00:00').getTime();
  const daysUntilDue = Math.round((dueTime - todayTime) / (1000 * 60 * 60 * 24));
  const remindDays = Number(b.remind_days_before !== undefined && b.remind_days_before !== '' ? b.remind_days_before : 3);
  const rawStatus = String(b.status || 'unpaid');

  let effectiveStatus = rawStatus;
  if (rawStatus === 'unpaid' && daysUntilDue < 0) {
    effectiveStatus = 'overdue';
  }
  const isDueSoon = (effectiveStatus === 'unpaid' && daysUntilDue >= 0 && daysUntilDue <= remindDays);
  const catObj = catMap[b.category_id];

  return {
    bill_id: b.bill_id,
    bill_name: b.bill_name,
    category_id: b.category_id || 'cat_exp_utilities',
    category_name: catObj ? catObj.category_name : 'บิลและสาธารณูปโภค',
    amount: Math.round(Number(b.amount || 0) * 100) / 100,
    currency: b.currency || 'THB',
    due_date: dueStr,
    days_until_due: daysUntilDue,
    is_recurring: toBoolean(b.is_recurring, false),
    frequency: b.frequency || 'once',
    status: rawStatus,
    effective_status: effectiveStatus,
    remind_days_before: remindDays,
    is_due_soon: isDueSoon,
    paid_transaction_id: b.paid_transaction_id || '',
    notes: b.notes || '',
    created_at: b.created_at,
    updated_at: b.updated_at
  };
}

function advanceBillDueDate(dateStr, freq) {
  const parts = String(dateStr).split('-');
  const yr = Number(parts[0]);
  const mo = Number(parts[1]) - 1;
  const dy = Number(parts[2]);
  let d = new Date(yr, mo, dy);
  if (freq === 'weekly') {
    d = new Date(yr, mo, dy + 7);
  } else if (freq === 'quarterly') {
    d = new Date(yr, mo + 3, dy);
  } else if (freq === 'yearly') {
    d = new Date(yr + 1, mo, dy);
  } else {
    d = new Date(yr, mo + 1, dy);
  }
  return Utilities.formatDate(d, APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
}

