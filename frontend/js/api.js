/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/api.js
 * Description: Standalone REST API client for Google Apps Script Backend
 *              with Hybrid Offline-First Caching & Outbox Auto-Sync support.
 */

window.PFM_API = {
  getEndpoint: function() {
    const stored = localStorage.getItem(PFM_CONFIG.STORAGE_KEYS.API_URL);
    if (!stored || stored === '/api' || !stored.startsWith('https://script.google.com/')) {
      if (stored) {
        localStorage.removeItem(PFM_CONFIG.STORAGE_KEYS.API_URL);
      }
      return PFM_CONFIG.DEFAULT_API_URL;
    }
    return stored;
  },

  setEndpoint: function(url) {
    const clean = String(url || '').trim();
    if (!clean || clean === '/api') {
      localStorage.removeItem(PFM_CONFIG.STORAGE_KEYS.API_URL);
    } else {
      localStorage.setItem(PFM_CONFIG.STORAGE_KEYS.API_URL, clean);
    }
  },

  getSessionToken: function() {
    return localStorage.getItem(PFM_CONFIG.STORAGE_KEYS.SESSION_TOKEN) || '';
  },

  setSession: function(token, userObj) {
    if (token) {
      localStorage.setItem(PFM_CONFIG.STORAGE_KEYS.SESSION_TOKEN, token);
    }
    if (userObj) {
      localStorage.setItem(PFM_CONFIG.STORAGE_KEYS.USER_PROFILE, JSON.stringify(userObj));
    }
  },

  clearSession: function() {
    localStorage.removeItem(PFM_CONFIG.STORAGE_KEYS.SESSION_TOKEN);
    localStorage.removeItem(PFM_CONFIG.STORAGE_KEYS.USER_PROFILE);
  },

  getCachedUser: function() {
    try {
      const raw = localStorage.getItem(PFM_CONFIG.STORAGE_KEYS.USER_PROFILE);
      return raw ? JSON.parse(raw) : null;
    } catch (e) {
      return null;
    }
  },

  /**
   * Sends a POST request to the GAS Web App endpoint.
   * Uses `text/plain;charset=utf-8` to avoid CORS preflight rejection on script.google.com.
   * Automatically falls back to local cache / Outbox queue when offline.
   */
  call: async function(action, params) {
    const safeParams = params || {};
    const offlineEngine = window.PFM_OFFLINE;

    // 1. Check if user forced offline simulation or browser is offline
    if (offlineEngine && (offlineEngine.isForceOffline() || !navigator.onLine)) {
      return this.handleOfflineFallback(action, safeParams);
    }

    const endpoint = this.getEndpoint();
    const payload = {
      action: action,
      session_token: this.getSessionToken(),
      params: safeParams
    };

    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain;charset=utf-8'
        },
        body: JSON.stringify(payload),
        redirect: 'follow'
      });

      if (!response.ok && response.status !== 200) {
        throw new Error('HTTP Error ' + response.status + ': ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้');
      }

      const json = await response.json();
      if (!json.ok) {
        const errCode = (json.error && json.error.code) || 'API_ERROR';
        const errMsg = (json.error && json.error.message) || 'เกิดข้อผิดพลาดในการประมวลผลคำขอ';
        if (errCode === 'UNAUTHORIZED' || errCode === 'SESSION_EXPIRED') {
          this.clearSession();
          if (window.PFM_APP && typeof window.PFM_APP.showAuthScreen === 'function') {
            window.PFM_APP.showAuthScreen();
          }
        }
        const err = new Error(errMsg);
        err.code = errCode;
        err.details = json.error && json.error.details;
        err.requestId = json.request_id;
        throw err;
      }

      if (offlineEngine) {
        offlineEngine.lastReachable = true;
        offlineEngine.updateStatusBarUI();
        if (offlineEngine.READ_ONLY_ACTIONS.has(action)) {
          offlineEngine.saveCachedResponse(action, safeParams, json.data);
        }
      }

      return json.data;
    } catch (err) {
      // Only fall back to offline cache/queue on network reachability errors, not business validation errors
      if (err && err.code) {
        throw err;
      }
      if (offlineEngine) {
        offlineEngine.lastReachable = false;
        offlineEngine.updateStatusBarUI();
        return this.handleOfflineFallback(action, safeParams);
      }
      throw err;
    }
  },

  handleOfflineFallback: function(action, params) {
    const offlineEngine = window.PFM_OFFLINE;
    if (!offlineEngine) {
      throw new Error('ไม่มีการเชื่อมต่ออินเทอร์เน็ต');
    }

    // Handle auth.me / auth.login while offline using cached user profile
    if (action === 'auth.me' || action === 'auth.login') {
      const cachedUser = this.getCachedUser() || {
        user_id: 'usr_demo_001',
        email: params.email || 'demo@pfm.local',
        full_name: 'Demo Financial Pro (Offline)',
        base_currency: 'THB',
        timezone: 'Asia/Bangkok',
        role: 'admin'
      };
      const token = this.getSessionToken() || 'offline_session_token';
      this.setSession(token, cachedUser);
      return {
        session_token: token,
        user: cachedUser,
        offline_mode: true
      };
    }

    // Handle read actions from local cache
    if (offlineEngine.READ_ONLY_ACTIONS.has(action)) {
      const cached = offlineEngine.getCachedResponse(action);
      if (cached) {
        return cached;
      }
      // Return safe empty structure if no cache exists yet
      return this.getDefaultOfflineData(action);
    }

    // Handle write actions by queueing into Outbox and applying optimistic local update
    if (offlineEngine.QUEUEABLE_WRITE_ACTIONS.has(action)) {
      const result = offlineEngine.enqueueMutation(action, params);
      if (window.PFM_APP && typeof window.PFM_APP.toast === 'function') {
        window.PFM_APP.toast('บันทึกในโหมดออฟไลน์แล้ว (จะซิงก์เข้า Google Sheets อัตโนมัติเมื่อต่อเน็ต)', 'warning');
      }
      return result;
    }

    throw new Error('ฟีเจอร์นี้ต้องเชื่อมต่ออินเทอร์เน็ตจึงจะใช้งานได้');
  },

  getDefaultOfflineData: function(action) {
    switch (action) {
      case 'categories.list': return { categories: [] };
      case 'accounts.list': return { accounts: [], summary: { total_net_worth: 0 } };
      case 'transactions.list': return { transactions: [], total: 0, page: 1, page_size: 25 };
      case 'dashboard.summary': return { kpis: { total_balance: 0, period_income: 0, period_expense: 0, period_net_cashflow: 0, savings_rate_pct: 0 }, accounts: [], recent_transactions: [], budgets_near_limit: [], upcoming_items: [] };
      case 'budgets.list': return { budgets: [], summary: {} };
      case 'goals.list': return { goals: [], summary: {} };
      case 'recurring.list': return { recurring_rules: [], upcoming_forecasts: [], actual_generated_transactions: [] };
      case 'debts.list': return { debts: [], credit_cards: [], summary: { dti_percentage: 0, dti_status: 'healthy' } };
      case 'bills.list': return { bills: [], summary: {} };
      case 'imports.list': return { imports: [] };
      case 'notifications.list': return { unread_count: 0, total_count: 0, notifications: [] };
      case 'rules.list': return { total_rules: 0, active_rules: 0, rules: [] };
      case 'analytics.insights': return { starting_liquid_balance: 0, anomalies_detected: [], cashflow_forecasts: { days_30: {}, days_60: {}, days_90: {} }, risk_radar: { at_risk_budgets: [], at_risk_goals: [] } };
      case 'system.auditLogs': return { audit_logs: [] };
      default: return {};
    }
  }
};
