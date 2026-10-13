/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/accounts.js
 * Description: Manages Accounts CRUD, Reconcile Balance workflow, and Account Balance History viewer.
 */

window.PFM_ACCOUNTS = {
  accounts: [],

  init: function() {
    const accForm = document.getElementById('accountModalForm');
    if (accForm) {
      accForm.addEventListener('submit', (e) => this.handleAccountSave(e));
    }

    const recForm = document.getElementById('reconcileModalForm');
    if (recForm) {
      recForm.addEventListener('submit', (e) => this.handleReconcileSubmit(e));
    }

    const typeSelect = document.getElementById('accType');
    if (typeSelect) {
      typeSelect.addEventListener('change', () => this.toggleCreditCardFields());
    }
  },

  toggleCreditCardFields: function() {
    const typeVal = document.getElementById('accType').value;
    const ccFields = document.getElementById('accCreditCardFields');
    if (ccFields) {
      ccFields.classList.toggle('d-none', typeVal !== 'credit_card');
    }
  },

  loadAccounts: async function() {
    try {
      const res = await PFM_API.call('accounts.list', { include_archived: true });
      this.accounts = res.accounts || [];
      PFM_APP.accounts = this.accounts;
      PFM_APP.populateAccountSelects();
      this.renderAccountsGrid();
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถโหลดรายการบัญชี: ' + err.message, 'danger');
    }
  },

  renderAccountsGrid: function() {
    const grid = document.getElementById('accountsGridContainer');
    if (!grid) return;

    if (!this.accounts || this.accounts.length === 0) {
      grid.innerHTML = `
        <div class="col-12">
          <div class="surface-card text-center py-5">
            <i class="bi bi-wallet2 fs-1 text-primary"></i>
            <h5 class="mt-3">ยังไม่มีบัญชีการเงินในระบบ</h5>
            <p class="text-muted">เพิ่มบัญชีเงินสด บัญชีธนาคาร E-Wallet บัตรเครดิต หรือพอร์ตการลงทุนเพื่อเริ่มติดตามการเงิน</p>
            <button class="btn btn-primary" onclick="PFM_ACCOUNTS.openCreateModal()">
              <i class="bi bi-plus-lg me-1"></i>เพิ่มบัญชีแรกของคุณ
            </button>
          </div>
        </div>`;
      return;
    }

    grid.innerHTML = this.accounts.map(acc => {
      const isCredit = acc.account_type === 'credit_card';
      const availCredit = isCredit && acc.credit_limit > 0
        ? `<div class="small text-muted">วงเงิน: ${PFM_UTILS.formatCurrency(acc.credit_limit, acc.currency)} | คงเหลือใช้ได้: ${PFM_UTILS.formatCurrency(acc.credit_limit + acc.current_balance, acc.currency)}</div>`
        : '';
      const reconciledStr = acc.last_reconciled_at ? String(acc.last_reconciled_at).substring(0, 10) : '-';

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="surface-card account-card h-100 d-flex flex-column justify-content-between" style="border-left-color: ${PFM_UTILS.escapeHtml(acc.color || '#2563EB')}">
            <div>
              <div class="d-flex justify-content-between align-items-start">
                <div>
                  <span class="badge bg-primary bg-opacity-10 text-primary mb-1">
                    ${PFM_UTILS.escapeHtml(PFM_CONFIG.ACCOUNT_TYPE_LABELS[acc.account_type] || acc.account_type)}
                  </span>
                  <h5 class="fw-bold mb-0">${PFM_UTILS.escapeHtml(acc.account_name)}</h5>
                  <div class="small text-muted">
                    ${PFM_UTILS.escapeHtml(acc.institution_name || 'ไม่ระบุสถาบัน')}
                    ${acc.account_number_masked ? ' • ' + PFM_UTILS.escapeHtml(acc.account_number_masked) : ''}
                  </div>
                </div>
                <span class="badge bg-secondary">${PFM_UTILS.escapeHtml(acc.currency)}</span>
              </div>

              <div class="my-3">
                <div class="small text-muted">ยอดเงินปัจจุบัน (คำนวณจากธุรกรรมจริง)</div>
                <div class="fs-3 fw-bold ${acc.current_balance >= 0 ? 'text-primary' : 'text-danger'}">
                  ${PFM_UTILS.formatCurrency(acc.current_balance, acc.currency)}
                </div>
                <div class="small text-muted">ยอดตั้งต้น: ${PFM_UTILS.formatCurrency(acc.opening_balance, acc.currency)}</div>
                ${availCredit}
              </div>
            </div>

            <div class="pt-2 border-top d-flex flex-wrap justify-content-between align-items-center gap-2">
              <span class="small text-muted">กระทบยอดล่าสุด: ${PFM_UTILS.escapeHtml(reconciledStr)}</span>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-primary" onclick="PFM_ACCOUNTS.openReconcileModal('${PFM_UTILS.escapeHtml(acc.account_id)}')" title="กระทบยอดเงินจริง">
                  <i class="bi bi-check2-circle me-1"></i>กระทบยอด
                </button>
                <button class="btn btn-outline-secondary" onclick="PFM_ACCOUNTS.openHistoryModal('${PFM_UTILS.escapeHtml(acc.account_id)}')" title="ประวัติยอดเงิน">
                  <i class="bi bi-clock-history"></i>
                </button>
                <button class="btn btn-outline-secondary" onclick="PFM_ACCOUNTS.openEditModal('${PFM_UTILS.escapeHtml(acc.account_id)}')" title="แก้ไขบัญชี">
                  <i class="bi bi-pencil"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  openCreateModal: function() {
    document.getElementById('accountModalTitle').textContent = 'เพิ่มบัญชีการเงินใหม่';
    document.getElementById('accId').value = '';
    document.getElementById('accName').value = '';
    document.getElementById('accType').value = 'bank';
    document.getElementById('accCurrency').value = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';
    document.getElementById('accOpeningBalance').value = '0';
    document.getElementById('accInstitution').value = '';
    document.getElementById('accMaskedNumber').value = '';
    document.getElementById('accCreditLimit').value = '';
    document.getElementById('accBillingDay').value = '';
    document.getElementById('accDueDay').value = '';
    document.getElementById('accColor').value = '#2563EB';
    document.getElementById('accIncludeNetWorth').checked = true;
    this.toggleCreditCardFields();

    const modal = new bootstrap.Modal(document.getElementById('accountModal'));
    modal.show();
  },

  openEditModal: function(accountId) {
    const acc = this.accounts.find(a => a.account_id === accountId);
    if (!acc) return;

    document.getElementById('accountModalTitle').textContent = 'แก้ไขบัญชี: ' + acc.account_name;
    document.getElementById('accId').value = acc.account_id;
    document.getElementById('accName').value = acc.account_name;
    document.getElementById('accType').value = acc.account_type;
    document.getElementById('accCurrency').value = acc.currency;
    document.getElementById('accOpeningBalance').value = acc.opening_balance;
    document.getElementById('accInstitution').value = acc.institution_name || '';
    document.getElementById('accMaskedNumber').value = acc.account_number_masked || '';
    document.getElementById('accCreditLimit').value = acc.credit_limit || '';
    document.getElementById('accBillingDay').value = acc.billing_day || '';
    document.getElementById('accDueDay').value = acc.due_day || '';
    document.getElementById('accColor').value = acc.color || '#2563EB';
    document.getElementById('accIncludeNetWorth').checked = acc.include_in_net_worth !== false;
    this.toggleCreditCardFields();

    const modal = new bootstrap.Modal(document.getElementById('accountModal'));
    modal.show();
  },

  handleAccountSave: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveAccount');
    const accId = document.getElementById('accId').value.trim();

    const payload = {
      account_id: accId || undefined,
      account_name: document.getElementById('accName').value.trim(),
      account_type: document.getElementById('accType').value,
      currency: document.getElementById('accCurrency').value,
      opening_balance: Number(document.getElementById('accOpeningBalance').value || 0),
      institution_name: document.getElementById('accInstitution').value.trim(),
      account_number_masked: document.getElementById('accMaskedNumber').value.trim(),
      credit_limit: document.getElementById('accCreditLimit').value ? Number(document.getElementById('accCreditLimit').value) : 0,
      billing_day: document.getElementById('accBillingDay').value ? Number(document.getElementById('accBillingDay').value) : '',
      due_day: document.getElementById('accDueDay').value ? Number(document.getElementById('accDueDay').value) : '',
      color: document.getElementById('accColor').value,
      include_in_net_worth: document.getElementById('accIncludeNetWorth').checked
    };

    try {
      btn.disabled = true;
      const action = accId ? 'accounts.update' : 'accounts.create';
      await PFM_API.call(action, payload);

      bootstrap.Modal.getInstance(document.getElementById('accountModal')).hide();
      PFM_APP.showToast(accId ? 'อัปเดตบัญชีสำเร็จ' : 'สร้างบัญชีใหม่สำเร็จ', 'success');
      await this.loadAccounts();
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  openReconcileModal: function(accountId) {
    const acc = this.accounts.find(a => a.account_id === accountId);
    if (!acc) return;

    document.getElementById('recAccountId').value = acc.account_id;
    document.getElementById('recAccountName').textContent = `${acc.account_name} (${acc.currency})`;
    document.getElementById('recSystemBalance').textContent = PFM_UTILS.formatCurrency(acc.current_balance, acc.currency);
    document.getElementById('recActualBalance').value = acc.current_balance;
    document.getElementById('recNote').value = 'กระทบยอดเงินคงเหลือจริงตาม Statement / เงินสดจริง';

    const modal = new bootstrap.Modal(document.getElementById('reconcileModal'));
    modal.show();
  },

  handleReconcileSubmit: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitReconcile');
    const accountId = document.getElementById('recAccountId').value;
    const actualBalance = Number(document.getElementById('recActualBalance').value);
    const note = document.getElementById('recNote').value.trim();

    try {
      btn.disabled = true;
      const res = await PFM_API.call('accounts.reconcile', {
        account_id: accountId,
        actual_balance: actualBalance,
        note: note
      });

      bootstrap.Modal.getInstance(document.getElementById('reconcileModal')).hide();
      const diffMsg = res.difference === 0
        ? 'ยอดเงินตรงกันพอดี ไม่ต้องสร้างรายการปรับยอด'
        : `กระทบยอดสำเร็จ สร้างรายการปรับยอด (Adjustment) ${res.difference > 0 ? '+' : ''}${res.difference.toFixed(2)}`;
      PFM_APP.showToast(diffMsg, 'success');
      await this.loadAccounts();
      await PFM_TRANSACTIONS.loadTransactions();
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  openHistoryModal: async function(accountId) {
    try {
      const res = await PFM_API.call('accounts.balanceHistory', { account_id: accountId });
      const acc = res.account;
      const history = res.history || [];

      document.getElementById('historyModalTitle').textContent = `ประวัติการเคลื่อนไหวยอดเงิน: ${acc.account_name} (${acc.currency})`;
      const tbody = document.getElementById('accountHistoryTableBody');
      tbody.innerHTML = history.slice().reverse().map(item => {
        const sign = item.change > 0 ? '+' : '';
        const cls = item.change >= 0 ? 'text-success' : 'text-danger';
        return `
          <tr>
            <td class="small">${PFM_UTILS.escapeHtml(item.date)} ${PFM_UTILS.escapeHtml(item.time || '')}</td>
            <td>${PFM_UTILS.escapeHtml(item.event)}</td>
            <td class="text-end fw-semibold ${cls}">${sign}${PFM_UTILS.formatCurrency(item.change, acc.currency)}</td>
            <td class="text-end fw-bold">${PFM_UTILS.formatCurrency(item.balance_after, acc.currency)}</td>
          </tr>
        `;
      }).join('');

      const modal = new bootstrap.Modal(document.getElementById('accountHistoryModal'));
      modal.show();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  }
};

