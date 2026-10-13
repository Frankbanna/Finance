/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/budgets.js (Phase 2 - Module D)
 * Description: Manages daily, weekly, monthly, and yearly budgets, rollover settings,
 *              alert threshold badges, and Budget vs Actual Chart.js visualization.
 */

window.PFM_BUDGETS = {
  items: [],
  comparisonChart: null,

  init: function() {
    const form = document.getElementById('budgetModalForm');
    if (form) {
      form.addEventListener('submit', (e) => this.handleSaveBudget(e));
    }
  },

  loadBudgets: async function() {
    try {
      const res = await PFM_API.call('budgets.list', {});
      this.items = res.budgets || [];
      this.renderBudgetsSummary();
      this.renderBudgetsCards();
      this.renderBudgetVsActualChart();
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถโหลดข้อมูลงบประมาณ: ' + err.message, 'danger');
    }
  },

  renderBudgetsSummary: function() {
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';
    let totalLimit = 0;
    let totalSpent = 0;
    let warnCount = 0;

    this.items.forEach(b => {
      totalLimit += Number(b.effective_limit || 0);
      totalSpent += Number(b.spent_amount || 0);
      if (b.alert_status === 'warning' || b.alert_status === 'exceeded') warnCount++;
    });

    const totalRem = totalLimit - totalSpent;
    const pct = totalLimit > 0 ? (totalSpent / totalLimit) * 100 : 0;

    const elLimit = document.getElementById('bdgKpiTotalLimit');
    if (elLimit) elLimit.textContent = PFM_UTILS.formatCurrency(totalLimit, cur);
    const elSpent = document.getElementById('bdgKpiTotalSpent');
    if (elSpent) elSpent.textContent = PFM_UTILS.formatCurrency(totalSpent, cur);
    const elRem = document.getElementById('bdgKpiTotalRemaining');
    if (elRem) {
      elRem.textContent = PFM_UTILS.formatCurrency(totalRem, cur);
      elRem.className = 'kpi-value ' + (totalRem >= 0 ? 'text-success' : 'text-danger');
    }
    const elAlert = document.getElementById('bdgKpiAlertCount');
    if (elAlert) elAlert.textContent = `${warnCount} รายการ (${pct.toFixed(1)}% ใช้ไปรวม)`;
  },

  renderBudgetsCards: function() {
    const container = document.getElementById('budgetsGridContainer');
    if (!container) return;

    if (!this.items || this.items.length === 0) {
      container.innerHTML = `
        <div class="col-12">
          <div class="surface-card text-center py-5">
            <i class="bi bi-pie-chart fs-1 text-primary"></i>
            <h5 class="mt-3">ยังไม่มีการตั้งงบประมาณ</h5>
            <p class="text-muted">ตั้งงบรายวัน รายสัปดาห์ รายเดือน หรือรายปี ทั้งแบบงบรวมและแยกหมวดหมู่เพื่อควบคุมค่าใช้จ่าย</p>
            <button class="btn btn-primary" onclick="PFM_BUDGETS.openCreateModal()">
              <i class="bi bi-plus-lg me-1"></i>สร้างงบประมาณแรก
            </button>
          </div>
        </div>`;
      return;
    }

    const periodLabels = {
      daily: 'รายวัน (Daily)',
      weekly: 'รายสัปดาห์ (Weekly)',
      monthly: 'รายเดือน (Monthly)',
      yearly: 'รายปี (Yearly)'
    };

    container.innerHTML = this.items.map(b => {
      const barColor = b.alert_status === 'exceeded'
        ? 'bg-danger'
        : (b.alert_status === 'warning' ? 'bg-warning' : 'bg-success');

      const statusBadge = b.alert_status === 'exceeded'
        ? `<span class="badge bg-danger"><i class="bi bi-exclamation-octagon me-1"></i>เกินงบ (${b.used_percentage.toFixed(1)}%)</span>`
        : (b.alert_status === 'warning'
          ? `<span class="badge bg-warning text-dark"><i class="bi bi-exclamation-triangle me-1"></i>ใกล้เต็ม (${b.used_percentage.toFixed(1)}%)</span>`
          : `<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>ปกติ (${b.used_percentage.toFixed(1)}%)</span>`);

      const rolloverText = b.rollover_enabled
        ? `<span class="badge bg-info bg-opacity-10 text-info ms-1">ยกยอด: +${PFM_UTILS.formatNumber(b.rollover_amount)}</span>`
        : '';

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="surface-card h-100 d-flex flex-column justify-content-between">
            <div>
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span class="badge bg-secondary bg-opacity-10 text-secondary mb-1">
                    ${PFM_UTILS.escapeHtml(periodLabels[b.period_type] || b.period_type)}
                  </span>
                  ${rolloverText}
                  <h5 class="fw-bold mb-0">${PFM_UTILS.escapeHtml(b.budget_name)}</h5>
                  <div class="small text-muted">หมวดหมู่: ${PFM_UTILS.escapeHtml(b.category_name)}</div>
                </div>
                ${statusBadge}
              </div>

              <div class="my-3">
                <div class="d-flex justify-content-between small mb-1">
                  <span>ใช้ไปจริง: <strong class="text-danger">${PFM_UTILS.formatCurrency(b.spent_amount, b.currency)}</strong></span>
                  <span>วงเงินสุทธิ: <strong>${PFM_UTILS.formatCurrency(b.effective_limit, b.currency)}</strong></span>
                </div>
                <div class="progress" style="height: 10px;">
                  <div class="progress-bar ${barColor}" style="width: ${Math.min(100, b.used_percentage)}%"></div>
                </div>
                <div class="d-flex justify-content-between small mt-2">
                  <span class="text-muted">รอบคำนวณ: ${PFM_UTILS.escapeHtml(b.period_window.start_date)} ถึง ${PFM_UTILS.escapeHtml(b.period_window.end_date)}</span>
                  <span class="fw-semibold ${b.remaining_amount >= 0 ? 'text-success' : 'text-danger'}">
                    คงเหลือ: ${PFM_UTILS.formatCurrency(b.remaining_amount, b.currency)}
                  </span>
                </div>
              </div>
            </div>

            <div class="pt-2 border-top d-flex justify-content-between align-items-center">
              <span class="small text-muted">แจ้งเตือนเมื่อถึง ${b.alert_threshold_pct}%</span>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" onclick="PFM_BUDGETS.openEditModal('${PFM_UTILS.escapeHtml(b.budget_id)}')">
                  <i class="bi bi-pencil me-1"></i>แก้ไข
                </button>
                <button class="btn btn-outline-danger" onclick="PFM_BUDGETS.deleteBudget('${PFM_UTILS.escapeHtml(b.budget_id)}')">
                  <i class="bi bi-trash"></i>
                </button>
              </div>
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderBudgetVsActualChart: function() {
    const ctx = document.getElementById('chartBudgetVsActual');
    if (!ctx || !window.Chart) return;
    if (this.comparisonChart) this.comparisonChart.destroy();

    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#CBD5E1' : '#475569';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';

    const labels = this.items.map(b => b.budget_name);
    const limits = this.items.map(b => b.effective_limit);
    const actuals = this.items.map(b => b.spent_amount);

    this.comparisonChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels.length ? labels : ['ยังไม่มีงบประมาณ'],
        datasets: [
          {
            label: 'งบประมาณที่ตั้งไว้ (Budget Limit)',
            data: limits.length ? limits : [0],
            backgroundColor: 'rgba(37, 99, 235, 0.75)',
            borderRadius: 6
          },
          {
            label: 'รายจ่ายจริง (Actual Spent)',
            data: actuals.length ? actuals : [0],
            backgroundColor: 'rgba(239, 68, 68, 0.82)',
            borderRadius: 6
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { labels: { color: textColor } } },
        scales: {
          x: { ticks: { color: textColor }, grid: { color: gridColor } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        }
      }
    });
  },

  populateCategorySelect: function(selectedVal) {
    const sel = document.getElementById('bdgCategory');
    if (!sel) return;
    const expCats = (PFM_APP.categories || []).filter(c => c.category_type === 'expense');
    sel.innerHTML = `<option value="ALL">🌟 งบรวมทุกหมวดหมู่ (Overall Budget)</option>` +
      expCats.map(c => `<option value="${PFM_UTILS.escapeHtml(c.category_id)}">${c.parent_id ? '↳ ' : ''}${PFM_UTILS.escapeHtml(c.category_name)}</option>`).join('');
    if (selectedVal) sel.value = selectedVal;
  },

  openCreateModal: function() {
    document.getElementById('budgetModalTitle').textContent = 'ตั้งงบประมาณใหม่ (Create Budget)';
    document.getElementById('bdgId').value = '';
    document.getElementById('bdgName').value = '';
    document.getElementById('bdgPeriodType').value = 'monthly';
    this.populateCategorySelect('ALL');
    document.getElementById('bdgAmountLimit').value = '';
    document.getElementById('bdgAlertThreshold').value = '80';
    document.getElementById('bdgRolloverEnabled').checked = false;
    document.getElementById('bdgRolloverAmount').value = '0';

    const modal = new bootstrap.Modal(document.getElementById('budgetModal'));
    modal.show();
  },

  openEditModal: function(budgetId) {
    const b = this.items.find(x => x.budget_id === budgetId);
    if (!b) return;

    document.getElementById('budgetModalTitle').textContent = 'แก้ไขงบประมาณ: ' + b.budget_name;
    document.getElementById('bdgId').value = b.budget_id;
    document.getElementById('bdgName').value = b.budget_name;
    document.getElementById('bdgPeriodType').value = b.period_type;
    this.populateCategorySelect(b.category_id);
    document.getElementById('bdgAmountLimit').value = b.amount_limit;
    document.getElementById('bdgAlertThreshold').value = b.alert_threshold_pct;
    document.getElementById('bdgRolloverEnabled').checked = b.rollover_enabled;
    document.getElementById('bdgRolloverAmount').value = b.rollover_amount || 0;

    const modal = new bootstrap.Modal(document.getElementById('budgetModal'));
    modal.show();
  },

  handleSaveBudget: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveBudget');
    const bdgId = document.getElementById('bdgId').value.trim();

    const payload = {
      budget_id: bdgId || undefined,
      budget_name: document.getElementById('bdgName').value.trim(),
      period_type: document.getElementById('bdgPeriodType').value,
      category_id: document.getElementById('bdgCategory').value,
      amount_limit: Number(document.getElementById('bdgAmountLimit').value),
      alert_threshold_pct: Number(document.getElementById('bdgAlertThreshold').value || 80),
      rollover_enabled: document.getElementById('bdgRolloverEnabled').checked,
      rollover_amount: Number(document.getElementById('bdgRolloverAmount').value || 0)
    };

    try {
      btn.disabled = true;
      await PFM_API.call(bdgId ? 'budgets.update' : 'budgets.create', payload);
      bootstrap.Modal.getInstance(document.getElementById('budgetModal')).hide();
      PFM_APP.showToast('บันทึกงบประมาณเรียบร้อยแล้ว', 'success');
      await this.loadBudgets();
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  deleteBudget: async function(budgetId) {
    if (!confirm('ยืนยันการลบงบประมาณรายการนี้?')) return;
    try {
      await PFM_API.call('budgets.delete', { budget_id: budgetId });
      PFM_APP.showToast('ลบงบประมาณเรียบร้อยแล้ว', 'info');
      await this.loadBudgets();
      await PFM_DASHBOARD.loadDashboard();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  }
};
