/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/goals.js (Phase 2 - Module E)
 * Description: Manages multiple Savings Goals, required monthly savings calculation,
 *              estimated completion date, and deposit/withdraw contribution history.
 */

window.PFM_GOALS = {
  items: [],

  init: function() {
    const goalForm = document.getElementById('goalModalForm');
    if (goalForm) {
      goalForm.addEventListener('submit', (e) => this.handleSaveGoal(e));
    }

    const contribForm = document.getElementById('goalContributeModalForm');
    if (contribForm) {
      contribForm.addEventListener('submit', (e) => this.handleContributeSubmit(e));
    }
  },

  loadGoals: async function() {
    try {
      const res = await PFM_API.call('goals.list', {});
      this.items = res.goals || [];
      this.renderGoalsSummary();
      this.renderGoalsCards();
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถโหลดเป้าหมายการออม: ' + err.message, 'danger');
    }
  },

  renderGoalsSummary: function() {
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';
    let totalTarget = 0;
    let totalSaved = 0;
    let totalMonthlyReq = 0;
    let completedCount = 0;

    this.items.forEach(g => {
      totalTarget += Number(g.target_amount || 0);
      totalSaved += Number(g.current_amount || 0);
      totalMonthlyReq += Number(g.required_monthly_saving || 0);
      if (g.progress_pct >= 100 || g.status === 'completed') completedCount++;
    });

    const elTarget = document.getElementById('golKpiTotalTarget');
    if (elTarget) elTarget.textContent = PFM_UTILS.formatCurrency(totalTarget, cur);
    const elSaved = document.getElementById('golKpiTotalSaved');
    if (elSaved) elSaved.textContent = PFM_UTILS.formatCurrency(totalSaved, cur);
    const elMonthly = document.getElementById('golKpiMonthlyReq');
    if (elMonthly) elMonthly.textContent = PFM_UTILS.formatCurrency(totalMonthlyReq, cur) + ' / เดือน';
    const elCompleted = document.getElementById('golKpiCompletedCount');
    if (elCompleted) elCompleted.textContent = `${completedCount} / ${this.items.length} เป้าหมาย`;
  },

  renderGoalsCards: function() {
    const container = document.getElementById('goalsGridContainer');
    if (!container) return;

    if (!this.items || this.items.length === 0) {
      container.innerHTML = `
        <div class="col-12">
          <div class="surface-card text-center py-5">
            <i class="bi bi-piggy-bank fs-1 text-success"></i>
            <h5 class="mt-3">ยังไม่มีเป้าหมายการออม</h5>
            <p class="text-muted">ตั้งเป้าหมายการออม เช่น เงินสำรองฉุกเฉิน ดาวน์บ้าน ท่องเที่ยว พร้อมคำนวณยอดที่ต้องออมต่อเดือนอัตโนมัติ</p>
            <button class="btn btn-primary" onclick="PFM_GOALS.openCreateModal()">
              <i class="bi bi-plus-lg me-1"></i>สร้างเป้าหมายการออมแรก
            </button>
          </div>
        </div>`;
      return;
    }

    container.innerHTML = this.items.map(g => {
      const healthBadges = {
        completed: '<span class="badge bg-success"><i class="bi bi-trophy me-1"></i>บรรลุเป้าหมายแล้ว!</span>',
        on_track: '<span class="badge bg-primary"><i class="bi bi-check2-circle me-1"></i>อยู่ในแผน (On Track)</span>',
        at_risk: '<span class="badge bg-danger"><i class="bi bi-exclamation-triangle me-1"></i>เสี่ยงล่าช้ากว่ากำหนด</span>',
        needs_contribution: '<span class="badge bg-warning text-dark">รอเริ่มสะสมเงินออม</span>'
      };
      const badge = healthBadges[g.health_status] || healthBadges.on_track;
      const estText = g.estimated_completion_date
        ? `คาดว่าจะบรรลุ: <strong>${PFM_UTILS.escapeHtml(g.estimated_completion_date)}</strong>`
        : 'เพิ่มรายการออมเพื่อคำนวณวันบรรลุเป้าหมาย';

      return `
        <div class="col-12 col-md-6 col-xl-4">
          <div class="surface-card account-card h-100 d-flex flex-column justify-content-between" style="border-left-color: ${PFM_UTILS.escapeHtml(g.color || '#10B981')}">
            <div>
              <div class="d-flex justify-content-between align-items-start mb-2">
                <div>
                  <span class="badge bg-secondary bg-opacity-10 text-secondary mb-1">ระดับความสำคัญ: ${PFM_UTILS.escapeHtml(g.priority.toUpperCase())}</span>
                  <h5 class="fw-bold mb-0">${PFM_UTILS.escapeHtml(g.goal_name)}</h5>
                  <div class="small text-muted">เป้าหมายวันที่: ${PFM_UTILS.escapeHtml(g.target_date)} (อีก ${g.days_remaining} วัน)</div>
                </div>
                ${badge}
              </div>

              <div class="my-3">
                <div class="d-flex justify-content-between small mb-1">
                  <span>ออมแล้ว: <strong class="text-success">${PFM_UTILS.formatCurrency(g.current_amount, g.currency)}</strong></span>
                  <span>เป้าหมาย: <strong>${PFM_UTILS.formatCurrency(g.target_amount, g.currency)}</strong></span>
                </div>
                <div class="progress" style="height: 10px;">
                  <div class="progress-bar bg-success" style="width: ${Math.min(100, g.progress_pct)}%"></div>
                </div>
                <div class="d-flex justify-content-between small mt-2">
                  <span>ความคืบหน้า: <strong>${g.progress_pct.toFixed(1)}%</strong></span>
                  <span>ขาดอีก: <strong>${PFM_UTILS.formatCurrency(g.remaining_amount, g.currency)}</strong></span>
                </div>
              </div>

              <div class="p-2 rounded bg-body-tertiary small mb-3">
                <div><i class="bi bi-calculator me-1 text-primary"></i>ต้องออมต่อเดือน: <strong class="text-primary">${PFM_UTILS.formatCurrency(g.required_monthly_saving, g.currency)}/เดือน</strong></div>
                <div class="mt-1"><i class="bi bi-calendar-range me-1 text-success"></i>${estText}</div>
              </div>
            </div>

            <div class="pt-2 border-top d-flex flex-wrap justify-content-between align-items-center gap-2">
              <div class="btn-group btn-group-sm">
                <button class="btn btn-success" onclick="PFM_GOALS.openContributeModal('${PFM_UTILS.escapeHtml(g.goal_id)}', 'deposit')">
                  <i class="bi bi-plus-circle me-1"></i>เติมเงินออม
                </button>
                <button class="btn btn-outline-warning" onclick="PFM_GOALS.openContributeModal('${PFM_UTILS.escapeHtml(g.goal_id)}', 'withdraw')">
                  ถอนเงิน
                </button>
              </div>
              <div class="btn-group btn-group-sm">
                <button class="btn btn-outline-secondary" onclick="PFM_GOALS.openHistoryModal('${PFM_UTILS.escapeHtml(g.goal_id)}')" title="ประวัติการเติม/ถอน">
                  <i class="bi bi-clock-history"></i>
                </button>
                <button class="btn btn-outline-secondary" onclick="PFM_GOALS.openEditModal('${PFM_UTILS.escapeHtml(g.goal_id)}')" title="แก้ไขเป้าหมาย">
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
    document.getElementById('goalModalTitle').textContent = 'สร้างเป้าหมายการออมใหม่ (New Savings Goal)';
    document.getElementById('golId').value = '';
    document.getElementById('golName').value = '';
    document.getElementById('golTargetAmount').value = '';
    document.getElementById('golInitialAmount').value = '0';
    document.getElementById('golInitialAmountGroup').classList.remove('d-none');

    // Default target date: 6 months from today
    const sixMonths = new Date(Date.now() + 180 * 86400000);
    document.getElementById('golTargetDate').value = sixMonths.toISOString().substring(0, 10);
    document.getElementById('golPriority').value = 'high';
    document.getElementById('golColor').value = '#10B981';
    document.getElementById('golNotes').value = '';

    const modal = new bootstrap.Modal(document.getElementById('goalModal'));
    modal.show();
  },

  openEditModal: function(goalId) {
    const g = this.items.find(x => x.goal_id === goalId);
    if (!g) return;

    document.getElementById('goalModalTitle').textContent = 'แก้ไขเป้าหมาย: ' + g.goal_name;
    document.getElementById('golId').value = g.goal_id;
    document.getElementById('golName').value = g.goal_name;
    document.getElementById('golTargetAmount').value = g.target_amount;
    document.getElementById('golInitialAmountGroup').classList.add('d-none');
    document.getElementById('golTargetDate').value = g.target_date;
    document.getElementById('golPriority').value = g.priority || 'medium';
    document.getElementById('golColor').value = g.color || '#10B981';
    document.getElementById('golNotes').value = g.notes || '';

    const modal = new bootstrap.Modal(document.getElementById('goalModal'));
    modal.show();
  },

  handleSaveGoal: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSaveGoal');
    const golId = document.getElementById('golId').value.trim();

    const payload = {
      goal_id: golId || undefined,
      goal_name: document.getElementById('golName').value.trim(),
      target_amount: Number(document.getElementById('golTargetAmount').value),
      initial_amount: golId ? undefined : Number(document.getElementById('golInitialAmount').value || 0),
      target_date: document.getElementById('golTargetDate').value,
      priority: document.getElementById('golPriority').value,
      color: document.getElementById('golColor').value,
      notes: document.getElementById('golNotes').value.trim()
    };

    try {
      btn.disabled = true;
      await PFM_API.call(golId ? 'goals.update' : 'goals.create', payload);
      bootstrap.Modal.getInstance(document.getElementById('goalModal')).hide();
      PFM_APP.showToast('บันทึกเป้าหมายการออมสำเร็จ', 'success');
      await this.loadGoals();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  openContributeModal: function(goalId, entryType) {
    const g = this.items.find(x => x.goal_id === goalId);
    if (!g) return;

    document.getElementById('contribGoalId').value = g.goal_id;
    document.getElementById('contribEntryType').value = entryType || 'deposit';
    document.getElementById('contribGoalTitle').textContent = `${g.goal_name} (ออมแล้ว: ${PFM_UTILS.formatCurrency(g.current_amount, g.currency)})`;
    document.getElementById('contribDate').value = PFM_UTILS.todayDateString();
    document.getElementById('contribAmount').value = '';
    document.getElementById('contribNote').value = entryType === 'withdraw' ? 'ถอนเงินออมฉุกเฉิน' : 'เติมเงินออมประจำเดือน';

    const modal = new bootstrap.Modal(document.getElementById('goalContributeModal'));
    modal.show();
  },

  handleContributeSubmit: async function(e) {
    e.preventDefault();
    const btn = document.getElementById('btnSubmitContribute');
    const goalId = document.getElementById('contribGoalId').value;
    const entryType = document.getElementById('contribEntryType').value;
    const txDate = document.getElementById('contribDate').value;
    const amount = Number(document.getElementById('contribAmount').value);
    const note = document.getElementById('contribNote').value.trim();

    try {
      btn.disabled = true;
      await PFM_API.call('goals.contribute', {
        goal_id: goalId,
        entry_type: entryType,
        tx_date: txDate,
        amount: amount,
        note: note
      });
      bootstrap.Modal.getInstance(document.getElementById('goalContributeModal')).hide();
      PFM_APP.showToast(entryType === 'deposit' ? 'บันทึกการเติมเงินออมสำเร็จ!' : 'บันทึกการถอนเงินออมสำเร็จ', 'success');
      await this.loadGoals();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    } finally {
      btn.disabled = false;
    }
  },

  openHistoryModal: function(goalId) {
    const g = this.items.find(x => x.goal_id === goalId);
    if (!g) return;

    document.getElementById('goalHistoryModalTitle').textContent = 'ประวัติการเติม/ถอนเงินออม: ' + g.goal_name;
    const tbody = document.getElementById('goalHistoryTableBody');
    const list = g.recent_contributions || [];

    if (list.length === 0) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-4">ยังไม่มีประวัติการเติมหรือถอนเงิน</td></tr>';
    } else {
      tbody.innerHTML = list.map(c => {
        const isDep = c.entry_type === 'deposit';
        return `
          <tr>
            <td class="small">${PFM_UTILS.escapeHtml(c.tx_date)}</td>
            <td><span class="badge ${isDep ? 'bg-success' : 'bg-warning text-dark'}">${isDep ? 'เติมเงินออม (Deposit)' : 'ถอนเงินออม (Withdraw)'}</span></td>
            <td>${PFM_UTILS.escapeHtml(c.note || '-')}</td>
            <td class="text-end fw-bold ${isDep ? 'text-success' : 'text-danger'}">${isDep ? '+' : '-'}${PFM_UTILS.formatCurrency(c.amount, g.currency)}</td>
          </tr>
        `;
      }).join('');
    }

    const modal = new bootstrap.Modal(document.getElementById('goalHistoryModal'));
    modal.show();
  }
};
