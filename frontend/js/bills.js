/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/bills.js (Phase 3 — Module G: Bills & Reminders + Module I: Import History + Notifications)
 * Description: Manages bills CRUD, bill payment posting (with auto-generation of next recurring bill),
 *              statement import history viewer, CSV exports, and the Smart Notifications center.
 */

window.PFM_BILLS = {
  billsData: null,
  importHistory: [],

  init: function() {
    const billForm = document.getElementById('billModalForm');
    if (billForm) {
      billForm.addEventListener('submit', (e) => this.handleSaveBill(e));
    }

    const billPayForm = document.getElementById('billPayModalForm');
    if (billPayForm) {
      billPayForm.addEventListener('submit', (e) => this.handleSubmitBillPay(e));
    }

    const recCheck = document.getElementById('bilIsRecurring');
    if (recCheck) {
      recCheck.addEventListener('change', (e) => {
        const grp = document.getElementById('bilFrequencyGroup');
        if (grp) grp.classList.toggle('d-none', !e.target.checked);
      });
    }
  },

  loadBillsAndImports: async function() {
    try {
      const statusFilterEl = document.getElementById('bilFilterStatus');
      const statusVal = statusFilterEl ? statusFilterEl.value : '';
      const [billsRes, impRes] = await Promise.all([
        PFM_API.call('bills.list', { status: statusVal }),
        PFM_API.call('imports.list', {})
      ]);
      this.billsData = billsRes;
      this.importHistory = impRes.imports || [];
      this.renderBillsView();
      this.renderImportHistoryTable();
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถโหลดข้อมูลบิลและประวัติการนำเข้า: ' + err.message, 'danger');
    }
  },

  renderBillsView: function() {
    if (!this.billsData) return;
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';
    const sum = this.billsData.summary || {};

    const elOverdue = document.getElementById('bilKpiOverdue');
    if (elOverdue) elOverdue.textContent = `${PFM_UTILS.formatCurrency(sum.overdue_total || 0, cur)} (${sum.overdue_count || 0} บิล)`;

    const elDueSoon = document.getElementById('bilKpiDueSoon');
    if (elDueSoon) elDueSoon.textContent = `${PFM_UTILS.formatCurrency(sum.due_soon_total || 0, cur)} (${sum.due_soon_count || 0} บิล)`;

    const elUnpaid = document.getElementById('bilKpiUnpaidTotal');
    if (elUnpaid) elUnpaid.textContent = PFM_UTILS.formatCurrency(sum.unpaid_total || 0, cur);

    const elPaidMonth = document.getElementById('bilKpiPaidMonth');
    if (elPaidMonth) elPaidMonth.textContent = PFM_UTILS.formatCurrency(sum.paid_this_month_total || 0, cur);

    const tbody = document.getElementById('billsTableBody');
    if (!tbody) return;

    const bills = this.billsData.bills || [];
    if (!bills.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-4">ไม่พบรายการบิลตามตัวกรอง กดปุ่ม "เพิ่มบิลแจ้งเตือนใหม่" เพื่อเริ่มต้น</td></tr>`;
      return;
    }

    const freqMap = {
      once: 'ครั้งเดียว',
      weekly: 'รายสัปดาห์',
      monthly: 'รายเดือน',
      quarterly: 'รายไตรมาส',
      yearly: 'รายปี'
    };

    tbody.innerHTML = bills.map(b => {
      let badgeHtml = '';
      if (b.effective_status === 'overdue') {
        badgeHtml = `<span class="badge bg-danger">เกินกำหนด (${Math.abs(b.days_until_due)} วัน)</span>`;
      } else if (b.effective_status === 'paid') {
        badgeHtml = `<span class="badge bg-success">ชำระแล้ว</span>`;
      } else if (b.is_due_soon) {
        badgeHtml = `<span class="badge bg-warning text-dark">ใกล้ครบกำหนด (อีก ${b.days_until_due} วัน)</span>`;
      } else {
        badgeHtml = `<span class="badge bg-secondary">รอชำระ (อีก ${b.days_until_due} วัน)</span>`;
      }

      return `
        <tr>
          <td>
            <div class="fw-bold">${PFM_UTILS.escapeHtml(b.bill_name)}</div>
            <div class="small text-muted">${PFM_UTILS.escapeHtml(b.notes || '-')}</div>
          </td>
          <td><span class="badge bg-light text-dark border">${PFM_UTILS.escapeHtml(b.category_name)}</span></td>
          <td>
            <div class="fw-semibold">${PFM_UTILS.escapeHtml(b.due_date)}</div>
            <div class="small text-muted">เตือนล่วงหน้า ${b.remind_days_before} วัน</div>
          </td>
          <td>
            ${b.is_recurring
              ? `<span class="badge bg-info text-dark"><i class="bi bi-arrow-repeat me-1"></i>${PFM_UTILS.escapeHtml(freqMap[b.frequency] || b.frequency)}</span>`
              : `<span class="small text-muted">ครั้งเดียว</span>`}
          </td>
          <td class="text-end fw-bold">${PFM_UTILS.formatCurrency(b.amount, b.currency)}</td>
          <td>${badgeHtml}</td>
          <td class="text-end">
            <div class="btn-group btn-group-sm">
              ${b.effective_status !== 'paid' ? `
                <button class="btn btn-success" onclick="PFM_BILLS.openPayModal('${PFM_UTILS.escapeHtml(b.bill_id)}')">
                  <i class="bi bi-check2-circle me-1"></i>ชำระบิล
                </button>
              ` : `
                <span class="small text-success me-2"><i class="bi bi-check-all"></i> ${PFM_UTILS.escapeHtml(b.paid_transaction_id)}</span>
              `}
              <button class="btn btn-outline-secondary" title="แก้ไขบิล" onclick="PFM_BILLS.openEditModal('${PFM_UTILS.escapeHtml(b.bill_id)}')">
                <i class="bi bi-pencil"></i>
              </button>
            </div>
          </td>
        </tr>
      `;
    }).join('');
  },

  renderImportHistoryTable: function() {
    const tbody = document.getElementById('importHistoryTableBody');
    if (!tbody) return;

    if (!this.importHistory.length) {
      tbody.innerHTML = `<tr><td colspan="7" class="text-center text-muted py-3">ยังไม่มีประวัติการนำเข้าไฟล์ CSV</td></tr>`;
      return;
    }

    tbody.innerHTML = this.importHistory.map(imp => `
      <tr>
        <td class="small text-muted">${PFM_UTILS.escapeHtml(imp.created_at)}</td>
        <td class="fw-semibold"><i class="bi bi-file-earmark-spreadsheet text-success me-1"></i>${PFM_UTILS.escapeHtml(imp.file_name)}</td>
        <td>${PFM_UTILS.escapeHtml(imp.account_name)}</td>
        <td class="text-center">${imp.total_rows}</td>
        <td class="text-center text-success fw-bold">${imp.imported_rows}</td>
        <td class="text-center text-warning fw-semibold">${imp.skipped_duplicates}</td>
        <td><span class="badge bg-success">${PFM_UTILS.escapeHtml(imp.status)}</span></td>
      </tr>
    `).join('');
  },

  openCreateModal: function() {
    document.getElementById('billModalTitle').textContent = 'เพิ่มบิลแจ้งเตือนวันครบกำหนดชำระ';
    document.getElementById('bilId').value = '';
    document.getElementById('bilName').value = '';
    document.getElementById('bilAmount').value = '';
    document.getElementById('bilDueDate').value = PFM_UTILS.todayDateString();
    document.getElementById('bilRemindDays').value = '3';
    document.getElementById('bilIsRecurring').checked = true;
    document.getElementById('bilFrequencyGroup').classList.remove('d-none');
    document.getElementById('bilFrequency').value = 'monthly';
    document.getElementById('bilNotes').value = '';

    this.populateBillCategorySelect('cat_exp_utilities');
    bootstrap.Modal.getOrCreateInstance(document.getElementById('billModal')).show();
  },

  openEditModal: function(billId) {
    const b = (this.billsData && this.billsData.bills || []).find(x => x.bill_id === billId);
    if (!b) return;

    document.getElementById('billModalTitle').textContent = 'แก้ไขบิลแจ้งเตือน: ' + b.bill_name;
    document.getElementById('bilId').value = b.bill_id;
    document.getElementById('bilName').value = b.bill_name;
    document.getElementById('bilAmount').value = b.amount;
    document.getElementById('bilDueDate').value = b.due_date;
    document.getElementById('bilRemindDays').value = b.remind_days_before;
    document.getElementById('bilIsRecurring').checked = Boolean(b.is_recurring);
    document.getElementById('bilFrequencyGroup').classList.toggle('d-none', !b.is_recurring);
    document.getElementById('bilFrequency').value = b.frequency || 'monthly';
    document.getElementById('bilNotes').value = b.notes || '';

    this.populateBillCategorySelect(b.category_id);
    bootstrap.Modal.getOrCreateInstance(document.getElementById('billModal')).show();
  },

  populateBillCategorySelect: function(selectedId) {
    const sel = document.getElementById('bilCategory');
    if (!sel) return;
    const expCats = (PFM_APP.categories || []).filter(c => c.category_type === 'expense');
    sel.innerHTML = expCats.map(c =>
      `<option value="${PFM_UTILS.escapeHtml(c.category_id)}">${PFM_UTILS.escapeHtml(c.category_name)}</option>`
    ).join('');
    if (selectedId) sel.value = selectedId;
  },

  handleSaveBill: async function(e) {
    e.preventDefault();
    const billId = document.getElementById('bilId').value.trim();
    const isRec = document.getElementById('bilIsRecurring').checked;
    const payload = {
      bill_name: document.getElementById('bilName').value.trim(),
      category_id: document.getElementById('bilCategory').value,
      amount: Number(document.getElementById('bilAmount').value),
      due_date: document.getElementById('bilDueDate').value,
      remind_days_before: Number(document.getElementById('bilRemindDays').value || 3),
      is_recurring: isRec,
      frequency: isRec ? document.getElementById('bilFrequency').value : 'once',
      notes: document.getElementById('bilNotes').value.trim()
    };

    try {
      if (billId) {
        payload.bill_id = billId;
        await PFM_API.call('bills.update', payload);
        PFM_APP.showToast('แก้ไขข้อมูลบิลสำเร็จ', 'success');
      } else {
        await PFM_API.call('bills.create', payload);
        PFM_APP.showToast('บันทึกบิลแจ้งเตือนลงใน Google Sheets สำเร็จ', 'success');
      }
      bootstrap.Modal.getInstance(document.getElementById('billModal')).hide();
      await this.loadBillsAndImports();
      if (window.PFM_NOTIFICATIONS) PFM_NOTIFICATIONS.loadNotifications();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  openPayModal: function(billId) {
    const b = (this.billsData && this.billsData.bills || []).find(x => x.bill_id === billId);
    if (!b) return;

    document.getElementById('bpayBillId').value = b.bill_id;
    document.getElementById('bpayBillName').textContent = `${b.bill_name} (ครบกำหนด ${b.due_date})`;
    document.getElementById('bpayAmount').value = b.amount;
    document.getElementById('bpayDate').value = PFM_UTILS.todayDateString();

    const accSel = document.getElementById('bpayAccount');
    const activeAccs = (PFM_APP.accounts || []).filter(a => !a.is_archived);
    if (accSel) {
      accSel.innerHTML = activeAccs.map(a =>
        `<option value="${PFM_UTILS.escapeHtml(a.account_id)}">${PFM_UTILS.escapeHtml(a.account_name)} (คงเหลือ ${PFM_UTILS.formatCurrency(a.current_balance, a.currency)})</option>`
      ).join('');
    }

    bootstrap.Modal.getOrCreateInstance(document.getElementById('billPayModal')).show();
  },

  handleSubmitBillPay: async function(e) {
    e.preventDefault();
    const payload = {
      bill_id: document.getElementById('bpayBillId').value,
      account_id: document.getElementById('bpayAccount').value,
      payment_date: document.getElementById('bpayDate').value,
      amount: Number(document.getElementById('bpayAmount').value)
    };

    try {
      const res = await PFM_API.call('bills.pay', payload);
      bootstrap.Modal.getInstance(document.getElementById('billPayModal')).hide();
      const nextMsg = res.next_recurring_bill
        ? ` และสร้างบิลงวดถัดไป (${res.next_recurring_bill.due_date}) อัตโนมัติ`
        : '';
      PFM_APP.showToast('บันทึกการชำระบิลสำเร็จ' + nextMsg, 'success');
      await PFM_ACCOUNTS.loadAccounts();
      await this.loadBillsAndImports();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  exportBillsCsv: function() {
    const bills = (this.billsData && this.billsData.bills) || [];
    if (!bills.length) {
      PFM_APP.showToast('ไม่มีข้อมูลบิลสำหรับส่งออก CSV', 'warning');
      return;
    }
    const headers = ['bill_id', 'bill_name', 'category_name', 'amount', 'currency', 'due_date', 'effective_status', 'is_recurring', 'frequency', 'paid_transaction_id'];
    const rows = [headers.join(',')];
    bills.forEach(b => {
      rows.push([
        b.bill_id,
        `"${String(b.bill_name || '').replace(/"/g, '""')}"`,
        `"${String(b.category_name || '').replace(/"/g, '""')}"`,
        b.amount,
        b.currency,
        b.due_date,
        b.effective_status,
        b.is_recurring,
        b.frequency,
        b.paid_transaction_id || ''
      ].join(','));
    });
    const blob = new Blob(['\uFEFF' + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pfm_bills_${PFM_UTILS.todayDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    PFM_APP.showToast('ส่งออกไฟล์ CSV รายการบิลสำเร็จ', 'success');
  }
};

/**
 * Smart Notifications & Alert Center (Phase 3)
 */
window.PFM_NOTIFICATIONS = {
  notifState: { unread_count: 0, notifications: [] },

  init: function() {},

  loadNotifications: async function() {
    try {
      const res = await PFM_API.call('notifications.list', {});
      this.notifState = res;
      this.updateTopbarBadge();
      this.renderNotificationsView();
    } catch (e) {
      // Ignore silent load errors
    }
  },

  generateSmartAlerts: async function() {
    try {
      const btn = document.getElementById('btnGenerateAlerts');
      if (btn) btn.disabled = true;
      const res = await PFM_API.call('notifications.generateAlerts', {});
      this.notifState = {
        unread_count: res.unread_count,
        notifications: res.notifications || []
      };
      this.updateTopbarBadge();
      this.renderNotificationsView();
      PFM_APP.showToast(`สแกนฐานข้อมูลเสร็จสิ้น: สร้างแจ้งเตือนใหม่ ${res.generated_count || 0} รายการ`, 'info');
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถสร้างแจ้งเตือนอัตโนมัติ: ' + err.message, 'danger');
    } finally {
      const btn = document.getElementById('btnGenerateAlerts');
      if (btn) btn.disabled = false;
    }
  },

  markAsRead: async function(notificationId, markAll) {
    try {
      const res = await PFM_API.call('notifications.markRead', {
        notification_id: notificationId || '',
        mark_all: Boolean(markAll)
      });
      if (res.notifications_state) {
        this.notifState = res.notifications_state;
      }
      this.updateTopbarBadge();
      this.renderNotificationsView();
    } catch (err) {
      PFM_APP.showToast(err.message, 'danger');
    }
  },

  updateTopbarBadge: function() {
    const count = Number((this.notifState && this.notifState.unread_count) || 0);
    const badge = document.getElementById('topbarNotifBadge');
    const sideBadge = document.getElementById('sidebarNotifBadge');
    if (badge) {
      badge.textContent = count > 99 ? '99+' : String(count);
      badge.classList.toggle('d-none', count <= 0);
    }
    if (sideBadge) {
      sideBadge.textContent = String(count);
      sideBadge.classList.toggle('d-none', count <= 0);
    }
  },

  renderNotificationsView: function() {
    const container = document.getElementById('notificationsListContainer');
    if (!container) return;

    const list = (this.notifState && this.notifState.notifications) || [];
    if (!list.length) {
      container.innerHTML = `
        <div class="text-center text-muted py-5">
          <i class="bi bi-bell-slash fs-1 d-block mb-2"></i>
          <div>ยังไม่มีรายการแจ้งเตือน กดปุ่ม "สแกนตรวจจับการแจ้งเตือนจากข้อมูลจริง" ด้านบนเพื่อตรวจสอบบิล งบประมาณ และหนี้สิน</div>
        </div>
      `;
      return;
    }

    const sevIcon = {
      danger: 'bi-exclamation-octagon-fill text-danger',
      warning: 'bi-exclamation-triangle-fill text-warning',
      info: 'bi-info-circle-fill text-primary',
      success: 'bi-check-circle-fill text-success'
    };

    container.innerHTML = list.map(n => `
      <div class="p-3 border rounded mb-2 d-flex justify-content-between align-items-start gap-3 ${n.is_read ? 'opacity-75' : 'border-primary bg-primary bg-opacity-10'}">
        <div class="d-flex gap-3 align-items-start">
          <i class="bi ${sevIcon[n.severity] || sevIcon.info} fs-4 mt-1"></i>
          <div>
            <div class="d-flex align-items-center gap-2">
              <span class="fw-bold">${PFM_UTILS.escapeHtml(n.title)}</span>
              ${!n.is_read ? '<span class="badge bg-primary">ใหม่</span>' : '<span class="badge bg-secondary">อ่านแล้ว</span>'}
              <span class="badge bg-light text-dark border">${PFM_UTILS.escapeHtml(n.notif_type)}</span>
            </div>
            <div class="small mt-1">${PFM_UTILS.escapeHtml(n.message)}</div>
            <div class="small text-muted mt-1"><i class="bi bi-clock me-1"></i>${PFM_UTILS.escapeHtml(n.created_at)}</div>
          </div>
        </div>
        <div>
          ${!n.is_read ? `
            <button class="btn btn-sm btn-outline-primary" onclick="PFM_NOTIFICATIONS.markAsRead('${PFM_UTILS.escapeHtml(n.notification_id)}', false)">
              <i class="bi bi-check2 me-1"></i>ทำเครื่องหมายว่าอ่านแล้ว
            </button>
          ` : ''}
        </div>
      </div>
    `).join('');
  }
};

