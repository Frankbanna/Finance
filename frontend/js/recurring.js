/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/recurring.js (Phase 2 - Module F)
 * Description: Manages recurring transactions, clearly separates forecasted upcoming occurrences
 *              from actual posted transactions, and runs idempotent due-processing triggers.
 */

window.PFM_RECURRING = {
  rules: [],
  upcomingForecasts: [],
  actualGenerated: [],

  init: function() {
    const form = document.getElementById('recurringModalForm');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveRecurring(e));
    }

    const typeSel = document.getElementById('recTxType');
    if (typeSel) {
      typeSel.addEventListener('change', () => this.onRecTypeChanged());
    }
  },

  onRecTypeChanged: function() {
    const t = document.getElementById('recTxType').value;
    const toAccGrp = document.getElementById('recToAccountGroup');
    if (toAccGrp) {
      toAccGrp.classList.toggle('d-none', t !== 'transfer');
    }
    const catSel = document.getElementById('recCategory');
    if (catSel) {
      const cats = (PFM_APP.categories || []).filter(c => c.category_type === t);
      catSel.innerHTML = cats.map(c =>
        `<option value="${PFM_UTILS.escapeHtml(c.category_id)}">${c.parent_id ? '↳ ' : ''}${PFM_UTILS.escapeHtml(c.category_name)}</option>`
      ).join('');
    }
  },

  loadRecurring: async function() {
    try {
      const res = await PFM_API.call('recurring.list', {});
      this.rules = res.recurring_rules || [];
      this.upcomingForecasts = res.upcoming_forecasts || [];
      this.actualGenerated = res.actual_generated_transactions || [];
      this.renderRulesTable();
      this.renderForecastsVsActuals();
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถโหลดรายการประจำ: ' + err.message, 'danger');
    }
  },

  renderRulesTable: function() {
    const tbody = document.getElementById('recurringRulesTableBody');
    if (!tbody) return;

    if (!this.rules || this.rules.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="7" class="text-center text-muted py-4">
            ยังไม่มีการตั้งค่ารายการธุรกรรมประจำ กดปุ่ม "+ เพิ่มรายการประจำ" ด้านบนเพื่อเริ่มต้น
          </td>
        </tr>`;
      return;
    }

    const freqLabels = {
      daily: 'รายวัน (Daily)',
      weekly: 'รายสัปดาห์ (Weekly)',
      monthly: 'รายเดือน (Monthly)',
      yearly: 'รายปี (Yearly)'
    };
    const accMap = PFM_APP.getAccountMap();
    const catMap = PFM_APP.getCategoryMap();

    tbody.innerHTML = this.rules.map(r => {
      const accName = (accMap[r.account_id] && accMap[r.account_id].account_name) || r.account_id;
      const catName = (catMap[r.category_id] && catMap[r.category_id].category_name) || r.category_id || '-';
      const statusBadge = r.status === 'active'
        ? '<span class="badge bg-success">ทำงานอยู่ (Active)</span>'
        : `<span class="badge bg-secondary">${PFM_UTILS.escapeHtml(r.status)}</span>`;

      return `
        <tr>
          <td>
            <div class="fw-bold">${PFM_UTILS.escapeHtml(r.title)}</div>
            <div class="small text-muted">เริ่ม: ${PFM_UTILS.escapeHtml(r.start_date)} ${r.end_date ? '• สิ้นสุด: ' + PFM_UTILS.escapeHtml(r.end_date) : ''}</div>
          </td>
          <td><span class="badge badge-tx-${PFM_UTILS.escapeHtml(r.tx_type)}">${PFM_UTILS.escapeHtml(PFM_CONFIG.TX_TYPE_LABELS[r.tx_type] || r.tx_type)}</span></td>
          <td class="small">
            <div>${PFM_UTILS.escapeHtml(accName)}</div>
            <div class="text-muted">${PFM_UTILS.escapeHtml(catName)}</div>
          </td>
          <td><span class="badge bg-info bg-opacity-10 text-info">${PFM_UTILS.escapeHtml(freqLabels[r.frequency] || r.frequency)} (ทุกๆ ${r.interval_count} รอบ)</span></td>
          <td class="small">
            <div>ครั้งถัดไป: <strong class="text-primary">${PFM_UTILS.escapeHtml(r.next_run_date)}</strong></div>
            <div class="text-muted">ล่าสุด: ${PFM_UTILS.escapeHtml(r.last_run_date || 'ยังไม่เคยรัน')}</div>
          </td>
          <td class="text-end fw-bold amount-${PFM_UTILS.escapeHtml(r.tx_type)}">
            ${PFM_UTILS.formatCurrency(r.amount, r.currency)}
            <div class="mt-1">${statusBadge}</div>
          </td>
          <td class="text-end">
            <div class="btn-group btn-group-sm">
              <button class="btn btn-outline-secondary" onclick="PFM_RECURRING.openEditModal('${PFM_UTILS.escapeHtml(r.recurring_id)}')">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="btn ${r.status === 'active' ? 'btn-outline-warning' : 'btn-outline-success'}" onclick="PFM_RECURRING.toggleRuleStatus('${PFM_UTILS.escapeHtml(r.recurring_id)}', '${r.status === 'active' ? 'paused' : 'active'}')">
                <i class="bi ${r.status === 'active' ? 'bi-pause-circle' : 'bi-play-circle'}"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderForecastsVsActuals: function() {
    const forecastBody = document.getElementById('recurringForecastTableBody');
    if (forecastBody) {
      if (!this.upcomingForecasts || this.upcomingForecasts.length === 0) {
        forecastBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีรายการประมาณการล่วงหน้าใน 90 วันข้างหน้า</td></tr>';
      } else {
        forecastBody.innerHTML = this.upcomingForecasts.slice(0, 12).map(f => `
          <tr>
            <td class="small fw-semibold">${PFM_UTILS.escapeHtml(f.scheduled_date)}</td>
            <td>
              <span class="badge bg-warning text-dark me-1">ประมาณการ (Forecast)</span>
              ${PFM_UTILS.escapeHtml(f.title)}
            </td>
            <td><span class="badge badge-tx-${PFM_UTILS.escapeHtml(f.tx_type)}">${PFM_UTILS.escapeHtml(f.tx_type)}</span></td>
            <td class="text-end fw-bold">${PFM_UTILS.formatCurrency(f.amount, f.currency)}</td>
          </tr>
        `).join('');
      }
    }

    const actualBody = document.getElementById('recurringActualTableBody');
    if (actualBody) {
      if (!this.actualGenerated || this.actualGenerated.length === 0) {
        actualBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ยังไม่มีรายการที่สร้างเข้าบัญชีจริง</td></tr>';
      } else {
        actualBody.innerHTML = this.actualGenerated.slice(0, 12).map(tx => `
          <tr>
            <td class="small fw-semibold">${PFM_UTILS.escapeHtml(tx.tx_date)}</td>
            <td>
              <span class="badge bg-success me-1">เกิดขึ้นจริง (Posted)</span>
              ${PFM_UTILS.escapeHtml(tx.merchant)}
            </td>
            <td class="small text-muted"><code>${PFM_UTILS.escapeHtml(tx.idempotency_key)}</code></td>
            <td class="text-end fw-bold amount-${PFM_UTILS.escapeHtml(tx.tx_type)}">${PFM_UTILS.formatCurrency(tx.amount, tx.currency)}</td>
          </tr>
        `).join('');
      }
    }
  },

  openCreateModal: function() {
    if (!PFM_APP.accounts || PFM_APP.accounts.length === 0) {
      PFM_APP.showToast('กรุณาสร้างบัญชีก่อนตั้งค่ารายการประจำ', 'warning');
      return;
    }
    document.getElementById('recurringModalTitle').textContent = 'สร้างรายการประจำใหม่ (New Recurring Rule)';
    document.getElementById('recId').value = '';
    document.getElementById('recTitle').value = '';
    document.getElementById('recTxType').value = 'expense';
    document.getElementById('recAmount').value = '';
    document.getElementById('recFrequency').value = 'monthly';
    document.getElementById('recIntervalCount').value = '1';
    document.getElementById('recStartDate').value = PFM_UTILS.todayDateString();
    document.getElementById('recEndDate').value = '';
    document.getElementById('recNextRunDate').value = PFM_UTILS.todayDateString();
    document.getElementById('recAutoPost').checked = true;

    this.onRecTypeChanged();
    const modal = new bootstrap.Modal(document.getElementById('recurringModal'));
    modal.show();
  },

  openEditModal: function(recId) {
    const r = this.rules.find(x => x.recurring_id === recId);
    if (!r) return;

    document.getElementById('recurringModalTitle').textContent = 'แก้ไขรายการประจำ: ' + r.title;
    document.getElementById('recId').value = r.recurring_id;
    document.getElementById('recTitle').value = r.title;
    document.getElementById('recTxType').value = r.tx_type;
    this.onRecTypeChanged();
    document.getElementById('recAccount').value = r.account_id;
    document.getElementById('recToAccount').value = r.to_account_id || '';
    document.getElementById('recCategory').value = r.category_id || '';
    document.getElementById('recAmount').value = r.amount;
    document.getElementById('recFrequency').value = r.frequency;
    document.getElementById('recIntervalCount').value = r.interval_count || 1;
    document.getElementById('recStartDate').value = r.start_date;
    document.getElementById('recEndDate').value = r.end_date || '';
    document.getElementById('recNextRunDate').value = r.next_run_date;
    document.getElementById('recAutoPost').checked = r.auto_post !== false;

    const modal = new bootstrap.Modal(document.getElementById('recurringModal'));
    modal.show();
  },

  handleSaveRecurring: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveRecurring');
    const recId = document.getElementById('recId').value.trim();

    const payload = {
      recurring_id: recId || undefined,
      title: document.getElementById('recTitle').value.trim(),
      tx_type: document.getElementById('recTxType').value,
      account_id: document.getElementById('recAccount').value,
      to_account_id: document.getElementById('recToAccount').value,
      category_id: document.getElementById('recCategory').value,
      amount: Number(document.getElementById('recAmount').value),
      frequency: document.getElementById('recFrequency').value,
      interval_count: Number(document.getElementById('recIntervalCount').value || 1),
      start_date: document.getElementById('recStartDate').value,
      end_date: document.getElementById('recEndDate').value,
      next_run_date: document.getElementById('recNextRunDate').value,
      auto_post: document.getElementById('recAutoPost').checked
    };

    try {
      btn.disabled = true;
      await PFM_API.call(recId ? 'recurring.update' : 'recurring.create', payload);
      bootstrap.Modal.getInstance(document.getElementById('recurringModal')).hide();
      PFM_APP.showToast('บันทึกรายการประจำสำเร็จ', 'success');
      await this.loadRecurring();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  toggleRuleStatus: async function(recId, nextStatus) {
    try {
      await PFM_API.call('recurring.update', { recurring_id: recId, status: nextStatus });
      PFM_APP.showToast('อัปเดตสถานะรายการประจำแล้ว', 'info');
      await this.loadRecurring();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  processDueNow: async function() {
    const btn = document.getElementById('btnProcessDueRecurring');
    try {
      if (btn) btn.disabled = true;
      const res = await PFM_API.call('recurring.processDue', {
        as_of_date: PFM_UTILS.todayDateString()
      });
      PFM_APP.showToast(
        `รัน Trigger สำเร็จ: สร้างธุรกรรมจริงใหม่ ${res.created_count} รายการ (ป้องกันรายการซ้ำ ${res.skipped_duplicates_count} รายการ)`,
        'success'
      );
      await PFM_ACCOUNTS.loadAccounts();
      await this.loadRecurring();
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      if (btn) btn.disabled = false;
    }
  }
};
