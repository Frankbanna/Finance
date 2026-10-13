/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/transactions.js
 * Description: Full CRUD for Transactions, filtering, sorting, pagination,
 *              duplicate confirmation, revision history viewer, CSV export, and CSV import with preview.
 */

window.PFM_TRANSACTIONS = {
  items: [],
  pagination: { page: 1, page_size: 20, total_count: 0, total_pages: 1 },
  csvPreviewItems: [],
  pendingIdempotencyKey: '',

  init: function() {
    const filterForm = document.getElementById('txFilterForm');
    if (filterForm) {
      filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.pagination.page = 1;
        this.loadTransactions();
      });
    }

    const txForm = document.getElementById('txModalForm');
    if (txForm) {
      txForm.addEventListener('submit', (e) => this.handleTxSave(e, false));
    }

    const txTypeSelect = document.getElementById('txType');
    if (txTypeSelect) {
      txTypeSelect.addEventListener('change', () => this.onTxTypeChanged());
    }

    const txCatSelect = document.getElementById('txCategory');
    if (txCatSelect) {
      txCatSelect.addEventListener('change', () => this.populateSubcategories());
    }

    const csvFileInput = document.getElementById('csvFileInput');
    if (csvFileInput) {
      csvFileInput.addEventListener('change', (e) => this.handleCsvFileSelected(e));
    }
  },

  onTxTypeChanged: function() {
    const typeVal = document.getElementById('txType').value;
    const toAccGroup = document.getElementById('txToAccountGroup');
    if (toAccGroup) {
      toAccGroup.classList.toggle('d-none', typeVal !== 'transfer');
    }
    this.populateCategoryOptionsForType(typeVal);
  },

  populateCategoryOptionsForType: function(txType, selectedCatId, selectedSubcatId) {
    const catSelect = document.getElementById('txCategory');
    if (!catSelect) return;

    const cats = PFM_APP.categories || [];
    const targetType = (txType === 'refund') ? 'expense' : txType;
    const mainCats = cats.filter(c => !c.parent_id && (c.category_type === targetType || c.category_type === txType));

    catSelect.innerHTML = mainCats.map(c =>
      `<option value="${PFM_UTILS.escapeHtml(c.category_id)}">${PFM_UTILS.escapeHtml(c.category_name)}</option>`
    ).join('');

    if (selectedCatId) {
      catSelect.value = selectedCatId;
    }
    this.populateSubcategories(selectedSubcatId);
  },

  populateSubcategories: function(selectedSubcatId) {
    const mainCatId = document.getElementById('txCategory').value;
    const subSelect = document.getElementById('txSubcategory');
    if (!subSelect) return;

    const cats = PFM_APP.categories || [];
    const subCats = cats.filter(c => c.parent_id === mainCatId);

    subSelect.innerHTML = `<option value="">-- ไม่ระบุหมวดหมู่ย่อย --</option>` +
      subCats.map(c => `<option value="${PFM_UTILS.escapeHtml(c.category_id)}">${PFM_UTILS.escapeHtml(c.category_name)}</option>`).join('');

    if (selectedSubcatId) {
      subSelect.value = selectedSubcatId;
    }
  },

  loadTransactions: async function(page) {
    if (page) this.pagination.page = page;

    const params = {
      search: document.getElementById('txFilterSearch').value.trim(),
      tx_type: document.getElementById('txFilterType').value,
      account_id: document.getElementById('txFilterAccount').value,
      category_id: document.getElementById('txFilterCategory').value,
      status: document.getElementById('txFilterStatus').value,
      start_date: document.getElementById('txFilterStart').value,
      end_date: document.getElementById('txFilterEnd').value,
      sort_by: document.getElementById('txFilterSortBy').value,
      sort_dir: document.getElementById('txFilterSortDir').value,
      page: this.pagination.page,
      page_size: this.pagination.page_size
    };

    try {
      const res = await PFM_API.call('transactions.list', params);
      this.items = res.transactions || [];
      this.pagination = res.pagination || this.pagination;
      this.renderTransactionsTable();
      this.renderPagination();
    } catch (err) {
      PFM_APP.showToast('โหลดรายการธุรกรรมไม่สำเร็จ: ' + err.message, 'danger');
    }
  },

  resetFilters: function() {
    document.getElementById('txFilterSearch').value = '';
    document.getElementById('txFilterType').value = '';
    document.getElementById('txFilterAccount').value = '';
    document.getElementById('txFilterCategory').value = '';
    document.getElementById('txFilterStatus').value = 'ALL_ACTIVE';
    document.getElementById('txFilterStart').value = '';
    document.getElementById('txFilterEnd').value = '';
    document.getElementById('txFilterSortBy').value = 'tx_date';
    document.getElementById('txFilterSortDir').value = 'desc';
    this.loadTransactions(1);
  },

  renderTransactionsTable: function() {
    const tbody = document.getElementById('txTableBody');
    if (!tbody) return;

    if (!this.items || this.items.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-5">
            <i class="bi bi-journal-text fs-2 d-block mb-2"></i>
            ไม่พบรายการธุรกรรมตามเงื่อนไขที่ค้นหา
          </td>
        </tr>`;
      return;
    }

    const accMap = PFM_APP.getAccountMap();
    const catMap = PFM_APP.getCategoryMap();

    tbody.innerHTML = this.items.map(tx => {
      const isVoided = tx.status === 'voided';
      const rowStyle = isVoided ? 'opacity: 0.55; text-decoration: line-through;' : '';
      const accName = (accMap[tx.account_id] && accMap[tx.account_id].account_name) || tx.account_id;
      const toAccName = tx.to_account_id && accMap[tx.to_account_id] ? ` → ${accMap[tx.to_account_id].account_name}` : '';
      const catName = (catMap[tx.category_id] && catMap[tx.category_id].category_name) || tx.category_id || '-';
      const subCatName = tx.subcategory_id && catMap[tx.subcategory_id] ? ` / ${catMap[tx.subcategory_id].category_name}` : '';
      const tagsHtml = (tx.tags || []).map(t => `<span class="badge bg-secondary bg-opacity-10 text-secondary me-1">#${PFM_UTILS.escapeHtml(t)}</span>`).join('');
      const receiptHtml = tx.receipt_url
        ? `<a href="${PFM_UTILS.escapeHtml(tx.receipt_url)}" target="_blank" rel="noopener" class="badge bg-info bg-opacity-10 text-info text-decoration-none ms-1"><i class="bi bi-paperclip"></i> ใบเสร็จ</a>`
        : '';
      const sign = (tx.tx_type === 'income' || tx.tx_type === 'refund' || (tx.tx_type === 'adjustment' && tx.amount > 0)) ? '+' : (tx.tx_type === 'expense' ? '-' : '');

      return `
        <tr style="${rowStyle}">
          <td class="small">
            <div class="fw-semibold">${PFM_UTILS.escapeHtml(tx.tx_date)}</div>
            <div class="text-muted">${PFM_UTILS.escapeHtml(tx.tx_time)}</div>
          </td>
          <td>
            <span class="badge badge-tx-${PFM_UTILS.escapeHtml(tx.tx_type)}">
              ${PFM_UTILS.escapeHtml(PFM_CONFIG.TX_TYPE_LABELS[tx.tx_type] || tx.tx_type)}
            </span>
            ${isVoided ? '<span class="badge bg-danger ms-1">ยกเลิกแล้ว</span>' : ''}
          </td>
          <td>
            <div class="fw-semibold">${PFM_UTILS.escapeHtml(tx.merchant || '-')}</div>
            <div class="small text-muted">${PFM_UTILS.escapeHtml(tx.description || '')}</div>
            <div class="mt-1">${tagsHtml}${receiptHtml}</div>
          </td>
          <td class="small">${PFM_UTILS.escapeHtml(catName + subCatName)}</td>
          <td class="small">${PFM_UTILS.escapeHtml(accName + toAccName)}</td>
          <td class="text-end fw-bold amount-${PFM_UTILS.escapeHtml(tx.tx_type)}">
            ${sign}${PFM_UTILS.formatCurrency(tx.amount, tx.currency)}
            <div class="small text-muted fw-normal">Rev.${tx.revision}</div>
          </td>
          <td class="text-end">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary" onclick="PFM_TRANSACTIONS.openEditModal('${PFM_UTILS.escapeHtml(tx.transaction_id)}')" title="แก้ไข">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn btn-outline-secondary" onclick="PFM_TRANSACTIONS.openRevisionHistory('${PFM_UTILS.escapeHtml(tx.transaction_id)}')" title="ประวัติการแก้ไข">
                <i class="bi bi-clock-history"></i>
              </button>
              <button class="btn ${isVoided ? 'btn-outline-success' : 'btn-outline-danger'}" onclick="PFM_TRANSACTIONS.toggleVoidTransaction('${PFM_UTILS.escapeHtml(tx.transaction_id)}', ${isVoided})" title="${isVoided ? 'กู้คืนรายการ' : 'ยกเลิกรายการ'}">
                <i class="bi ${isVoided ? 'bi-arrow-counterclockwise' : 'bi-x-circle'}"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderPagination: function() {
    const info = document.getElementById('txPaginationInfo');
    const controls = document.getElementById('txPaginationControls');
    if (!info || !controls) return;

    const p = this.pagination;
    info.textContent = `แสดงหน้า ${p.page} จาก ${p.total_pages} (ทั้งหมด ${p.total_count} รายการ)`;

    controls.innerHTML = `
      <button class="btn btn-sm btn-outline-secondary" ${p.page <= 1 ? 'disabled' : ''} onclick="PFM_TRANSACTIONS.loadTransactions(${p.page - 1})">
        <i class="bi bi-chevron-left"></i> ก่อนหน้า
      </button>
      <button class="btn btn-sm btn-outline-secondary" ${p.page >= p.total_pages ? 'disabled' : ''} onclick="PFM_TRANSACTIONS.loadTransactions(${p.page + 1})">
        ถัดไป <i class="bi bi-chevron-right"></i>
      </button>
    `;
  },

  openCreateModal: function(defaultType) {
    if (!PFM_APP.accounts || PFM_APP.accounts.length === 0) {
      PFM_APP.showToast('กรุณาสร้างบัญชีการเงินอย่างน้อย 1 บัญชีก่อนบันทึกรายการธุรกรรม', 'warning');
      PFM_APP.navigateTo('accounts');
      PFM_ACCOUNTS.openCreateModal();
      return;
    }

    this.pendingIdempotencyKey = PFM_UTILS.generateIdempotencyKey('tx');
    const typeVal = defaultType || 'expense';

    document.getElementById('txModalTitle').textContent = 'บันทึกรายการธุรกรรมใหม่';
    document.getElementById('txId').value = '';
    document.getElementById('txType').value = typeVal;
    document.getElementById('txDate').value = PFM_UTILS.todayDateString();
    document.getElementById('txTime').value = new Date().toTimeString().substring(0, 5);
    document.getElementById('txAmount').value = '';
    document.getElementById('txMerchant').value = '';
    document.getElementById('txDescription').value = '';
    document.getElementById('txTags').value = '';
    document.getElementById('txReceiptUrl').value = '';
    document.getElementById('txEditReasonGroup').classList.add('d-none');
    document.getElementById('txEditReason').value = '';

    this.onTxTypeChanged();
    const modal = new bootstrap.Modal(document.getElementById('txModal'));
    modal.show();
  },

  openEditModal: function(txId) {
    const tx = this.items.find(t => t.transaction_id === txId);
    if (!tx) return;

    document.getElementById('txModalTitle').textContent = 'แก้ไขรายการธุรกรรม (' + tx.transaction_id + ')';
    document.getElementById('txId').value = tx.transaction_id;
    document.getElementById('txType').value = tx.tx_type;
    document.getElementById('txDate').value = tx.tx_date;
    document.getElementById('txTime').value = tx.tx_time || '12:00';
    document.getElementById('txAccount').value = tx.account_id;
    document.getElementById('txToAccount').value = tx.to_account_id || '';
    document.getElementById('txAmount').value = tx.amount;
    document.getElementById('txMerchant').value = tx.merchant || '';
    document.getElementById('txDescription').value = tx.description || '';
    document.getElementById('txTags').value = tx.tags_raw || '';
    document.getElementById('txReceiptUrl').value = tx.receipt_url || '';
    document.getElementById('txEditReasonGroup').classList.remove('d-none');
    document.getElementById('txEditReason').value = '';

    const toAccGroup = document.getElementById('txToAccountGroup');
    if (toAccGroup) {
      toAccGroup.classList.toggle('d-none', tx.tx_type !== 'transfer');
    }
    this.populateCategoryOptionsForType(tx.tx_type, tx.category_id, tx.subcategory_id);

    const modal = new bootstrap.Modal(document.getElementById('txModal'));
    modal.show();
  },

  handleTxSave: async function(e, forceAllowDuplicate) {
    if (e) e.preventDefault();
    const btn = document.getElementById('btnSaveTx');
    const txId = document.getElementById('txId').value.trim();

    const payload = {
      transaction_id: txId || undefined,
      tx_type: document.getElementById('txType').value,
      tx_date: document.getElementById('txDate').value,
      tx_time: document.getElementById('txTime').value,
      account_id: document.getElementById('txAccount').value,
      to_account_id: document.getElementById('txToAccount').value,
      category_id: document.getElementById('txCategory').value,
      subcategory_id: document.getElementById('txSubcategory').value,
      amount: Number(document.getElementById('txAmount').value),
      merchant: document.getElementById('txMerchant').value.trim(),
      description: document.getElementById('txDescription').value.trim(),
      tags: document.getElementById('txTags').value.trim(),
      receipt_url: document.getElementById('txReceiptUrl').value.trim(),
      edit_reason: document.getElementById('txEditReason').value.trim(),
      idempotency_key: txId ? undefined : this.pendingIdempotencyKey,
      allow_duplicate: Boolean(forceAllowDuplicate)
    };

    try {
      btn.disabled = true;
      const action = txId ? 'transactions.update' : 'transactions.create';
      await PFM_API.call(action, payload);

      bootstrap.Modal.getInstance(document.getElementById('txModal')).hide();
      PFM_APP.showToast(txId ? 'บันทึกการแก้ไขธุรกรรมเรียบร้อย' : 'บันทึกรายการธุรกรรมสำเร็จ', 'success');
      await PFM_ACCOUNTS.loadAccounts();
      await this.loadTransactions();
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      if (err.code === 'DUPLICATE_TRANSACTION') {
        if (confirm(err.message + '\n\nกด OK หากยืนยันว่าต้องการบันทึกรายการซ้ำนี้')) {
          this.pendingIdempotencyKey = PFM_UTILS.generateIdempotencyKey('tx_dup');
          await this.handleTxSave(null, true);
        }
      } else {
        PFM_APP.showToast(err.message, 'danger');
      }
    } finally {
      btn.disabled = false;
    }
  },

  toggleVoidTransaction: async function(txId, isCurrentlyVoided) {
    const reason = prompt(
      isCurrentlyVoided ? 'ระบุเหตุผลในการกู้คืนรายการธุรกรรม:' : 'ระบุเหตุผลในการยกเลิก (Void) รายการธุรกรรม:',
      isCurrentlyVoided ? 'กู้คืนรายการที่ยกเลิกผิดพลาด' : 'บันทึกรายการผิดพลาด'
    );
    if (reason === null) return;

    try {
      await PFM_API.call('transactions.void', {
        transaction_id: txId,
        reason: reason,
        restore: isCurrentlyVoided
      });
      PFM_APP.showToast(isCurrentlyVoided ? 'กู้คืนรายการสำเร็จ' : 'ยกเลิกรายการธุรกรรมสำเร็จ', 'info');
      await PFM_ACCOUNTS.loadAccounts();
      await this.loadTransactions();
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  openRevisionHistory: function(txId) {
    const tx = this.items.find(t => t.transaction_id === txId);
    if (!tx) return;

    const container = document.getElementById('txRevisionHistoryBody');
    const history = tx.edit_history || [];

    container.innerHTML = history.map(h => `
      <div class="border-bottom py-2">
        <div class="d-flex justify-content-between">
          <span class="badge bg-primary">Revision #${PFM_UTILS.escapeHtml(h.revision)} — ${PFM_UTILS.escapeHtml(h.action)}</span>
          <span class="small text-muted">${PFM_UTILS.escapeHtml(h.timestamp)}</span>
        </div>
        ${h.reason ? `<div class="small mt-1"><strong>เหตุผล:</strong> ${PFM_UTILS.escapeHtml(h.reason)}</div>` : ''}
        ${h.previous ? `<pre class="small bg-body-tertiary p-2 rounded mt-1 mb-0">${PFM_UTILS.escapeHtml(JSON.stringify(h.previous, null, 2))}</pre>` : ''}
      </div>
    `).join('');

    const modal = new bootstrap.Modal(document.getElementById('txRevisionModal'));
    modal.show();
  },

  exportCurrentCsv: function() {
    if (!this.items || this.items.length === 0) {
      PFM_APP.showToast('ไม่มีข้อมูลธุรกรรมให้ส่งออก', 'warning');
      return;
    }

    const headers = ['transaction_id', 'tx_date', 'tx_time', 'tx_type', 'account_id', 'to_account_id', 'category_id', 'amount', 'currency', 'merchant', 'description', 'tags', 'status'];
    const csvRows = [headers.join(',')];

    this.items.forEach(tx => {
      const row = headers.map(h => {
        const val = h === 'tags' ? (tx.tags_raw || '') : (tx[h] === undefined || tx[h] === null ? '' : String(tx[h]));
        return '"' + val.replace(/"/g, '""') + '"';
      });
      csvRows.push(row.join(','));
    });

    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pfm_transactions_${PFM_UTILS.todayDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  openCsvImportModal: function() {
    if (!PFM_APP.accounts || PFM_APP.accounts.length === 0) {
      PFM_APP.showToast('กรุณาสร้างบัญชีก่อนนำเข้า CSV', 'warning');
      return;
    }
    this.csvPreviewItems = [];
    document.getElementById('csvFileInput').value = '';
    document.getElementById('csvPreviewSection').classList.add('d-none');
    document.getElementById('btnCommitCsvImport').disabled = true;

    const modal = new bootstrap.Modal(document.getElementById('csvImportModal'));
    modal.show();
  },

  parseCsvText: function(text) {
    const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim().length > 0);
    if (lines.length < 2) return [];

    const parseLine = (line) => {
      const result = [];
      let cur = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
          if (inQuotes && line[i + 1] === '"') {
            cur += '"';
            i++;
          } else {
            inQuotes = !inQuotes;
          }
        } else if (ch === ',' && !inQuotes) {
          result.push(cur.trim());
          cur = '';
        } else {
          cur += ch;
        }
      }
      result.push(cur.trim());
      return result;
    };

    const rawHeaders = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9_]/g, ''));
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseLine(lines[i]);
      const obj = {};
      rawHeaders.forEach((h, idx) => {
        obj[h] = cols[idx] !== undefined ? cols[idx] : '';
      });
      rows.push({
        tx_date: obj.tx_date || obj.date || '',
        tx_time: obj.tx_time || obj.time || '12:00',
        tx_type: obj.tx_type || obj.type || 'expense',
        amount: obj.amount || 0,
        merchant: obj.merchant || obj.payee || '',
        description: obj.description || obj.note || '',
        category_id: obj.category_id || '',
        tags: obj.tags || 'csv-import'
      });
    }
    return rows;
  },

  handleCsvFileSelected: async function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    const accountId = document.getElementById('csvImportAccount').value;
    const text = await file.text();
    const parsedRows = this.parseCsvText(text);

    if (parsedRows.length === 0) {
      PFM_APP.showToast('ไฟล์ CSV ไม่มีข้อมูล หรือรูปแบบหัวคอลัมน์ไม่ถูกต้อง (ต้องมี tx_date, tx_type, amount, merchant)', 'warning');
      return;
    }

    try {
      const res = await PFM_API.call('transactions.importCsvPreview', {
        account_id: accountId,
        rows: parsedRows
      });

      this.csvPreviewItems = res.items || [];
      document.getElementById('csvPreviewSummary').innerHTML =
        `ทั้งหมด: <strong>${res.summary.total_rows}</strong> แถว | พร้อมนำเข้า: <strong class="text-success">${res.summary.valid_rows}</strong> | รายการซ้ำ: <strong class="text-warning">${res.summary.duplicate_rows}</strong> | ข้อมูลผิดพลาด: <strong class="text-danger">${res.summary.invalid_rows}</strong>`;

      const tbody = document.getElementById('csvPreviewTableBody');
      tbody.innerHTML = this.csvPreviewItems.map(item => {
        let statusBadge = '<span class="badge bg-success">พร้อมนำเข้า</span>';
        if (!item.is_valid) {
          statusBadge = `<span class="badge bg-danger">${PFM_UTILS.escapeHtml(item.errors.join(', '))}</span>`;
        } else if (item.is_duplicate) {
          statusBadge = '<span class="badge bg-warning text-dark">ตรวจพบรายการซ้ำ (Duplicate)</span>';
        }
        return `
          <tr>
            <td>${item.row_number}</td>
            <td>${PFM_UTILS.escapeHtml(item.tx_date)}</td>
            <td>${PFM_UTILS.escapeHtml(item.tx_type)}</td>
            <td>${PFM_UTILS.escapeHtml(item.merchant || item.description)}</td>
            <td>${PFM_UTILS.escapeHtml(item.category_id)}</td>
            <td class="text-end">${PFM_UTILS.formatNumber(item.amount)}</td>
            <td>${statusBadge}</td>
          </tr>
        `;
      }).join('');

      document.getElementById('csvPreviewSection').classList.remove('d-none');
      document.getElementById('btnCommitCsvImport').disabled = (res.summary.valid_rows === 0 && res.summary.duplicate_rows === 0);
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  commitCsvImport: async function() {
    const btn = document.getElementById('btnCommitCsvImport');
    const accountId = document.getElementById('csvImportAccount').value;
    const skipDuplicates = document.getElementById('csvSkipDuplicates').checked;
    const fileInput = document.getElementById('csvFileInput');
    const fileName = (fileInput.files && fileInput.files[0] && fileInput.files[0].name) || 'statement.csv';

    const validItems = this.csvPreviewItems.filter(i => i.is_valid);

    try {
      btn.disabled = true;
      const res = await PFM_API.call('transactions.importCsvCommit', {
        account_id: accountId,
        file_name: fileName,
        skip_duplicates: skipDuplicates,
        items: validItems
      });

      bootstrap.Modal.getInstance(document.getElementById('csvImportModal')).hide();
      PFM_APP.showToast(`นำเข้า CSV สำเร็จ ${res.imported_count} รายการ (ข้ามรายการซ้ำ ${res.skipped_duplicates} รายการ)`, 'success');
      await PFM_ACCOUNTS.loadAccounts();
      await this.loadTransactions(1);
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  }
};

