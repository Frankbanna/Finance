/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: TransactionService.gs
 * Description: Full CRUD for income, expense, transfer, refund, and adjustment transactions,
 *              including deduplication, revision history, voiding, filtering, pagination, and CSV import/export.
 */

const ALLOWED_TX_TYPES = ['income', 'expense', 'transfer', 'refund', 'adjustment'];
const ALLOWED_TX_STATUS = ['posted', 'pending', 'voided'];

/**
 * Normalizes a transaction row for API responses.
 */
function normalizeTransaction(row) {
  let editHistory = [];
  if (row.edit_history_json) {
    try {
      editHistory = JSON.parse(row.edit_history_json);
    } catch (e) {
      editHistory = [];
    }
  }
  return {
    transaction_id: row.transaction_id,
    user_id: row.user_id,
    tx_date: String(row.tx_date || '').substring(0, 10),
    tx_time: String(row.tx_time || '00:00').substring(0, 5),
    tx_type: row.tx_type,
    account_id: row.account_id,
    to_account_id: row.to_account_id || '',
    category_id: row.category_id || '',
    subcategory_id: row.subcategory_id || '',
    amount: Number(row.amount || 0),
    currency: row.currency || 'THB',
    exchange_rate: Number(row.exchange_rate || 1),
    to_amount: (row.to_amount !== '' && row.to_amount !== null && row.to_amount !== undefined)
      ? Number(row.to_amount)
      : Number(row.amount || 0),
    merchant: row.merchant || '',
    description: row.description || '',
    tags: row.tags ? String(row.tags).split(',').map(function(t) { return t.trim(); }).filter(Boolean) : [],
    tags_raw: row.tags || '',
    receipt_url: row.receipt_url || '',
    reference_tx_id: row.reference_tx_id || '',
    recurring_id: row.recurring_id || '',
    import_id: row.import_id || '',
    idempotency_key: row.idempotency_key || '',
    dedup_hash: row.dedup_hash || '',
    status: row.status || 'posted',
    revision: Number(row.revision || 1),
    edit_history: editHistory,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

/**
 * Lists transactions with search, multi-field filtering, sorting, and pagination.
 */
function handleTransactionsList(ctx, params) {
  const userId = ctx.user.user_id;
  const p = params || {};

  const search = optionalString(p.search, 120).toLowerCase();
  const txType = optionalString(p.tx_type, 30);
  const accountId = optionalString(p.account_id, 64);
  const categoryId = optionalString(p.category_id, 64);
  const currency = optionalString(p.currency, 10).toUpperCase();
  const statusFilter = optionalString(p.status, 20) || 'ALL_ACTIVE'; // 'posted', 'voided', 'ALL', 'ALL_ACTIVE'
  const startDate = optionalString(p.start_date, 10);
  const endDate = optionalString(p.end_date, 10);
  const tagFilter = optionalString(p.tag, 50).toLowerCase();

  const sortBy = optionalString(p.sort_by, 30) || 'tx_date';
  const sortDir = (optionalString(p.sort_dir, 10) || 'desc').toLowerCase() === 'asc' ? 1 : -1;
  const page = Math.max(1, parseInt(p.page || 1, 10));
  const pageSize = Math.min(APP_CONFIG.MAX_PAGE_SIZE, Math.max(1, parseInt(p.page_size || APP_CONFIG.DEFAULT_PAGE_SIZE, 10)));

  const allRows = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
  const filtered = [];

  for (let i = 0; i < allRows.length; i++) {
    const r = allRows[i];
    if (r.user_id !== userId) continue;

    const st = r.status || 'posted';
    if (statusFilter === 'ALL_ACTIVE' && st === 'voided') continue;
    if (statusFilter !== 'ALL' && statusFilter !== 'ALL_ACTIVE' && st !== statusFilter) continue;

    const dStr = String(r.tx_date || '').substring(0, 10);
    if (startDate && dStr < startDate) continue;
    if (endDate && dStr > endDate) continue;
    if (txType && r.tx_type !== txType) continue;
    if (accountId && r.account_id !== accountId && r.to_account_id !== accountId) continue;
    if (categoryId && r.category_id !== categoryId && r.subcategory_id !== categoryId) continue;
    if (currency && String(r.currency || '').toUpperCase() !== currency) continue;
    if (tagFilter && String(r.tags || '').toLowerCase().indexOf(tagFilter) === -1) continue;

    if (search) {
      const hay = [
        r.merchant,
        r.description,
        r.tags,
        r.transaction_id,
        String(r.amount)
      ].join(' ').toLowerCase();
      if (hay.indexOf(search) === -1) continue;
    }

    filtered.push(normalizeTransaction(r));
  }

  filtered.sort(function(a, b) {
    if (sortBy === 'amount') {
      return (a.amount - b.amount) * sortDir;
    }
    if (sortBy === 'merchant') {
      return String(a.merchant).localeCompare(String(b.merchant)) * sortDir;
    }
    // Default sort by tx_date + tx_time + created_at
    const ka = a.tx_date + ' ' + a.tx_time + ' ' + a.created_at;
    const kb = b.tx_date + ' ' + b.tx_time + ' ' + b.created_at;
    return ka.localeCompare(kb) * sortDir;
  });

  const totalCount = filtered.length;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const offset = (page - 1) * pageSize;
  const items = filtered.slice(offset, offset + pageSize);

  return {
    transactions: items,
    pagination: {
      page: page,
      page_size: pageSize,
      total_count: totalCount,
      total_pages: totalPages
    }
  };
}

/**
 * Creates a new transaction with strict validation, duplicate protection, and balance recalculation.
 */
function handleTransactionsCreate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const txType = requireEnum(params.tx_type, ALLOWED_TX_TYPES, 'ประเภทธุรกรรม (tx_type)');
    const txDate = requireDateStr(params.tx_date, 'วันที่ทำรายการ (tx_date)');
    const txTime = optionalString(params.tx_time, 10) || '12:00';
    const accountId = requireString(params.account_id, 'บัญชีต้นทาง (account_id)', 64);
    const toAccountId = txType === 'transfer'
      ? requireString(params.to_account_id, 'บัญชีปลายทาง (to_account_id)', 64)
      : '';

    if (txType === 'transfer' && accountId === toAccountId) {
      throw createAppError('VALIDATION_ERROR', 'บัญชีต้นทางและบัญชีปลายทางของการโอนเงินต้องไม่เป็นบัญชีเดียวกัน', 400);
    }

    // For adjustment, amount can be negative or positive (non-zero). For others, strictly positive.
    const amount = requireNumber(
      params.amount,
      'จำนวนเงิน (amount)',
      txType === 'adjustment',
      false
    );

    const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
    let sourceAcc = null;
    let destAcc = null;
    for (let i = 0; i < allAccounts.length; i++) {
      if (allAccounts[i].user_id !== userId) continue;
      if (allAccounts[i].account_id === accountId) sourceAcc = allAccounts[i];
      if (toAccountId && allAccounts[i].account_id === toAccountId) destAcc = allAccounts[i];
    }

    if (!sourceAcc) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีต้นทางที่ระบุ หรือไม่มีสิทธิ์เข้าถึง', 404);
    }
    if (txType === 'transfer' && !destAcc) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีปลายทางที่ระบุ หรือไม่มีสิทธิ์เข้าถึง', 404);
    }

    const categoryId = txType === 'transfer'
      ? (optionalString(params.category_id, 64) || 'cat_trf_internal')
      : (txType === 'adjustment'
        ? (optionalString(params.category_id, 64) || 'cat_adj_reconcile')
        : requireString(params.category_id, 'หมวดหมู่หลัก (category_id)', 64));
    const subcategoryId = optionalString(params.subcategory_id, 64);
    const merchant = optionalString(params.merchant, 150);
    const description = optionalString(params.description, 500);
    const tags = Array.isArray(params.tags)
      ? params.tags.join(',')
      : optionalString(params.tags, 250);
    const receiptUrl = optionalString(params.receipt_url, 500);
    const referenceTxId = optionalString(params.reference_tx_id, 64);
    const exchangeRate = params.exchange_rate ? requireNumber(params.exchange_rate, 'อัตราแลกเปลี่ยน', false, false) : 1;
    const toAmount = (txType === 'transfer' && params.to_amount)
      ? requireNumber(params.to_amount, 'จำนวนเงินเข้าบัญชีปลายทาง (to_amount)', false, false)
      : amount;

    const idempotencyKey = optionalString(params.idempotency_key, 100);
    const dedupHash = computeTxDedupHash(userId, txDate, txType, accountId, amount, merchant || description);
    const allowDuplicate = toBoolean(params.allow_duplicate, false);

    // Check idempotency key and duplicate detection against existing user transactions
    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    for (let i = allTxs.length - 1; i >= 0; i--) {
      const existing = allTxs[i];
      if (existing.user_id !== userId) continue;
      if (idempotencyKey && existing.idempotency_key === idempotencyKey) {
        return {
          transaction: normalizeTransaction(existing),
          idempotent_replay: true
        };
      }
      if (!allowDuplicate && existing.status === 'posted' && existing.dedup_hash === dedupHash) {
        // Check if created within last 2 minutes with exact same hash
        const createdDiffMs = Date.now() - new Date(existing.created_at).getTime();
        if (createdDiffMs < 120000) {
          throw createAppError(
            'DUPLICATE_TRANSACTION',
            'ตรวจพบรายการซ้ำกับรายการที่เพิ่งบันทึกเมื่อสักครู่ หากต้องการบันทึกซ้ำกรุณายืนยันอีกครั้ง',
            409,
            { existing_transaction_id: existing.transaction_id }
          );
        }
      }
    }

    const now = nowIso();
    const txId = generateId('txn');
    const initialHistory = [{
      revision: 1,
      action: 'created',
      timestamp: now,
      amount: amount,
      tx_type: txType,
      account_id: accountId
    }];

    const newTx = {
      transaction_id: txId,
      user_id: userId,
      tx_date: txDate,
      tx_time: txTime,
      tx_type: txType,
      account_id: accountId,
      to_account_id: toAccountId,
      category_id: categoryId,
      subcategory_id: subcategoryId,
      amount: amount,
      currency: sourceAcc.currency || 'THB',
      exchange_rate: exchangeRate,
      to_amount: toAmount,
      merchant: merchant,
      description: description,
      tags: tags,
      receipt_url: receiptUrl,
      reference_tx_id: referenceTxId,
      recurring_id: optionalString(params.recurring_id, 64),
      import_id: optionalString(params.import_id, 64),
      idempotency_key: idempotencyKey || ('ik_' + txId),
      dedup_hash: dedupHash,
      status: optionalString(params.status, 20) || 'posted',
      revision: 1,
      edit_history_json: JSON.stringify(initialHistory),
      created_at: now,
      updated_at: now
    };

    appendSheetObject(SHEET_NAMES.TRANSACTIONS, newTx);
    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'transactions.create', 'Transactions', txId, 'สร้างรายการ ' + txType + ' จำนวน ' + amount + ' ' + newTx.currency, {
      tx_type: txType,
      amount: amount,
      account_id: accountId,
      to_account_id: toAccountId
    });

    return {
      transaction: normalizeTransaction(newTx),
      accounts: updatedAccounts
    };
  });
}

/**
 * Updates an existing transaction and records a revision snapshot in `edit_history_json`.
 */
function handleTransactionsUpdate(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const txId = requireString(params.transaction_id, 'รหัสธุรกรรม (transaction_id)', 64);

    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    let target = null;
    for (let i = 0; i < allTxs.length; i++) {
      if (allTxs[i].transaction_id === txId && allTxs[i].user_id === userId) {
        target = allTxs[i];
        break;
      }
    }

    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการธุรกรรมที่ต้องการแก้ไข', 404);
    }

    const previousSnapshot = {
      tx_date: target.tx_date,
      tx_type: target.tx_type,
      account_id: target.account_id,
      to_account_id: target.to_account_id,
      category_id: target.category_id,
      amount: Number(target.amount),
      merchant: target.merchant,
      description: target.description,
      status: target.status
    };

    if (params.tx_type !== undefined) {
      target.tx_type = requireEnum(params.tx_type, ALLOWED_TX_TYPES, 'ประเภทธุรกรรม');
    }
    if (params.tx_date !== undefined) {
      target.tx_date = requireDateStr(params.tx_date, 'วันที่ทำรายการ');
    }
    if (params.tx_time !== undefined) {
      target.tx_time = optionalString(params.tx_time, 10) || target.tx_time;
    }
    if (params.account_id !== undefined) {
      target.account_id = requireString(params.account_id, 'บัญชีต้นทาง', 64);
    }
    if (params.to_account_id !== undefined) {
      target.to_account_id = optionalString(params.to_account_id, 64);
    }
    if (target.tx_type === 'transfer') {
      if (!target.to_account_id) {
        throw createAppError('VALIDATION_ERROR', 'การโอนเงินต้องระบุบัญชีปลายทาง', 400);
      }
      if (target.account_id === target.to_account_id) {
        throw createAppError('VALIDATION_ERROR', 'บัญชีต้นทางและปลายทางต้องไม่ซ้ำกัน', 400);
      }
    }
    if (params.category_id !== undefined) {
      target.category_id = optionalString(params.category_id, 64);
    }
    if (params.subcategory_id !== undefined) {
      target.subcategory_id = optionalString(params.subcategory_id, 64);
    }
    if (params.amount !== undefined) {
      target.amount = requireNumber(params.amount, 'จำนวนเงิน', target.tx_type === 'adjustment', false);
      if (params.to_amount === undefined) {
        target.to_amount = target.amount;
      }
    }
    if (params.to_amount !== undefined) {
      target.to_amount = requireNumber(params.to_amount, 'จำนวนเงินปลายทาง', false, false);
    }
    if (params.merchant !== undefined) {
      target.merchant = optionalString(params.merchant, 150);
    }
    if (params.description !== undefined) {
      target.description = optionalString(params.description, 500);
    }
    if (params.tags !== undefined) {
      target.tags = Array.isArray(params.tags) ? params.tags.join(',') : optionalString(params.tags, 250);
    }
    if (params.receipt_url !== undefined) {
      target.receipt_url = optionalString(params.receipt_url, 500);
    }
    if (params.reference_tx_id !== undefined) {
      target.reference_tx_id = optionalString(params.reference_tx_id, 64);
    }

    const now = nowIso();
    const nextRevision = Number(target.revision || 1) + 1;
    let history = [];
    try {
      history = target.edit_history_json ? JSON.parse(target.edit_history_json) : [];
    } catch (e) {
      history = [];
    }

    history.push({
      revision: nextRevision,
      action: 'updated',
      timestamp: now,
      reason: optionalString(params.edit_reason, 200) || 'แก้ไขข้อมูลธุรกรรม',
      previous: previousSnapshot
    });

    target.revision = nextRevision;
    target.dedup_hash = computeTxDedupHash(userId, target.tx_date, target.tx_type, target.account_id, target.amount, target.merchant || target.description);
    target.edit_history_json = JSON.stringify(history);
    target.updated_at = now;

    updateSheetRowByIndex(SHEET_NAMES.TRANSACTIONS, target._rowIndex, target);
    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);

    writeAuditLog(ctx, 'transactions.update', 'Transactions', txId, 'แก้ไขรายการธุรกรรม (Rev ' + nextRevision + ')', {
      previous: previousSnapshot
    });

    return {
      transaction: normalizeTransaction(target),
      accounts: updatedAccounts
    };
  });
}

/**
 * Voids (cancels) or restores a transaction while preserving full audit history.
 */
function handleTransactionsVoid(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const txId = requireString(params.transaction_id, 'รหัสธุรกรรม (transaction_id)', 64);
    const reason = optionalString(params.reason, 250) || 'ยกเลิกรายการโดยผู้ใช้';
    const restore = toBoolean(params.restore, false);

    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    let target = null;
    for (let i = 0; i < allTxs.length; i++) {
      if (allTxs[i].transaction_id === txId && allTxs[i].user_id === userId) {
        target = allTxs[i];
        break;
      }
    }

    if (!target) {
      throw createAppError('NOT_FOUND', 'ไม่พบรายการธุรกรรมที่ระบุ', 404);
    }

    const now = nowIso();
    const nextRevision = Number(target.revision || 1) + 1;
    let history = [];
    try {
      history = target.edit_history_json ? JSON.parse(target.edit_history_json) : [];
    } catch (e) {
      history = [];
    }

    const newStatus = restore ? 'posted' : 'voided';
    history.push({
      revision: nextRevision,
      action: restore ? 'restored' : 'voided',
      timestamp: now,
      reason: reason,
      previous_status: target.status
    });

    target.status = newStatus;
    target.revision = nextRevision;
    target.edit_history_json = JSON.stringify(history);
    target.updated_at = now;

    updateSheetRowByIndex(SHEET_NAMES.TRANSACTIONS, target._rowIndex, target);
    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);

    writeAuditLog(ctx, restore ? 'transactions.restore' : 'transactions.void', 'Transactions', txId, (restore ? 'กู้คืนรายการ: ' : 'ยกเลิกรายการ: ') + reason, {});

    return {
      transaction: normalizeTransaction(target),
      accounts: updatedAccounts
    };
  });
}

/**
 * Previews CSV import rows, performs auto-category matching and duplicate detection against existing transactions.
 */
function handleTransactionsImportPreview(ctx, params) {
  const userId = ctx.user.user_id;
  const accountId = requireString(params.account_id, 'บัญชีที่นำเข้า (account_id)', 64);
  const rows = params.rows;
  if (!Array.isArray(rows) || rows.length === 0) {
    throw createAppError('VALIDATION_ERROR', 'ไม่พบข้อมูลแถว CSV สำหรับตรวจสอบ', 400);
  }
  if (rows.length > 500) {
    throw createAppError('VALIDATION_ERROR', 'รองรับการนำเข้าสูงสุดไม่เกิน 500 รายการต่อครั้ง', 400);
  }

  const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
  const existingHashes = {};
  for (let i = 0; i < allTxs.length; i++) {
    const t = allTxs[i];
    if (t.user_id === userId && t.status === 'posted' && t.dedup_hash) {
      existingHashes[t.dedup_hash] = t.transaction_id;
    }
  }

  const categories = handleCategoriesList(ctx, {}).categories;
  const previewItems = [];
  let duplicateCount = 0;
  let validCount = 0;
  let invalidCount = 0;

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const txDate = String(r.tx_date || r.date || '').trim();
    const rawType = String(r.tx_type || r.type || 'expense').trim().toLowerCase();
    const txType = ALLOWED_TX_TYPES.indexOf(rawType) !== -1 ? rawType : 'expense';
    const amount = Math.abs(Number(r.amount || 0));
    const merchant = String(r.merchant || r.payee || '').trim();
    const description = String(r.description || r.note || '').trim();
    let categoryId = String(r.category_id || '').trim();

    // Auto-match category by name or keyword if not provided
    if (!categoryId) {
      const text = (merchant + ' ' + description).toLowerCase();
      if (text.indexOf('7-eleven') !== -1 || text.indexOf('food') !== -1 || text.indexOf('grabfood') !== -1 || text.indexOf('อาหาร') !== -1 || text.indexOf('กาแฟ') !== -1) {
        categoryId = 'cat_exp_food';
      } else if (text.indexOf('bts') !== -1 || text.indexOf('mrt') !== -1 || text.indexOf('ptt') !== -1 || text.indexOf('shell') !== -1 || text.indexOf('เดินทาง') !== -1) {
        categoryId = 'cat_exp_transport';
      } else if (text.indexOf('salary') !== -1 || text.indexOf('เงินเดือน') !== -1) {
        categoryId = 'cat_inc_salary';
      } else {
        categoryId = txType === 'income' ? 'cat_inc_other' : 'cat_exp_shopping';
      }
    }

    const errors = [];
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) errors.push('รูปแบบวันที่ต้องเป็น YYYY-MM-DD');
    if (!amount || isNaN(amount) || amount <= 0) errors.push('จำนวนเงินต้องมากกว่า 0');

    const dedupHash = computeTxDedupHash(userId, txDate, txType, accountId, amount, merchant || description);
    const isDuplicate = Boolean(existingHashes[dedupHash]);

    if (errors.length > 0) {
      invalidCount++;
    } else if (isDuplicate) {
      duplicateCount++;
    } else {
      validCount++;
    }

    previewItems.push({
      row_number: i + 1,
      tx_date: txDate,
      tx_time: String(r.tx_time || '12:00').substring(0, 5),
      tx_type: txType,
      account_id: accountId,
      category_id: categoryId,
      amount: amount,
      merchant: merchant,
      description: description,
      tags: String(r.tags || 'csv-import'),
      dedup_hash: dedupHash,
      is_duplicate: isDuplicate,
      existing_transaction_id: existingHashes[dedupHash] || null,
      is_valid: errors.length === 0,
      errors: errors
    });
  }

  return {
    summary: {
      total_rows: rows.length,
      valid_rows: validCount,
      duplicate_rows: duplicateCount,
      invalid_rows: invalidCount
    },
    items: previewItems
  };
}

/**
 * Commits validated CSV import rows in a single batch write and records Import_History.
 */
function handleTransactionsImportCommit(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const accountId = requireString(params.account_id, 'รหัสบัญชี (account_id)', 64);
    const fileName = optionalString(params.file_name, 150) || 'statement_import.csv';
    const skipDuplicates = toBoolean(params.skip_duplicates, true);
    const items = params.items;

    if (!Array.isArray(items) || items.length === 0) {
      throw createAppError('VALIDATION_ERROR', 'ไม่มีรายการสำหรับนำเข้า', 400);
    }

    const allAccounts = readSheetObjects(SHEET_NAMES.ACCOUNTS);
    let targetAcc = null;
    for (let i = 0; i < allAccounts.length; i++) {
      if (allAccounts[i].account_id === accountId && allAccounts[i].user_id === userId) {
        targetAcc = allAccounts[i];
        break;
      }
    }
    if (!targetAcc) {
      throw createAppError('NOT_FOUND', 'ไม่พบบัญชีที่ต้องการนำเข้าข้อมูล', 404);
    }

    const allTxs = readSheetObjects(SHEET_NAMES.TRANSACTIONS);
    const existingHashes = {};
    for (let i = 0; i < allTxs.length; i++) {
      const t = allTxs[i];
      if (t.user_id === userId && t.status === 'posted' && t.dedup_hash) {
        existingHashes[t.dedup_hash] = true;
      }
    }

    const now = nowIso();
    const importId = generateId('imp');
    const toInsert = [];
    let skippedDuplicates = 0;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const txDate = requireDateStr(item.tx_date, 'วันที่ในแถวที่ ' + (i + 1));
      const txType = requireEnum(item.tx_type || 'expense', ALLOWED_TX_TYPES, 'ประเภทธุรกรรม');
      const amount = requireNumber(item.amount, 'จำนวนเงินในแถวที่ ' + (i + 1), txType === 'adjustment', false);
      const merchant = optionalString(item.merchant, 150);
      const description = optionalString(item.description, 500);
      const dedupHash = computeTxDedupHash(userId, txDate, txType, accountId, amount, merchant || description);

      if (skipDuplicates && existingHashes[dedupHash]) {
        skippedDuplicates++;
        continue;
      }

      existingHashes[dedupHash] = true;
      const txId = generateId('txn');
      toInsert.push({
        transaction_id: txId,
        user_id: userId,
        tx_date: txDate,
        tx_time: optionalString(item.tx_time, 10) || '12:00',
        tx_type: txType,
        account_id: accountId,
        to_account_id: optionalString(item.to_account_id, 64),
        category_id: optionalString(item.category_id, 64) || (txType === 'income' ? 'cat_inc_other' : 'cat_exp_shopping'),
        subcategory_id: optionalString(item.subcategory_id, 64),
        amount: amount,
        currency: targetAcc.currency || 'THB',
        exchange_rate: 1,
        to_amount: amount,
        merchant: merchant,
        description: description,
        tags: optionalString(item.tags, 200) || 'csv-import',
        receipt_url: '',
        reference_tx_id: '',
        recurring_id: '',
        import_id: importId,
        idempotency_key: 'imp_' + importId + '_' + i,
        dedup_hash: dedupHash,
        status: 'posted',
        revision: 1,
        edit_history_json: JSON.stringify([{ revision: 1, action: 'imported_csv', import_id: importId, timestamp: now }]),
        created_at: now,
        updated_at: now
      });
    }

    if (toInsert.length > 0) {
      batchAppendObjects(SHEET_NAMES.TRANSACTIONS, toInsert);
    }

    const importRecord = {
      import_id: importId,
      user_id: userId,
      source_type: 'csv_upload',
      file_name: fileName,
      account_id: accountId,
      total_rows: items.length,
      imported_rows: toInsert.length,
      skipped_duplicates: skippedDuplicates,
      status: 'completed',
      created_at: now
    };
    appendSheetObject(SHEET_NAMES.IMPORT_HISTORY, importRecord);

    const updatedAccounts = recalculateUserAccountBalances(userId);
    invalidateUserCache(userId);
    writeAuditLog(ctx, 'transactions.importCsvCommit', 'Import_History', importId, 'นำเข้า CSV สำเร็จ ' + toInsert.length + ' รายการ (ข้ามซ้ำ ' + skippedDuplicates + ')', importRecord);

    return {
      import_record: importRecord,
      imported_count: toInsert.length,
      skipped_duplicates: skippedDuplicates,
      accounts: updatedAccounts
    };
  });
}

