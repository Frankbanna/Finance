/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/debts.js (Phase 3 — Module G: Debts, Amortization, DTI & Credit Cards)
 * Description: Handles loans/debts CRUD, installment payment splitting (principal/interest),
 *              amortization schedule table, Debt-to-Income (DTI) ratio, and non-duplicate Credit Card settlement.
 */

window.PFM_DEBTS = {
  debtsData: null,

  init: function() {
    const createForm = document.getElementById('debtModalForm');
    if (createForm) {
      createForm.addEventListener('submit', (e) => this.handleSaveDebt(e));
    }

    const payForm = document.getElementById('debtPayModalForm');
    if (payForm) {
      payForm.addEventListener('submit', (e) => this.handleSubmitDebtPayment(e));
    }

    const ccPayForm = document.getElementById('creditCardPayModalForm');
    if (ccPayForm) {
      ccPayForm.addEventListener('submit', (e) => this.handleSubmitCreditCardPay(e));
    }

    const payTotalInput = document.getElementById('dpmTotalAmount');
    if (payTotalInput) {
      payTotalInput.addEventListener('input', () => this.recalcPaymentSplitPreview());
    }
    const payIntInput = document.getElementById('dpmInterestPaid');
    if (payIntInput) {
      payIntInput.addEventListener('input', () => this.recalcPaymentSplitPreview(true));
    }
  },

  loadDebts: async function() {
    try {
      const res = await PFM_API.call('debts.list', { include_archived: false });
      this.debtsData = res;
      this.renderDebtsView();
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถโหลดข้อมูลหนี้สินและบัตรเครดิต: ' + err.message, 'danger');
    }
  },

  renderDebtsView: function() {
    if (!this.debtsData) return;
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';
    const sum = this.debtsData.summary || {};

    // Render KPIs
    const elTotalDebt = document.getElementById('dbtKpiTotalRemaining');
    if (elTotalDebt) elTotalDebt.textContent = PFM_UTILS.formatCurrency(sum.total_remaining_balance || 0, cur);

    const elCcOwed = document.getElementById('dbtKpiCreditCardOwed');
    if (elCcOwed) elCcOwed.textContent = PFM_UTILS.formatCurrency(sum.total_credit_card_owed || 0, cur);

    const elMonthlyService = document.getElementById('dbtKpiMonthlyService');
    if (elMonthlyService) elMonthlyService.textContent = PFM_UTILS.formatCurrency(sum.combined_monthly_debt_service || 0, cur) + ' / เดือน';

    const elDti = document.getElementById('dbtKpiDtiRatio');
    const elDtiBadge = document.getElementById('dbtKpiDtiBadge');
    if (elDti) {
      elDti.textContent = `${Number(sum.dti_percentage || 0).toFixed(1)}%`;
    }
    if (elDtiBadge) {
      const st = sum.dti_status || 'healthy';
      if (st === 'high_risk') {
        elDtiBadge.className = 'badge bg-danger';
        elDtiBadge.textContent = 'ความเสี่ยงสูง (> 50% ของรายได้)';
      } else if (st === 'moderate') {
        elDtiBadge.className = 'badge bg-warning text-dark';
        elDtiBadge.textContent = 'ปานกลาง (36–49% ของรายได้)';
      } else {
        elDtiBadge.className = 'badge bg-success';
        elDtiBadge.textContent = 'สุขภาพหนี้ดี (≤ 35% ของรายได้)';
      }
    }

    this.renderCreditCardsSection(this.debtsData.credit_cards || []);
    this.renderLoansTable(this.debtsData.debts || [], cur);
  },

  renderCreditCardsSection: function(cards) {
    const container = document.getElementById('creditCardsTrackingContainer');
    if (!container) return;

    if (!cards.length) {
      container.innerHTML = `
        <div class="col-12">
          <div class="p-3 border rounded text-center text-muted small">
            ยังไม่มีบัญชีประเภทบัตรเครดิต (สามารถเพิ่มบัญชีประเภท <code>credit_card</code> ได้ที่เมนู "บัญชีการเงิน")
          </div>
        </div>
      `;
      return;
    }

    container.innerHTML = cards.map(cc => {
      const util = Number(cc.utilization_pct || 0);
      const barCls = util >= 80 ? 'bg-danger' : (util >= 50 ? 'bg-warning' : 'bg-info');
      const statusBadge = cc.owed_amount <= 0
        ? '<span class="badge bg-success">ไม่มียอดค้างชำระ</span>'
        : (util >= 80
          ? '<span class="badge bg-danger">ใช้วงเงินสูง (' + util.toFixed(1) + '%)</span>'
          : '<span class="badge bg-warning text-dark">มียอดรอชำระรอบบิล</span>');

      return `
        <div class="col-12 col-md-6">
          <div class="surface-card h-100 border-start border-4 ${cc.owed_amount > 0 ? 'border-warning' : 'border-success'}">
            <div class="d-flex justify-content-between align-items-start mb-2">
              <div>
                <h6 class="fw-bold mb-0"><i class="bi bi-credit-card-2-front me-1 text-primary"></i>${PFM_UTILS.escapeHtml(cc.account_name)}</h6>
                <div class="small text-muted">${PFM_UTILS.escapeHtml(cc.institution_name || 'บัตรเครดิต')} • ตัดรอบวันที่ ${cc.billing_day} • ชำระวันที่ ${cc.due_day}</div>
              </div>
              ${statusBadge}
            </div>

            <div class="row g-2 my-2">
              <div class="col-4">
                <div class="small text-muted">ยอดใช้ไป/ค้างชำระ</div>
                <div class="fw-bold text-danger">${PFM_UTILS.formatCurrency(cc.owed_amount, cc.currency)}</div>
              </div>
              <div class="col-4">
                <div class="small text-muted">วงเงินคงเหลือ</div>
                <div class="fw-bold text-success">${PFM_UTILS.formatCurrency(cc.available_credit, cc.currency)}</div>
              </div>
              <div class="col-4">
                <div class="small text-muted">วงเงินรวม</div>
                <div class="fw-semibold">${PFM_UTILS.formatCurrency(cc.credit_limit, cc.currency)}</div>
              </div>
            </div>

            <div class="progress mb-2" style="height: 8px;">
              <div class="progress-bar ${barCls}" style="width: ${Math.min(100, util)}%"></div>
            </div>

            <div class="d-flex flex-wrap justify-content-between align-items-center small text-muted mt-2 pt-2 border-top gap-2">
              <div>
                <span>ครบกำหนดรอบถัดไป: <strong class="text-dark">${PFM_UTILS.escapeHtml(cc.next_due_date)}</strong></span>
                <span class="ms-2">ขั้นต่ำ ~${PFM_UTILS.formatCurrency(cc.estimated_minimum_payment, cc.currency)}</span>
              </div>
              <button class="btn btn-sm btn-primary" onclick="PFM_DEBTS.openCreditCardPayModal('${PFM_UTILS.escapeHtml(cc.account_id)}')">
                <i class="bi bi-arrow-left-right me-1"></i>ชำระยอดบัตร (Transfer ไม่นับจ่ายซ้ำ)
              </button>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderLoansTable: function(debts, cur) {
    const tbody = document.getElementById('debtsTableBody');
    if (!tbody) return;

    if (!debts.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">ยังไม่มีรายการหนี้สินหรือสินเชื่อ กดปุ่ม "เพิ่มรายการหนี้สิน/สินเชื่อ" ด้านบนเพื่อเริ่มต้น</td></tr>`;
      return;
    }

    const typeLabels = {
      mortgage: 'สินเชื่อบ้าน/คอนโด',
      auto_loan: 'สินเชื่อรถยนต์',
      personal_loan: 'สินเชื่อส่วนบุคคล',
      credit_card_debt: 'หนี้บัตรเครดิต/บัตรกดเงินสด',
      student_loan: 'กยศ./การศึกษา',
      business_loan: 'สินเชื่อธุรกิจ',
      other: 'หนี้สินอื่นๆ'
    };

    tbody.innerHTML = debts.map(d => {
      const pct = Number(d.paid_off_pct || 0);
      const stBadge = d.status === 'paid_off'
        ? '<span class="badge bg-success">ปิดหนี้สำเร็จแล้ว</span>'
        : '<span class="badge bg-primary">กำลังผ่อนชำระ</span>';

      return `
        <tr>
          <td>
            <div class="fw-bold">${PFM_UTILS.escapeHtml(d.debt_name)}</div>
            <div class="small text-muted">${PFM_UTILS.escapeHtml(typeLabels[d.debt_type] || d.debt_type)} ${d.lender_name ? '• ' + PFM_UTILS.escapeHtml(d.lender_name) : ''}</div>
          </td>
          <td class="text-end">
            <div class="fw-semibold">${PFM_UTILS.formatCurrency(d.principal_amount, cur)}</div>
            <div class="small text-muted">ดอกเบี้ย ${Number(d.interest_rate_annual || 0).toFixed(2)}% / ปี</div>
          </td>
          <td class="text-end">
            <div class="fw-bold text-danger">${PFM_UTILS.formatCurrency(d.current_balance, cur)}</div>
            <div class="progress mt-1" style="height: 6px;">
              <div class="progress-bar bg-success" style="width: ${Math.min(100, pct)}%"></div>
            </div>
            <div class="small text-muted">ปลดหนี้แล้ว ${pct.toFixed(1)}%</div>
          </td>
          <td class="text-end">
            <div class="fw-semibold">${PFM_UTILS.formatCurrency(d.minimum_payment, cur)} / ด.</div>
            <div class="small text-muted">ทุกวันที่ ${d.due_day} (ถัดไป: ${PFM_UTILS.escapeHtml(d.next_due_date)})</div>
          </td>
          <td class="small">
            <div>เงินต้นสะสม: <span class="text-success fw-semibold">${PFM_UTILS.formatCurrency(d.total_principal_paid, cur)}</span></div>
            <div>ดอกเบี้ยสะสม: <span class="text-danger fw-semibold">${PFM_UTILS.formatCurrency(d.total_interest_paid, cur)}</span></div>
          </td>
          <td>
            ${stBadge}
            <div class="small text-muted mt-1">คาดว่าหมด: ${PFM_UTILS.escapeHtml(d.estimated_payoff_date || '-')} ${d.estimated_months_remaining ? '(' + d.estimated_months_remaining + ' งวด)' : ''}</div>
          </td>
          <td class="text-end">
            <div class="btn-group btn-group-sm">
              ${d.status === 'active' ? `
                <button class="btn btn-success" title="บันทึกผ่อนชำระงวดนี้" onclick="PFM_DEBTS.openDebtPayModal('${PFM_UTILS.escapeHtml(d.debt_id)}')">
                  <i class="bi bi-cash-coin me-1"></i>ผ่อนชำระ
                </button>
              ` : ''}
              <button class="btn btn-outline-primary" title="ดูตารางผ่อนชำระ (Amortization Schedule)" onclick="PFM_DEBTS.openAmortizationModal('${PFM_UTILS.escapeHtml(d.debt_id)}')">
                <i class="bi bi-table"></i>
              </button>
              <button class="btn btn-outline-secondary" title="ประวัติการชำระหนี้" onclick="PFM_DEBTS.openDebtHistoryModal('${PFM_UTILS.escapeHtml(d.debt_id)}')">
                <i class="bi bi-clock-history"></i>
              </button>
              <button class="btn btn-outline-dark" title="แก้ไขข้อมูลหนี้สิน" onclick="PFM_DEBTS.openEditModal('${PFM_UTILS.escapeHtml(d.debt_id)}')">
                <i class="bi bi-pencil"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  openCreateModal: function() {
    document.getElementById('debtModalTitle').textContent = 'เพิ่มรายการหนี้สิน / สินเชื่อใหม่';
    document.getElementById('dbtId').value = '';
    document.getElementById('dbtName').value = '';
    document.getElementById('dbtType').value = 'personal_loan';
    document.getElementById('dbtLender').value = '';
    document.getElementById('dbtPrincipal').value = '';
    document.getElementById('dbtCurrentBalance').value = '';
    document.getElementById('dbtInterestRate').value = '7.5';
    document.getElementById('dbtMinPayment').value = '';
    document.getElementById('dbtDueDay').value = '15';
    document.getElementById('dbtStartDate').value = PFM_UTILS.todayDateString();
    document.getElementById('dbtTargetDate').value = '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('debtModal')).show();
  },

  openEditModal: function(debtId) {
    const d = (this.debtsData && this.debtsData.debts || []).find(x => x.debt_id === debtId);
    if (!d) return;

    document.getElementById('debtModalTitle').textContent = 'แก้ไขข้อมูลหนี้สิน: ' + d.debt_name;
    document.getElementById('dbtId').value = d.debt_id;
    document.getElementById('dbtName').value = d.debt_name;
    document.getElementById('dbtType').value = d.debt_type || 'personal_loan';
    document.getElementById('dbtLender').value = d.lender_name || '';
    document.getElementById('dbtPrincipal').value = d.principal_amount;
    document.getElementById('dbtCurrentBalance').value = d.current_balance;
    document.getElementById('dbtInterestRate').value = d.interest_rate_annual;
    document.getElementById('dbtMinPayment').value = d.minimum_payment;
    document.getElementById('dbtDueDay').value = d.due_day || 15;
    document.getElementById('dbtStartDate').value = d.start_date || PFM_UTILS.todayDateString();
    document.getElementById('dbtTargetDate').value = d.target_payoff_date || '';
    bootstrap.Modal.getOrCreateInstance(document.getElementById('debtModal')).show();
  },

  handleSaveDebt: async function(e) {
    e.preventDefault();
    const debtId = document.getElementById('dbtId').value.trim();
    const payload = {
      debt_name: document.getElementById('dbtName').value.trim(),
      debt_type: document.getElementById('dbtType').value,
      lender_name: document.getElementById('dbtLender').value.trim(),
      principal_amount: Number(document.getElementById('dbtPrincipal').value),
      current_balance: document.getElementById('dbtCurrentBalance').value !== ''
        ? Number(document.getElementById('dbtCurrentBalance').value)
        : Number(document.getElementById('dbtPrincipal').value),
      interest_rate_annual: Number(document.getElementById('dbtInterestRate').value || 0),
      minimum_payment: Number(document.getElementById('dbtMinPayment').value),
      due_day: Number(document.getElementById('dbtDueDay').value || 15),
      start_date: document.getElementById('dbtStartDate').value,
      target_payoff_date: document.getElementById('dbtTargetDate').value
    };

    try {
      if (debtId) {
        payload.debt_id = debtId;
        await PFM_API.call('debts.update', payload);
        PFM_APP.showToast('อัปเดตข้อมูลหนี้สินสำเร็จ', 'success');
      } else {
        await PFM_API.call('debts.create', payload);
        PFM_APP.showToast('เพิ่มรายการหนี้สินลงใน Google Sheets สำเร็จ', 'success');
      }
      bootstrap.Modal.getInstance(document.getElementById('debtModal')).hide();
      await this.loadDebts();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  openDebtPayModal: function(debtId) {
    const d = (this.debtsData && this.debtsData.debts || []).find(x => x.debt_id === debtId);
    if (!d) return;

    document.getElementById('dpmDebtId').value = d.debt_id;
    document.getElementById('dpmDebtTitle').textContent = `${d.debt_name} (คงเหลือ ${PFM_UTILS.formatCurrency(d.current_balance, 'THB')})`;
    document.getElementById('dpmCurrentBalanceHidden').value = d.current_balance;
    document.getElementById('dpmAnnualRateHidden').value = d.interest_rate_annual;
    document.getElementById('dpmPaymentDate').value = PFM_UTILS.todayDateString();
    document.getElementById('dpmTotalAmount').value = d.minimum_payment;
    document.getElementById('dpmFeeAmount').value = '0';

    // Populate source payment accounts
    const accSelect = document.getElementById('dpmPaymentAccount');
    if (accSelect) {
      const bankAccs = (PFM_APP.accounts || []).filter(a => !a.is_archived);
      accSelect.innerHTML = `<option value="">-- บันทึกเฉพาะตารางหนี้ (ไม่ตัดบัญชี) --</option>` +
        bankAccs.map(a => `<option value="${PFM_UTILS.escapeHtml(a.account_id)}">${PFM_UTILS.escapeHtml(a.account_name)} (คงเหลือ ${PFM_UTILS.formatCurrency(a.current_balance, a.currency)})</option>`).join('');
      if (bankAccs.length > 0) accSelect.value = bankAccs[0].account_id;
    }

    this.recalcPaymentSplitPreview(false);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('debtPayModal')).show();
  },

  recalcPaymentSplitPreview: function(manualInterest) {
    const curBal = Number(document.getElementById('dpmCurrentBalanceHidden').value || 0);
    const annRate = Number(document.getElementById('dpmAnnualRateHidden').value || 0);
    const totalAmt = Number(document.getElementById('dpmTotalAmount').value || 0);
    const feeAmt = Number(document.getElementById('dpmFeeAmount').value || 0);

    let intPaid = Number(document.getElementById('dpmInterestPaid').value || 0);
    if (!manualInterest) {
      const estMonthlyInt = Math.round((curBal * (annRate / 100) / 12) * 100) / 100;
      intPaid = Math.min(Math.max(0, totalAmt - feeAmt), estMonthlyInt);
      document.getElementById('dpmInterestPaid').value = intPaid.toFixed(2);
    }
    const prinPaid = Math.max(0, Math.round((totalAmt - intPaid - feeAmt) * 100) / 100);
    document.getElementById('dpmPrincipalPaid').value = prinPaid.toFixed(2);
    const remAfter = Math.max(0, Math.round((curBal - prinPaid) * 100) / 100);
    const remEl = document.getElementById('dpmRemainingPreview');
    if (remEl) remEl.textContent = PFM_UTILS.formatCurrency(remAfter, 'THB');
  },

  handleSubmitDebtPayment: async function(e) {
    e.preventDefault();
    const payload = {
      debt_id: document.getElementById('dpmDebtId').value,
      payment_date: document.getElementById('dpmPaymentDate').value,
      total_amount: Number(document.getElementById('dpmTotalAmount').value),
      interest_paid: Number(document.getElementById('dpmInterestPaid').value || 0),
      principal_paid: Number(document.getElementById('dpmPrincipalPaid').value || 0),
      fee_amount: Number(document.getElementById('dpmFeeAmount').value || 0),
      payment_account_id: document.getElementById('dpmPaymentAccount').value
    };

    try {
      await PFM_API.call('debts.pay', payload);
      bootstrap.Modal.getInstance(document.getElementById('debtPayModal')).hide();
      PFM_APP.showToast('บันทึกการผ่อนชำระหนี้ (แยกเงินต้น/ดอกเบี้ย) สำเร็จ', 'success');
      await PFM_ACCOUNTS.loadAccounts();
      await this.loadDebts();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  openCreditCardPayModal: function(ccAccountId) {
    const cards = (this.debtsData && this.debtsData.credit_cards) || [];
    const cc = cards.find(c => c.account_id === ccAccountId) || cards[0];
    if (!cc) {
      PFM_APP.showToast('ไม่พบบัญชีบัตรเครดิต', 'warning');
      return;
    }

    const fromSelect = document.getElementById('ccPayFromAccount');
    const toSelect = document.getElementById('ccPayCardAccount');
    const sourceAccounts = (PFM_APP.accounts || []).filter(a => !a.is_archived && a.account_type !== 'credit_card');
    const ccAccounts = (PFM_APP.accounts || []).filter(a => !a.is_archived && a.account_type === 'credit_card');

    if (fromSelect) {
      fromSelect.innerHTML = sourceAccounts.map(a =>
        `<option value="${PFM_UTILS.escapeHtml(a.account_id)}">${PFM_UTILS.escapeHtml(a.account_name)} (คงเหลือ ${PFM_UTILS.formatCurrency(a.current_balance, a.currency)})</option>`
      ).join('');
    }
    if (toSelect) {
      toSelect.innerHTML = ccAccounts.map(a =>
        `<option value="${PFM_UTILS.escapeHtml(a.account_id)}">${PFM_UTILS.escapeHtml(a.account_name)} (ยอดค้าง ${PFM_UTILS.formatCurrency(Math.abs(Math.min(0, a.current_balance)), a.currency)})</option>`
      ).join('');
      toSelect.value = cc.account_id;
    }

    document.getElementById('ccPayDate').value = PFM_UTILS.todayDateString();
    document.getElementById('ccPayAmount').value = cc.owed_amount > 0 ? cc.owed_amount : '';
    document.getElementById('ccPayNote').value = `ชำระบิลบัตรเครดิต ${cc.account_name}`;
    bootstrap.Modal.getOrCreateInstance(document.getElementById('creditCardPayModal')).show();
  },

  handleSubmitCreditCardPay: async function(e) {
    e.preventDefault();
    const payload = {
      from_account_id: document.getElementById('ccPayFromAccount').value,
      credit_card_account_id: document.getElementById('ccPayCardAccount').value,
      payment_date: document.getElementById('ccPayDate').value,
      amount: Number(document.getElementById('ccPayAmount').value),
      note: document.getElementById('ccPayNote').value.trim()
    };

    try {
      await PFM_API.call('debts.payCreditCard', payload);
      bootstrap.Modal.getInstance(document.getElementById('creditCardPayModal')).hide();
      PFM_APP.showToast('ชำระยอดบัตรเครดิตแบบ Transfer สำเร็จ (ไม่นับรายจ่ายซ้ำ)', 'success');
      await PFM_ACCOUNTS.loadAccounts();
      await this.loadDebts();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  openAmortizationModal: async function(debtId) {
    try {
      const res = await PFM_API.call('debts.amortization', { debt_id: debtId });
      document.getElementById('amortModalTitle').textContent = `ตารางผ่อนชำระ (Amortization): ${res.debt_name}`;
      document.getElementById('amortSummaryText').innerHTML = res.warning
        ? `<div class="alert alert-warning py-2 mb-0 small">${PFM_UTILS.escapeHtml(res.warning)}</div>`
        : `<div class="d-flex flex-wrap gap-3 small">
             <span>ยอดหนี้คงเหลือตั้งต้น: <strong>${PFM_UTILS.formatCurrency(res.starting_balance, 'THB')}</strong></span>
             <span>ค่างวดต่อเดือน: <strong>${PFM_UTILS.formatCurrency(res.monthly_payment, 'THB')}</strong></span>
             <span>จำนวนงวดที่เหลือ: <strong class="text-primary">${res.months_to_payoff} งวด</strong> (จบ ${PFM_UTILS.escapeHtml(res.estimated_payoff_date || '-')})</span>
             <span>ดอกเบี้ยรวมตลอดสัญญาที่เหลือ: <strong class="text-danger">${PFM_UTILS.formatCurrency(res.total_interest, 'THB')}</strong></span>
           </div>`;

      const tbody = document.getElementById('amortScheduleTableBody');
      const sched = res.schedule || [];
      tbody.innerHTML = sched.length
        ? sched.map(row => `
            <tr>
              <td>งวดที่ ${row.installment_no}</td>
              <td>${PFM_UTILS.escapeHtml(row.estimated_date)}</td>
              <td class="text-end fw-semibold">${PFM_UTILS.formatCurrency(row.payment_amount, 'THB')}</td>
              <td class="text-end text-success">${PFM_UTILS.formatCurrency(row.principal_paid, 'THB')}</td>
              <td class="text-end text-danger">${PFM_UTILS.formatCurrency(row.interest_paid, 'THB')}</td>
              <td class="text-end fw-bold">${PFM_UTILS.formatCurrency(row.remaining_balance, 'THB')}</td>
            </tr>
          `).join('')
        : `<tr><td colspan="6" class="text-center text-muted py-3">ไม่มีตารางผ่อนชำระ</td></tr>`;

      bootstrap.Modal.getOrCreateInstance(document.getElementById('amortizationModal')).show();
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถคำนวณตารางผ่อนชำระ: ' + err.message, 'danger');
    }
  },

  openDebtHistoryModal: function(debtId) {
    const d = (this.debtsData && this.debtsData.debts || []).find(x => x.debt_id === debtId);
    if (!d) return;

    document.getElementById('debtHistoryModalTitle').textContent = `ประวัติการผ่อนชำระ: ${d.debt_name}`;
    const tbody = document.getElementById('debtHistoryTableBody');
    const pmts = d.payments || [];
    tbody.innerHTML = pmts.length
      ? pmts.map(p => `
          <tr>
            <td>${PFM_UTILS.escapeHtml(p.payment_date)}</td>
            <td class="text-end fw-bold">${PFM_UTILS.formatCurrency(p.total_amount, 'THB')}</td>
            <td class="text-end text-success">${PFM_UTILS.formatCurrency(p.principal_paid, 'THB')}</td>
            <td class="text-end text-danger">${PFM_UTILS.formatCurrency(p.interest_paid, 'THB')}</td>
            <td class="text-end">${PFM_UTILS.formatCurrency(p.remaining_balance, 'THB')}</td>
            <td class="small text-muted">${PFM_UTILS.escapeHtml(p.linked_transaction_id || '-')}</td>
          </tr>
        `).join('')
      : `<tr><td colspan="6" class="text-center text-muted py-3">ยังไม่มีประวัติการชำระหนี้รายการนี้</td></tr>`;

    bootstrap.Modal.getOrCreateInstance(document.getElementById('debtHistoryModal')).show();
  }
};

