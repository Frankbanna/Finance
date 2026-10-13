/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/app.js
 * Description: Main application controller, navigation router, theme switcher,
 *              category management, backup/restore, and audit log viewer.
 */

window.PFM_APP = {
  currentUser: null,
  accounts: [],
  categories: [],
  activeView: 'dashboard',

  init: async function() {
    this.initTheme();
    if (window.PFM_OFFLINE) PFM_OFFLINE.init();
    PFM_AUTH.init();
    PFM_DASHBOARD.init();
    PFM_ACCOUNTS.init();
    PFM_TRANSACTIONS.init();
    if (window.PFM_BUDGETS) PFM_BUDGETS.init();
    if (window.PFM_GOALS) PFM_GOALS.init();
    if (window.PFM_RECURRING) PFM_RECURRING.init();
    if (window.PFM_REPORTS) PFM_REPORTS.init();
    if (window.PFM_DEBTS) PFM_DEBTS.init();
    if (window.PFM_BILLS) PFM_BILLS.init();
    if (window.PFM_NOTIFICATIONS) PFM_NOTIFICATIONS.init();
    if (window.PFM_AUTOMATION) PFM_AUTOMATION.init();

    const catForm = document.getElementById('categoryCreateForm');
    if (catForm) {
      catForm.addEventListener('submit', (e) => this.handleCreateCategory(e));
    }

    const apiForm = document.getElementById('apiEndpointForm');
    if (apiForm) {
      apiForm.addEventListener('submit', (e) => this.handleSaveApiEndpoint(e));
    }

    const restoreInput = document.getElementById('backupRestoreInput');
    if (restoreInput) {
      restoreInput.addEventListener('change', (e) => this.handleRestoreBackupFile(e));
    }

    document.getElementById('settingApiEndpoint').value = PFM_API.getEndpoint();
    document.getElementById('authApiEndpointInput').value = PFM_API.getEndpoint();

    // Check existing session token
    const token = PFM_API.getSessionToken();
    if (token) {
      try {
        const res = await PFM_API.call('auth.me', {});
        await this.bootstrapAuthenticatedSession(res.user);
      } catch (e) {
        this.showAuthScreen();
      }
    } else {
      this.showAuthScreen();
    }
  },

  initTheme: function() {
    const savedTheme = localStorage.getItem(PFM_CONFIG.STORAGE_KEYS.THEME) || 'light';
    this.applyTheme(savedTheme);
  },

  toggleTheme: function() {
    const cur = document.documentElement.getAttribute('data-theme') || 'light';
    const next = cur === 'dark' ? 'light' : 'dark';
    this.applyTheme(next);
    if (this.currentUser) {
      PFM_DASHBOARD.loadDashboard();
    }
  },

  applyTheme: function(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    localStorage.setItem(PFM_CONFIG.STORAGE_KEYS.THEME, theme);
    const icon = document.getElementById('themeToggleIcon');
    if (icon) {
      icon.className = theme === 'dark' ? 'bi bi-sun-fill text-warning' : 'bi bi-moon-stars-fill';
    }
  },

  showAuthScreen: function() {
    this.currentUser = null;
    document.getElementById('authScreenWrapper').classList.remove('d-none');
    document.getElementById('appShellWrapper').classList.add('d-none');
  },

  bootstrapAuthenticatedSession: async function(user) {
    this.currentUser = user;
    document.getElementById('authScreenWrapper').classList.add('d-none');
    document.getElementById('appShellWrapper').classList.remove('d-none');

    this.updateUserHeader();
    await this.loadCategories();
    await PFM_ACCOUNTS.loadAccounts();
    if (window.PFM_NOTIFICATIONS) {
      PFM_NOTIFICATIONS.loadNotifications();
    }
    this.navigateTo('dashboard');
  },

  updateUserHeader: function() {
    if (!this.currentUser) return;
    document.getElementById('topbarUserName').textContent = this.currentUser.full_name;
    document.getElementById('topbarUserEmail').textContent = `${this.currentUser.email} (${this.currentUser.base_currency})`;

    // Populate profile settings form
    document.getElementById('profFullName').value = this.currentUser.full_name || '';
    document.getElementById('profEmail').value = this.currentUser.email || '';
    document.getElementById('profBaseCurrency').value = this.currentUser.base_currency || 'THB';
    document.getElementById('profTimezone').value = this.currentUser.timezone || 'Asia/Bangkok';
  },

  navigateTo: function(viewName) {
    this.activeView = viewName;
    const views = ['dashboard', 'transactions', 'accounts', 'budgets', 'goals', 'recurring', 'reports', 'debts', 'bills', 'notifications', 'automation', 'categories', 'roadmap', 'settings'];
    views.forEach(v => {
      const sec = document.getElementById('view-' + v);
      if (sec) sec.classList.toggle('d-none', v !== viewName);

      const navBtn = document.getElementById('nav-' + v);
      if (navBtn) navBtn.classList.toggle('active', v === viewName);

      const mobBtn = document.getElementById('mobnav-' + v);
      if (mobBtn) mobBtn.classList.toggle('active', v === viewName);
    });

    // Close mobile sidebar if open
    document.getElementById('appSidebar').classList.remove('open');

    if (viewName === 'dashboard') {
      PFM_DASHBOARD.loadDashboard();
    } else if (viewName === 'transactions') {
      PFM_TRANSACTIONS.loadTransactions();
    } else if (viewName === 'accounts') {
      PFM_ACCOUNTS.loadAccounts();
    } else if (viewName === 'budgets' && window.PFM_BUDGETS) {
      PFM_BUDGETS.loadBudgets();
    } else if (viewName === 'goals' && window.PFM_GOALS) {
      PFM_GOALS.loadGoals();
    } else if (viewName === 'recurring' && window.PFM_RECURRING) {
      PFM_RECURRING.loadRecurring();
    } else if (viewName === 'reports' && window.PFM_REPORTS) {
      PFM_REPORTS.loadReports();
    } else if (viewName === 'debts' && window.PFM_DEBTS) {
      PFM_DEBTS.loadDebts();
    } else if (viewName === 'bills' && window.PFM_BILLS) {
      PFM_BILLS.loadBillsAndImports();
    } else if (viewName === 'notifications' && window.PFM_NOTIFICATIONS) {
      PFM_NOTIFICATIONS.loadNotifications();
    } else if (viewName === 'automation' && window.PFM_AUTOMATION) {
      PFM_AUTOMATION.loadAll();
    } else if (viewName === 'categories') {
      this.renderCategoriesView();
    } else if (viewName === 'settings') {
      this.loadAuditLogs();
    }
  },

  toggleMobileSidebar: function() {
    document.getElementById('appSidebar').classList.toggle('open');
  },

  loadCategories: async function() {
    const res = await PFM_API.call('categories.list', { include_inactive: false });
    this.categories = res.categories || [];
    this.populateCategorySelects();
    this.renderCategoriesView();
  },

  getAccountMap: function() {
    const map = {};
    (this.accounts || []).forEach(a => { map[a.account_id] = a; });
    return map;
  },

  getCategoryMap: function() {
    const map = {};
    (this.categories || []).forEach(c => { map[c.category_id] = c; });
    return map;
  },

  populateAccountSelects: function() {
    const activeAccounts = (this.accounts || []).filter(a => !a.is_archived);
    const optionsHtml = activeAccounts.map(a =>
      `<option value="${PFM_UTILS.escapeHtml(a.account_id)}">${PFM_UTILS.escapeHtml(a.account_name)} (${PFM_UTILS.escapeHtml(a.currency)})</option>`
    ).join('');

    const dashAcc = document.getElementById('dashFilterAccount');
    if (dashAcc) dashAcc.innerHTML = `<option value="">ทุกบัญชี</option>` + optionsHtml;

    const txFilterAcc = document.getElementById('txFilterAccount');
    if (txFilterAcc) txFilterAcc.innerHTML = `<option value="">ทุกบัญชี</option>` + optionsHtml;

    const txAcc = document.getElementById('txAccount');
    if (txAcc) txAcc.innerHTML = optionsHtml;

    const txToAcc = document.getElementById('txToAccount');
    if (txToAcc) txToAcc.innerHTML = `<option value="">-- เลือกบัญชีปลายทาง --</option>` + optionsHtml;

    const csvAcc = document.getElementById('csvImportAccount');
    if (csvAcc) csvAcc.innerHTML = optionsHtml;

    const recAcc = document.getElementById('recAccount');
    if (recAcc) recAcc.innerHTML = optionsHtml;

    const recToAcc = document.getElementById('recToAccount');
    if (recToAcc) recToAcc.innerHTML = `<option value="">-- เลือกบัญชีปลายทาง --</option>` + optionsHtml;

    const repAcc = document.getElementById('repFilterAccount');
    if (repAcc) repAcc.innerHTML = `<option value="">ทุกบัญชี</option>` + optionsHtml;
  },

  populateCategorySelects: function() {
    const optionsHtml = (this.categories || []).map(c =>
      `<option value="${PFM_UTILS.escapeHtml(c.category_id)}">${c.parent_id ? '↳ ' : ''}${PFM_UTILS.escapeHtml(c.category_name)} (${PFM_UTILS.escapeHtml(c.category_type)})</option>`
    ).join('');

    const dashCat = document.getElementById('dashFilterCategory');
    if (dashCat) dashCat.innerHTML = `<option value="">ทุกหมวดหมู่</option>` + optionsHtml;

    const txFilterCat = document.getElementById('txFilterCategory');
    if (txFilterCat) txFilterCat.innerHTML = `<option value="">ทุกหมวดหมู่</option>` + optionsHtml;

    const parentCatSelect = document.getElementById('newCatParent');
    if (parentCatSelect) {
      const mainOnly = (this.categories || []).filter(c => !c.parent_id);
      parentCatSelect.innerHTML = `<option value="">-- เป็นหมวดหมู่หลัก --</option>` +
        mainOnly.map(c => `<option value="${PFM_UTILS.escapeHtml(c.category_id)}">${PFM_UTILS.escapeHtml(c.category_name)} (${PFM_UTILS.escapeHtml(c.category_type)})</option>`).join('');
    }
  },

  renderCategoriesView: function() {
    const tbody = document.getElementById('categoriesTableBody');
    if (!tbody) return;

    const catMap = this.getCategoryMap();
    tbody.innerHTML = (this.categories || []).map(c => {
      const parentName = c.parent_id && catMap[c.parent_id] ? catMap[c.parent_id].category_name : '-';
      return `
        <tr>
          <td>
            <span class="d-inline-block rounded-circle me-2" style="width:12px;height:12px;background:${PFM_UTILS.escapeHtml(c.color)}"></span>
            <span class="fw-semibold">${PFM_UTILS.escapeHtml(c.category_name)}</span>
          </td>
          <td><span class="badge badge-tx-${PFM_UTILS.escapeHtml(c.category_type)}">${PFM_UTILS.escapeHtml(c.category_type)}</span></td>
          <td class="small">${PFM_UTILS.escapeHtml(parentName)}</td>
          <td>${c.is_system ? '<span class="badge bg-secondary">หมวดหมู่ระบบ</span>' : '<span class="badge bg-primary">กำหนดเอง</span>'}</td>
        </tr>
      `;
    }).join('');
  },

  handleCreateCategory: async function(e) {
    e.preventDefault();
    const name = document.getElementById('newCatName').value.trim();
    const type = document.getElementById('newCatType').value;
    const parentId = document.getElementById('newCatParent').value;
    const color = document.getElementById('newCatColor').value;

    try {
      await PFM_API.call('categories.create', {
        category_name: name,
        category_type: type,
        parent_id: parentId,
        color: color
      });
      document.getElementById('newCatName').value = '';
      this.showToast('เพิ่มหมวดหมู่ใหม่สำเร็จ', 'success');
      await this.loadCategories();
    } catch (err) {
      this.showToast(err.message, 'danger');
    }
  },

  handleSaveApiEndpoint: function(e) {
    e.preventDefault();
    const url = document.getElementById('settingApiEndpoint').value.trim();
    PFM_API.setEndpoint(url);
    document.getElementById('authApiEndpointInput').value = PFM_API.getEndpoint();
    this.showToast('บันทึก URL ของ Backend API เรียบร้อยแล้ว', 'success');
  },

  saveAuthApiEndpoint: function() {
    const url = document.getElementById('authApiEndpointInput').value.trim();
    PFM_API.setEndpoint(url);
    document.getElementById('settingApiEndpoint').value = PFM_API.getEndpoint();
    this.showToast('อัปเดต API Endpoint เรียบร้อย: ' + PFM_API.getEndpoint(), 'info');
  },

  exportUserBackup: async function() {
    try {
      const res = await PFM_API.call('system.backupExport', {});
      const blob = new Blob([JSON.stringify(res.backup, null, 2)], { type: 'application/json;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `pfm_backup_${this.currentUser.email}_${PFM_UTILS.todayDateString()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      this.showToast('ส่งออกไฟล์สำรองข้อมูล (JSON Backup) สำเร็จ', 'success');
      this.loadAuditLogs();
    } catch (err) {
      this.showToast('ส่งออกไฟล์สำรองไม่สำเร็จ: ' + err.message, 'danger');
    }
  },

  handleRestoreBackupFile: async function(e) {
    const file = e.target.files && e.target.files[0];
    if (!file) return;

    try {
      const rawText = await file.text();
      const backupObj = JSON.parse(rawText);
      const res = await PFM_API.call('system.backupRestore', { backup: backupObj });
      this.showToast('กู้คืนข้อมูลเข้าสู่ Google Sheets สำเร็จ!', 'success');
      await this.loadCategories();
      await PFM_ACCOUNTS.loadAccounts();
      await PFM_DASHBOARD.loadDashboard();
      await this.loadAuditLogs();
    } catch (err) {
      this.showToast('กู้คืนข้อมูลไม่สำเร็จ: ' + err.message, 'danger');
    } finally {
      e.target.value = '';
    }
  },

  loadAuditLogs: async function() {
    const tbody = document.getElementById('auditLogsTableBody');
    if (!tbody) return;
    try {
      const res = await PFM_API.call('system.auditLogs', { limit: 30 });
      const logs = res.audit_logs || [];
      tbody.innerHTML = logs.map(l => `
        <tr>
          <td class="small text-muted">${PFM_UTILS.escapeHtml(l.created_at)}</td>
          <td><span class="badge bg-secondary">${PFM_UTILS.escapeHtml(l.action)}</span></td>
          <td class="small">${PFM_UTILS.escapeHtml(l.entity_type)} (${PFM_UTILS.escapeHtml(l.entity_id)})</td>
          <td class="small">${PFM_UTILS.escapeHtml(l.summary)}</td>
        </tr>
      `).join('');
    } catch (e) {
      tbody.innerHTML = '<tr><td colspan="4" class="text-center text-muted">ไม่สามารถโหลดประวัติการใช้งาน</td></tr>';
    }
  },

  showToast: function(message, type) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const bgMap = {
      success: 'bg-success text-white',
      danger: 'bg-danger text-white',
      warning: 'bg-warning text-dark',
      info: 'bg-primary text-white'
    };
    const cls = bgMap[type] || bgMap.info;
    const toastEl = document.createElement('div');
    toastEl.className = `toast align-items-center ${cls} border-0 show mb-2`;
    toastEl.setAttribute('role', 'alert');
    toastEl.innerHTML = `
      <div class="d-flex">
        <div class="toast-body fw-medium">${PFM_UTILS.escapeHtml(message)}</div>
        <button type="button" class="btn-close btn-close-white me-2 m-auto" onclick="this.closest('.toast').remove()"></button>
      </div>
    `;
    container.appendChild(toastEl);
    setTimeout(() => {
      if (toastEl && toastEl.parentNode) toastEl.remove();
    }, 4500);
  }
};

document.addEventListener('DOMContentLoaded', () => {
  PFM_APP.init();
});

