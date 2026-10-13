/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/config.js
 * Description: Global frontend configuration and formatting utilities.
 */

window.PFM_CONFIG = {
  APP_NAME: 'Bank_bana',
  VERSION: '1.0.0-phase4-complete',
  SPREADSHEET_ID: '15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A',
  // Uses custom GAS Web App URL if configured in localStorage, otherwise uses live local Google Sheets bridge `/api`
  DEFAULT_API_URL: localStorage.getItem('pfm_gas_api_url') || '/api',
  STORAGE_KEYS: {
    SESSION_TOKEN: 'pfm_session_token',
    USER_PROFILE: 'pfm_user_profile',
    THEME: 'pfm_theme',
    API_URL: 'pfm_gas_api_url'
  },
  ACCOUNT_TYPE_LABELS: {
    cash: 'เงินสด (Cash)',
    bank: 'บัญชีธนาคาร (Bank)',
    ewallet: 'กระเป๋าเงินดิจิทัล (E-Wallet)',
    credit_card: 'บัตรเครดิต (Credit Card)',
    investment: 'พอร์ตการลงทุน (Investment)'
  },
  TX_TYPE_LABELS: {
    income: 'รายรับ (Income)',
    expense: 'รายจ่าย (Expense)',
    transfer: 'โอนเงิน (Transfer)',
    refund: 'คืนเงิน (Refund)',
    adjustment: 'ปรับยอด (Adjustment)'
  },
  CURRENCIES: ['THB', 'USD', 'EUR', 'JPY', 'GBP', 'SGD']
};

window.PFM_UTILS = {
  formatCurrency: function(amount, currency) {
    const cur = currency || 'THB';
    const num = Number(amount || 0);
    try {
      return new Intl.NumberFormat('th-TH', {
        style: 'currency',
        currency: cur,
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
      }).format(num);
    } catch (e) {
      return num.toFixed(2) + ' ' + cur;
    }
  },

  formatNumber: function(amount) {
    return new Intl.NumberFormat('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    }).format(Number(amount || 0));
  },

  todayDateString: function() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  },

  currentMonthRange: function() {
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const lastDay = String(new Date(yyyy, now.getMonth() + 1, 0).getDate()).padStart(2, '0');
    return {
      start_date: `${yyyy}-${mm}-01`,
      end_date: `${yyyy}-${mm}-${lastDay}`
    };
  },

  generateIdempotencyKey: function(prefix) {
    return (prefix || 'ik') + '_' + Date.now() + '_' + Math.random().toString(36).substring(2, 10);
  },

  escapeHtml: function(str) {
    return String(str === undefined || str === null ? '' : str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }
};

