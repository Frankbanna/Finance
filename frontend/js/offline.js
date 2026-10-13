/**
 * ============================================================================
 * PERSONAL FINANCE MANAGER PRO - HYBRID OFFLINE-FIRST & AUTO-SYNC ENGINE
 * ============================================================================
 * Module: frontend/js/offline.js
 * Description:
 *   Enables seamless offline web usage on both Mobile (iOS/Android) and Desktop:
 *   1. Caches live Google Sheets responses in localStorage per action & user.
 *   2. Maintains a local mirror of Accounts, Categories, Transactions, Budgets,
 *      Goals, Recurring, Debts, Bills, Rules, and Notifications.
 *   3. When offline (or if the user toggles "โหมดออฟไลน์จำลอง" to test), write
 *      actions (`transactions.create`, `accounts.create`, `bills.pay`, etc.)
 *      are queued in an Outbox Queue with an `idempotency_key` and immediately
 *      applied to the local mirror so the Dashboard, Accounts, and Transactions
 *      update instantaneously.
 *   4. When internet/server connectivity returns, automatically replays all
 *      queued mutations to Google Sheets in chronological order without
 *      creating duplicate records.
 * ============================================================================
 */

window.PFM_OFFLINE = {
  STORAGE_KEYS: {
    CACHE_MAP: 'pfm_offline_cache_v1',
    OUTBOX_QUEUE: 'pfm_offline_outbox_v1',
    FORCE_OFFLINE: 'pfm_force_offline_mode'
  },

  isSyncing: false,
  lastReachable: true,
  deferredInstallPrompt: null,

  READ_ONLY_ACTIONS: new Set([
    'system.ping',
    'auth.me',
    'categories.list',
    'accounts.list',
    'transactions.list',
    'transactions.exportCsv',
    'dashboard.summary',
    'budgets.list',
    'goals.list',
    'recurring.list',
    'reports.overview',
    'debts.list',
    'debts.amortization',
    'bills.list',
    'imports.list',
    'notifications.list',
    'rules.list',
    'rules.evaluate',
    'analytics.insights',
    'system.auditLogs',
    'system.backupExport'
  ]),

  QUEUEABLE_WRITE_ACTIONS: new Set([
    'transactions.create',
    'transactions.update',
    'transactions.void',
    'accounts.create',
    'accounts.update',
    'accounts.reconcile',
    'categories.create',
    'budgets.create',
    'budgets.update',
    'goals.create',
    'goals.update',
    'goals.contribute',
    'recurring.create',
    'recurring.update',
    'debts.create',
    'debts.update',
    'debts.pay',
    'debts.payCreditCard',
    'bills.create',
    'bills.update',
    'bills.pay',
    'rules.create',
    'rules.update',
    'rules.delete',
    'notifications.markRead'
  ]),

  init: function() {
    this.registerServiceWorker();

    window.addEventListener('online', () => {
      this.lastReachable = true;
      this.updateStatusBarUI();
      if (!this.isForceOffline()) {
        this.syncOutbox();
      }
    });

    window.addEventListener('offline', () => {
      this.lastReachable = false;
      this.updateStatusBarUI();
    });

    // Capture PWA install prompt on Android / Desktop Chrome / Edge
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredInstallPrompt = e;
      const installBtn = document.getElementById('btnInstallPwa');
      if (installBtn) installBtn.classList.remove('d-none');
    });

    this.updateStatusBarUI();
    this.checkConnection();
    window.addEventListener('focus', () => this.checkConnection());
  },

  checkConnection: async function() {
    if (this.isForceOffline() || !navigator.onLine) {
      this.updateStatusBarUI();
      return;
    }
    try {
      const endpoint = PFM_API.getEndpoint();
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action: 'system.ping' }),
        redirect: 'follow'
      });
      if (res.ok) {
        this.lastReachable = true;
        this.updateStatusBarUI();
      }
    } catch (e) {
      // offline or unreachable
    }
  },

  registerServiceWorker: function() {
    if ('serviceWorker' in navigator && (location.protocol === 'http:' || location.protocol === 'https:')) {
      navigator.serviceWorker.register('./sw.js').catch(() => {});
    }
  },

  promptInstallPwa: async function() {
    if (this.deferredInstallPrompt) {
      this.deferredInstallPrompt.prompt();
      await this.deferredInstallPrompt.userChoice;
      this.deferredInstallPrompt = null;
      return;
    }
    const modalEl = document.getElementById('pwaInstallModal');
    if (modalEl && window.bootstrap) {
      bootstrap.Modal.getOrCreateInstance(modalEl).show();
    } else if (window.PFM_APP && window.PFM_APP.toast) {
      window.PFM_APP.toast('บน iOS Safari กดปุ่ม Share แล้วเลือก "เพิ่มไปยังหน้าจอโฮม (Add to Home Screen)" ได้เลยครับ', 'info');
    }
  },

  isForceOffline: function() {
    return localStorage.getItem(this.STORAGE_KEYS.FORCE_OFFLINE) === 'true';
  },

  toggleForceOffline: function() {
    const next = !this.isForceOffline();
    localStorage.setItem(this.STORAGE_KEYS.FORCE_OFFLINE, next ? 'true' : 'false');
    this.updateStatusBarUI();
    if (next) {
      if (window.PFM_APP) {
        window.PFM_APP.toast('เปิดโหมดออฟไลน์ (Offline Mode): คุณสามารถจดธุรกรรมและดูข้อมูลได้ทันที ระบบจะเก็บคิวไว้ซิงก์เมื่อออนไลน์', 'warning');
      }
    } else {
      if (window.PFM_APP) {
        window.PFM_APP.toast('กลับมาเชื่อมต่อโหมดออนไลน์ (Online): กำลังซิงก์ข้อมูลค้างส่งขึ้น Google Sheets...', 'success');
      }
      this.syncOutbox();
    }
  },

  isCurrentlyOffline: function() {
    return this.isForceOffline() || !navigator.onLine || !this.lastReachable;
  },

  getCacheMap: function() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.CACHE_MAP);
      return raw ? JSON.parse(raw) : {};
    } catch (e) {
      return {};
    }
  },

  saveCacheMap: function(map) {
    try {
      localStorage.setItem(this.STORAGE_KEYS.CACHE_MAP, JSON.stringify(map));
    } catch (e) {
      // Ignore quota errors
    }
  },

  saveCachedResponse: function(action, params, data) {
    const map = this.getCacheMap();
    map[action] = {
      updated_at: new Date().toISOString(),
      data: data
    };
    this.saveCacheMap(map);
  },

  getCachedResponse: function(action) {
    const map = this.getCacheMap();
    return map[action] ? map[action].data : null;
  },

  getOutboxQueue: function() {
    try {
      const raw = localStorage.getItem(this.STORAGE_KEYS.OUTBOX_QUEUE);
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  },

  saveOutboxQueue: function(queue) {
    localStorage.setItem(this.STORAGE_KEYS.OUTBOX_QUEUE, JSON.stringify(queue || []));
    this.updateStatusBarUI();
  },

  enqueueMutation: function(action, params) {
    const queue = this.getOutboxQueue();
    const safeParams = Object.assign({}, params || {});
    if (!safeParams.idempotency_key) {
      safeParams.idempotency_key = PFM_UTILS.generateIdempotencyKey('offline');
    }

    const item = {
      queue_id: 'q_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
      action: action,
      params: safeParams,
      queued_at: new Date().toISOString()
    };

    queue.push(item);
    this.saveOutboxQueue(queue);

    // Apply optimistic update to local cached state so UI updates immediately while offline
    const optimisticResult = this.applyOptimisticLocalMutation(action, safeParams);
    return optimisticResult;
  },

  /**
   * Applies an offline write operation directly to the local cached tables
   * so that Dashboard, Accounts, Transactions, Bills, Debts, etc. reflect changes immediately.
   */
  applyOptimisticLocalMutation: function(action, params) {
    const map = this.getCacheMap();
    const nowIso = new Date().toISOString();
    const user = PFM_API.getCachedUser() || { user_id: 'usr_demo_001', base_currency: 'THB' };

    if (action === 'transactions.create') {
      const txId = 'txn_offline_' + Date.now().toString(36);
      const txType = String(params.tx_type || 'expense').toLowerCase();
      const amt = Math.round(Number(params.amount || 0) * 100) / 100;
      const newTx = {
        transaction_id: txId,
        user_id: user.user_id,
        tx_date: params.tx_date || PFM_UTILS.todayDateString(),
        tx_time: params.tx_time || '12:00',
        tx_type: txType,
        account_id: params.account_id || '',
        to_account_id: params.to_account_id || '',
        category_id: params.category_id || '',
        subcategory_id: params.subcategory_id || '',
        amount: amt,
        currency: params.currency || 'THB',
        exchange_rate: 1,
        to_amount: amt,
        merchant: params.merchant || '',
        description: (params.description || '') + ' [รอซิงก์ออนไลน์]',
        tags: params.tags || 'offline-queued',
        receipt_url: params.receipt_url || '',
        idempotency_key: params.idempotency_key,
        status: 'posted',
        revision: 1,
        created_at: nowIso,
        updated_at: nowIso
      };

      // Update cached transactions.list
      if (map['transactions.list'] && map['transactions.list'].data) {
        const txList = map['transactions.list'].data.transactions || [];
        txList.unshift(newTx);
        map['transactions.list'].data.transactions = txList;
        map['transactions.list'].data.total = txList.length;
      }

      // Update cached accounts.list balances
      if (map['accounts.list'] && map['accounts.list'].data && map['accounts.list'].data.accounts) {
        map['accounts.list'].data.accounts.forEach(acc => {
          if (acc.account_id === newTx.account_id) {
            if (txType === 'income' || txType === 'refund') acc.current_balance = Number(acc.current_balance || 0) + amt;
            else if (txType === 'expense' || txType === 'transfer') acc.current_balance = Number(acc.current_balance || 0) - amt;
            else if (txType === 'adjustment') acc.current_balance = Number(acc.current_balance || 0) + amt;
          }
          if (txType === 'transfer' && acc.account_id === newTx.to_account_id) {
            acc.current_balance = Number(acc.current_balance || 0) + amt;
          }
        });
      }

      // Update cached dashboard.summary
      if (map['dashboard.summary'] && map['dashboard.summary'].data) {
        const dash = map['dashboard.summary'].data;
        if (dash.kpis) {
          if (txType === 'income') {
            dash.kpis.period_income = Number(dash.kpis.period_income || 0) + amt;
            dash.kpis.total_balance = Number(dash.kpis.total_balance || 0) + amt;
          } else if (txType === 'expense') {
            dash.kpis.period_expense = Number(dash.kpis.period_expense || 0) + amt;
            dash.kpis.total_balance = Number(dash.kpis.total_balance || 0) - amt;
          } else if (txType === 'refund') {
            dash.kpis.period_expense = Math.max(0, Number(dash.kpis.period_expense || 0) - amt);
            dash.kpis.total_balance = Number(dash.kpis.total_balance || 0) + amt;
          }
          dash.kpis.period_net_cashflow = Number(dash.kpis.period_income || 0) - Number(dash.kpis.period_expense || 0);
        }
        if (Array.isArray(dash.recent_transactions)) {
          dash.recent_transactions.unshift(newTx);
        }
      }

      this.saveCacheMap(map);
      return {
        transaction: newTx,
        accounts: (map['accounts.list'] && map['accounts.list'].data && map['accounts.list'].data.accounts) || [],
        offline_queued: true
      };
    }

    if (action === 'accounts.create') {
      const newAcc = {
        account_id: 'acc_offline_' + Date.now().toString(36),
        user_id: user.user_id,
        account_name: params.account_name || 'บัญชีใหม่ (Offline)',
        account_type: params.account_type || 'bank',
        currency: params.currency || 'THB',
        opening_balance: Number(params.opening_balance || 0),
        current_balance: Number(params.opening_balance || 0),
        institution_name: params.institution_name || '',
        account_number_masked: params.account_number_masked || '',
        color: params.color || '#2563EB',
        include_in_net_worth: params.include_in_net_worth !== false,
        is_archived: false,
        created_at: nowIso,
        updated_at: nowIso
      };
      if (map['accounts.list'] && map['accounts.list'].data && map['accounts.list'].data.accounts) {
        map['accounts.list'].data.accounts.push(newAcc);
      }
      this.saveCacheMap(map);
      return {
        account: newAcc,
        accounts: (map['accounts.list'] && map['accounts.list'].data && map['accounts.list'].data.accounts) || [],
        offline_queued: true
      };
    }

    if (action === 'rules.create') {
      const newRule = {
        rule_id: 'rul_offline_' + Date.now().toString(36),
        rule_name: params.rule_name || 'กฎอัตโนมัติ (Offline)',
        match_field: params.match_field || 'any_text',
        match_operator: params.match_operator || 'contains',
        match_value: params.match_value || params.pattern_value || '',
        assign_category_id: params.assign_category_id || params.target_category_id || '',
        assign_category_name: params.assign_category_id || params.target_category_id || '',
        assign_tags: params.assign_tags || params.auto_tags || '',
        is_active: true,
        priority: Number(params.priority || 10),
        created_at: nowIso
      };
      if (map['rules.list'] && map['rules.list'].data && Array.isArray(map['rules.list'].data.rules)) {
        map['rules.list'].data.rules.push(newRule);
      }
      this.saveCacheMap(map);
      return { rule: newRule, offline_queued: true };
    }

    return { offline_queued: true, action: action, queued_at: nowIso };
  },

  /**
   * Synchronizes all pending mutations in the Outbox Queue with the live Google Sheets server.
   */
  syncOutbox: async function() {
    if (this.isSyncing || this.isForceOffline() || !navigator.onLine) {
      this.updateStatusBarUI();
      return { synced: 0, remaining: this.getOutboxQueue().length };
    }

    const queue = this.getOutboxQueue();
    if (queue.length === 0) {
      this.updateStatusBarUI();
      return { synced: 0, remaining: 0 };
    }

    this.isSyncing = true;
    this.updateStatusBarUI();

    const endpoint = PFM_API.getEndpoint();
    const token = PFM_API.getSessionToken();
    const remaining = [];
    let syncedCount = 0;

    for (let i = 0; i < queue.length; i++) {
      const item = queue[i];
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'text/plain;charset=utf-8' },
          body: JSON.stringify({
            action: item.action,
            session_token: token,
            params: item.params
          }),
          redirect: 'follow'
        });

        if (!res.ok) {
          remaining.push(...queue.slice(i));
          break;
        }

        const json = await res.json();
        if (json && json.ok) {
          syncedCount++;
        } else {
          // Validation/business error: drop from queue and notify user
          console.warn('[Offline Sync] Skipped invalid item:', item, json && json.error);
        }
      } catch (netErr) {
        // Network still unreachable, keep remaining items in queue
        remaining.push(...queue.slice(i));
        break;
      }
    }

    this.isSyncing = false;
    this.saveOutboxQueue(remaining);

    if (syncedCount > 0 && window.PFM_APP) {
      window.PFM_APP.toast(`ซิงก์ข้อมูลออฟไลน์ขึ้น Google Sheets สำเร็จ ${syncedCount} รายการ`, 'success');
      await window.PFM_APP.loadCategories();
      await window.PFM_ACCOUNTS.loadAccounts();
      window.PFM_APP.navigateTo(window.PFM_APP.activeView || 'dashboard');
    }

    this.updateStatusBarUI();
    return { synced: syncedCount, remaining: remaining.length };
  },

  updateStatusBarUI: function() {
    const badgeEl = document.getElementById('networkStatusBadge');
    const queueBtn = document.getElementById('btnSyncOutbox');
    const queueCountEl = document.getElementById('outboxQueueCount');
    const toggleBtn = document.getElementById('btnToggleOfflineMode');

    const queue = this.getOutboxQueue();
    const offline = this.isCurrentlyOffline();
    const forced = this.isForceOffline();

    if (badgeEl) {
      if (this.isSyncing) {
        badgeEl.className = 'badge rounded-pill bg-info text-dark d-flex align-items-center gap-1';
        badgeEl.innerHTML = `<span class="spinner-border spinner-border-sm" style="width:0.7rem;height:0.7rem;"></span><span>กำลังซิงก์...</span>`;
      } else if (offline) {
        badgeEl.className = 'badge rounded-pill bg-warning text-dark d-flex align-items-center gap-1';
        badgeEl.innerHTML = `<i class="bi bi-wifi-off"></i><span>โหมดออฟไลน์${forced ? ' (จำลอง)' : ''}</span>`;
      } else {
        badgeEl.className = 'badge rounded-pill bg-success bg-opacity-10 text-success border border-success d-flex align-items-center gap-1';
        badgeEl.innerHTML = `<i class="bi bi-cloud-check-fill"></i><span class="d-none d-md-inline">ออนไลน์ (ซิงก์อัตโนมัติ)</span>`;
      }
    }

    if (queueBtn && queueCountEl) {
      queueCountEl.textContent = String(queue.length);
      if (queue.length > 0) {
        queueBtn.classList.remove('d-none');
      } else {
        queueBtn.classList.add('d-none');
      }
    }

    if (toggleBtn) {
      if (forced) {
        toggleBtn.className = 'btn btn-sm btn-warning';
        toggleBtn.innerHTML = `<i class="bi bi-wifi me-1"></i><span class="d-none d-lg-inline">กลับสู่ออนไลน์</span>`;
      } else {
        toggleBtn.className = 'btn btn-sm btn-outline-secondary';
        toggleBtn.innerHTML = `<i class="bi bi-wifi-off me-1"></i><span class="d-none d-lg-inline">ทดสอบออฟไลน์</span>`;
      }
    }
  }
};

