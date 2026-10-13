/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: Config.gs
 * Description: Global configuration, sheet names, column schemas, and Script Properties loader.
 */

const APP_CONFIG = {
  APP_NAME: 'Bank_bana',
  VERSION: '1.0.0-phase4-complete',
  DEFAULT_SPREADSHEET_ID: '15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A',
  DEFAULT_TIMEZONE: 'Asia/Bangkok',
  DEFAULT_CURRENCY: 'THB',
  SESSION_TTL_HOURS: 24 * 7, // 7 days
  MAX_LOGIN_ATTEMPTS: 5,
  LOCKOUT_MINUTES: 15,
  MAX_PAGE_SIZE: 100,
  DEFAULT_PAGE_SIZE: 25,
  CACHE_TTL_SECONDS: 120,
  LOCK_TIMEOUT_MS: 15000
};

const SHEET_NAMES = {
  USERS: 'Users',
  ACCOUNTS: 'Accounts',
  TRANSACTIONS: 'Transactions',
  CATEGORIES: 'Categories',
  BUDGETS: 'Budgets',
  GOALS: 'Goals',
  GOAL_CONTRIBUTIONS: 'Goal_Contributions',
  RECURRING: 'Recurring',
  DEBTS: 'Debts',
  DEBT_PAYMENTS: 'Debt_Payments',
  BILLS: 'Bills',
  RULES: 'Rules',
  NOTIFICATIONS: 'Notifications',
  IMPORT_HISTORY: 'Import_History',
  AUDIT_LOGS: 'Audit_Logs',
  SETTINGS: 'Settings'
};

const SHEET_HEADERS = {
  [SHEET_NAMES.USERS]: [
    'user_id', 'email', 'password_hash', 'pin_hash', 'salt',
    'full_name', 'base_currency', 'timezone', 'role', 'status',
    'failed_attempts', 'locked_until', 'session_token_hash', 'session_expires_at',
    'created_at', 'updated_at'
  ],
  [SHEET_NAMES.ACCOUNTS]: [
    'account_id', 'user_id', 'account_name', 'account_type', 'currency',
    'opening_balance', 'current_balance', 'credit_limit', 'billing_day', 'due_day',
    'institution_name', 'account_number_masked', 'color', 'icon',
    'include_in_net_worth', 'is_archived', 'last_reconciled_at',
    'created_at', 'updated_at'
  ],
  [SHEET_NAMES.TRANSACTIONS]: [
    'transaction_id', 'user_id', 'tx_date', 'tx_time', 'tx_type',
    'account_id', 'to_account_id', 'category_id', 'subcategory_id',
    'amount', 'currency', 'exchange_rate', 'to_amount',
    'merchant', 'description', 'tags', 'receipt_url',
    'reference_tx_id', 'recurring_id', 'import_id',
    'idempotency_key', 'dedup_hash', 'status', 'revision',
    'edit_history_json', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.CATEGORIES]: [
    'category_id', 'user_id', 'parent_id', 'category_name', 'category_type',
    'color', 'icon', 'is_system', 'is_active', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.BUDGETS]: [
    'budget_id', 'user_id', 'budget_name', 'period_type', 'category_id',
    'amount_limit', 'currency', 'start_date', 'end_date',
    'rollover_enabled', 'rollover_amount', 'alert_threshold_pct',
    'is_active', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.GOALS]: [
    'goal_id', 'user_id', 'goal_name', 'target_amount', 'current_amount',
    'currency', 'target_date', 'linked_account_id', 'priority', 'status',
    'color', 'icon', 'notes', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.GOAL_CONTRIBUTIONS]: [
    'contribution_id', 'goal_id', 'user_id', 'tx_date', 'entry_type',
    'amount', 'linked_transaction_id', 'note', 'created_at'
  ],
  [SHEET_NAMES.RECURRING]: [
    'recurring_id', 'user_id', 'title', 'tx_type', 'account_id',
    'to_account_id', 'category_id', 'amount', 'currency', 'frequency',
    'interval_count', 'start_date', 'end_date', 'next_run_date',
    'last_run_date', 'auto_post', 'status', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.DEBTS]: [
    'debt_id', 'user_id', 'debt_name', 'debt_type', 'lender_name',
    'linked_account_id', 'principal_amount', 'current_balance',
    'interest_rate_annual', 'minimum_payment', 'due_day',
    'start_date', 'target_payoff_date', 'status', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.DEBT_PAYMENTS]: [
    'payment_id', 'debt_id', 'user_id', 'payment_date', 'total_amount',
    'principal_paid', 'interest_paid', 'fee_amount', 'remaining_balance',
    'linked_transaction_id', 'created_at'
  ],
  [SHEET_NAMES.BILLS]: [
    'bill_id', 'user_id', 'bill_name', 'category_id', 'amount',
    'currency', 'due_date', 'is_recurring', 'frequency', 'status',
    'remind_days_before', 'paid_transaction_id', 'notes', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.RULES]: [
    'rule_id', 'user_id', 'rule_name', 'match_field', 'match_operator',
    'match_value', 'assign_category_id', 'assign_tags', 'is_active',
    'priority', 'created_at', 'updated_at'
  ],
  [SHEET_NAMES.NOTIFICATIONS]: [
    'notification_id', 'user_id', 'notif_type', 'severity', 'title',
    'message', 'reference_id', 'is_read', 'created_at'
  ],
  [SHEET_NAMES.IMPORT_HISTORY]: [
    'import_id', 'user_id', 'source_type', 'file_name', 'account_id',
    'total_rows', 'imported_rows', 'skipped_duplicates', 'status', 'created_at'
  ],
  [SHEET_NAMES.AUDIT_LOGS]: [
    'log_id', 'request_id', 'user_id', 'action', 'entity_type',
    'entity_id', 'summary', 'metadata_json', 'created_at'
  ],
  [SHEET_NAMES.SETTINGS]: [
    'setting_id', 'user_id', 'setting_key', 'setting_value', 'updated_at'
  ]
};

/**
 * Retrieves the active Spreadsheet instance using Script Properties or fallback ID.
 */
function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties();
  const spreadsheetId = props.getProperty('SPREADSHEET_ID') || APP_CONFIG.DEFAULT_SPREADSHEET_ID;
  if (!spreadsheetId) {
    throw createAppError('CONFIG_ERROR', 'SPREADSHEET_ID is not configured in Script Properties.', 500);
  }
  return SpreadsheetApp.openById(spreadsheetId);
}

/**
 * Retrieves application secret pepper used for HMAC hashing.
 */
function getPepperSecret() {
  const props = PropertiesService.getScriptProperties();
  let pepper = props.getProperty('AUTH_PEPPER_SECRET');
  if (!pepper) {
    pepper = 'pfm_pro_default_pepper_' + APP_CONFIG.DEFAULT_SPREADSHEET_ID;
    props.setProperty('AUTH_PEPPER_SECRET', pepper);
  }
  return pepper;
}

