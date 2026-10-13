/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: Code.gs
 * Description: Main API Router (doGet / doPost) with unified JSON response envelope,
 *              request tracing, authentication enforcement, and safe error handling.
 */

const PUBLIC_ACTIONS = [
  'system.ping',
  'system.setup',
  'auth.register',
  'auth.login'
];

/**
 * Handles HTTP GET requests (Health check / API status).
 */
function doGet(e) {
  const requestId = generateId('req');
  const action = (e && e.parameter && e.parameter.action) ? e.parameter.action : 'system.ping';

  try {
    if (action === 'system.ping') {
      return createJsonResponse({
        ok: true,
        request_id: requestId,
        action: 'system.ping',
        timestamp: nowIso(),
        data: {
          service: APP_CONFIG.APP_NAME,
          version: APP_CONFIG.VERSION,
          status: 'healthy'
        }
      });
    }
    return createJsonResponse({
      ok: false,
      request_id: requestId,
      action: action,
      timestamp: nowIso(),
      error: {
        code: 'METHOD_NOT_ALLOWED',
        message: 'กรุณาเรียกใช้งาน API ผ่าน HTTP POST'
      }
    });
  } catch (err) {
    return createErrorResponse(requestId, action, err);
  }
}

/**
 * Handles HTTP POST requests from Standalone Frontend.
 * Supports JSON payload sent with Content-Type: text/plain;charset=utf-8 to avoid GAS CORS preflight issues.
 */
function doPost(e) {
  const requestId = generateId('req');
  let action = 'unknown';

  try {
    if (!e || !e.postData || !e.postData.contents) {
      throw createAppError('BAD_REQUEST', 'ไม่พบข้อมูล JSON Payload ในคำขอ', 400);
    }

    let payload;
    try {
      payload = JSON.parse(e.postData.contents);
    } catch (parseErr) {
      throw createAppError('INVALID_JSON', 'รูปแบบ JSON ในคำขอไม่ถูกต้อง', 400);
    }

    action = requireString(payload.action, 'API Action (action)', 80);
    const params = payload.params || {};
    const ctx = {
      requestId: requestId,
      action: action,
      user: null
    };

    // Enforce authentication on all non-public actions
    if (PUBLIC_ACTIONS.indexOf(action) === -1) {
      ctx.user = authenticateRequest(payload);
    }

    const resultData = routeAction(ctx, action, params);

    return createJsonResponse({
      ok: true,
      request_id: requestId,
      action: action,
      timestamp: nowIso(),
      data: resultData
    });
  } catch (err) {
    return createErrorResponse(requestId, action, err);
  }
}

/**
 * Dispatches validated action to the corresponding domain service handler.
 */
function routeAction(ctx, action, params) {
  switch (action) {
    // System & Setup
    case 'system.ping':
      return {
        service: APP_CONFIG.APP_NAME,
        version: APP_CONFIG.VERSION,
        status: 'healthy'
      };
    case 'system.setup':
      return setupDatabase();
    case 'system.backupExport':
      return handleSystemBackupExport(ctx);
    case 'system.backupRestore':
      return handleSystemBackupRestore(ctx, params);
    case 'system.auditLogs':
      return handleSystemAuditLogs(ctx, params);

    // Authentication & User Profile
    case 'auth.register':
      return handleAuthRegister(ctx, params);
    case 'auth.login':
      return handleAuthLogin(ctx, params);
    case 'auth.logout':
      return handleAuthLogout(ctx);
    case 'auth.me':
      return { user: sanitizeUser(ctx.user) };
    case 'auth.updateProfile':
      return handleAuthUpdateProfile(ctx, params);

    // Categories
    case 'categories.list':
      return handleCategoriesList(ctx, params);
    case 'categories.create':
      return handleCategoriesCreate(ctx, params);
    case 'categories.update':
      return handleCategoriesUpdate(ctx, params);

    // Accounts
    case 'accounts.list':
      return handleAccountsList(ctx, params);
    case 'accounts.create':
      return handleAccountsCreate(ctx, params);
    case 'accounts.update':
      return handleAccountsUpdate(ctx, params);
    case 'accounts.reconcile':
      return handleAccountsReconcile(ctx, params);
    case 'accounts.balanceHistory':
      return handleAccountsBalanceHistory(ctx, params);

    // Transactions
    case 'transactions.list':
      return handleTransactionsList(ctx, params);
    case 'transactions.create':
      return handleTransactionsCreate(ctx, params);
    case 'transactions.update':
      return handleTransactionsUpdate(ctx, params);
    case 'transactions.void':
      return handleTransactionsVoid(ctx, params);
    case 'transactions.importCsvPreview':
      return handleTransactionsImportPreview(ctx, params);
    case 'transactions.importCsvCommit':
      return handleTransactionsImportCommit(ctx, params);

    // Dashboard
    case 'dashboard.summary':
      return handleDashboardSummary(ctx, params);

    // Phase 2: Budgets (Module D)
    case 'budgets.list':
      return handleBudgetsList(ctx, params);
    case 'budgets.create':
      return handleBudgetsCreate(ctx, params);
    case 'budgets.update':
      return handleBudgetsUpdate(ctx, params);
    case 'budgets.delete':
      return handleBudgetsDelete(ctx, params);

    // Phase 2: Savings Goals (Module E)
    case 'goals.list':
      return handleGoalsList(ctx, params);
    case 'goals.create':
      return handleGoalsCreate(ctx, params);
    case 'goals.update':
      return handleGoalsUpdate(ctx, params);
    case 'goals.contribute':
      return handleGoalsContribute(ctx, params);

    // Phase 2: Recurring Transactions (Module F)
    case 'recurring.list':
      return handleRecurringList(ctx, params);
    case 'recurring.create':
      return handleRecurringCreate(ctx, params);
    case 'recurring.update':
      return handleRecurringUpdate(ctx, params);
    case 'recurring.processDue':
      return handleRecurringProcessDue(ctx, params);

    // Phase 2: Reports & Analytics (Module H)
    case 'reports.overview':
      return handleReportsOverview(ctx, params);

    // Phase 3: Debts, Amortization & Credit Cards (Module G)
    case 'debts.list':
      return handleDebtsList(ctx, params);
    case 'debts.create':
      return handleDebtsCreate(ctx, params);
    case 'debts.update':
      return handleDebtsUpdate(ctx, params);
    case 'debts.pay':
      return handleDebtsPay(ctx, params);
    case 'debts.payCreditCard':
      return handleDebtsPayCreditCard(ctx, params);
    case 'debts.amortization':
      return handleDebtsAmortization(ctx, params);

    // Phase 3: Bills & Reminders (Module G) + Import History (Module I)
    case 'bills.list':
      return handleBillsList(ctx, params);
    case 'bills.create':
      return handleBillsCreate(ctx, params);
    case 'bills.update':
      return handleBillsUpdate(ctx, params);
    case 'bills.pay':
      return handleBillsPay(ctx, params);
    case 'imports.list':
      return handleImportsList(ctx, params);

    // Phase 3: Smart Alerts & Notifications
    case 'notifications.list':
      return handleNotificationsList(ctx, params);
    case 'notifications.generateAlerts':
      return handleNotificationsGenerateAlerts(ctx, params);
    case 'notifications.markRead':
      return handleNotificationsMarkRead(ctx, params);

    // Phase 4: Smart Finance, Automation Rules & Anomaly Analytics (Module J)
    case 'rules.list':
      return handleRulesList(ctx, params);
    case 'rules.create':
      return handleRulesCreate(ctx, params);
    case 'rules.update':
      return handleRulesUpdate(ctx, params);
    case 'rules.delete':
      return handleRulesDelete(ctx, params);
    case 'rules.evaluate':
      return handleRulesEvaluate(ctx, params);
    case 'analytics.insights':
      return handleSmartAnalyticsInsights(ctx, params);
    case 'automation.sendReminder':
      return handleSmartSendReminderExternal(ctx, params);

    default:
      throw createAppError('UNKNOWN_ACTION', 'ไม่รองรับคำสั่ง API Action: ' + action, 404);
  }
}

/**
 * Formats a standard JSON ContentService output.
 */
function createJsonResponse(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

/**
 * Formats an error response without leaking internal stack traces or secrets.
 */
function createErrorResponse(requestId, action, err) {
  const isKnown = Boolean(err && err.isAppError);
  const code = isKnown ? err.code : 'INTERNAL_ERROR';
  const message = isKnown
    ? err.message
    : 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง (อ้างอิง: ' + requestId + ')';

  if (!isKnown) {
    Logger.log('[ERROR ' + requestId + '] ' + (err && err.stack ? err.stack : String(err)));
  }

  return createJsonResponse({
    ok: false,
    request_id: requestId,
    action: action,
    timestamp: nowIso(),
    error: {
      code: code,
      message: message,
      details: isKnown ? (err.details || null) : null
    }
  });
}

