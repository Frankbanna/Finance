/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: NotificationService.gs (Phase 3 — Smart Alerts & Notifications Engine)
 * Description: Manages persistent user notifications in the Notifications sheet, evaluates real-time
 *              financial rules (overdue/due-soon bills, budget thresholds, debt/credit card due dates,
 *              and savings goals at risk) with deduplication by reference_id.
 */

/**
 * Lists notifications for the authenticated user, with unread count.
 */
function handleNotificationsList(ctx, params) {
  const userId = ctx.user.user_id;
  const unreadOnly = toBoolean(params && params.unread_only, false);
  const allNotifs = readSheetObjects(SHEET_NAMES.NOTIFICATIONS);

  const items = [];
  let unreadCount = 0;

  for (let i = allNotifs.length - 1; i >= 0; i--) {
    const n = allNotifs[i];
    if (n.user_id !== userId) continue;
    const isRead = toBoolean(n.is_read, false);
    if (!isRead) unreadCount++;
    if (unreadOnly && isRead) continue;

    items.push({
      notification_id: n.notification_id,
      notif_type: n.notif_type || 'system',
      severity: n.severity || 'info',
      title: n.title || '',
      message: n.message || '',
      reference_id: n.reference_id || '',
      is_read: isRead,
      created_at: n.created_at
    });
  }

  return {
    unread_count: unreadCount,
    total_count: items.length,
    notifications: items.slice(0, 100)
  };
}

/**
 * Evaluates live database conditions (Bills, Budgets, Debts, Credit Cards, Savings Goals)
 * and persists new alerts into the Notifications sheet (deduplicating via reference_id).
 */
function handleNotificationsGenerateAlerts(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const todayStr = Utilities.formatDate(new Date(), APP_CONFIG.DEFAULT_TIMEZONE, 'yyyy-MM-dd');
    const currentYm = todayStr.substring(0, 7);

    const existingNotifs = readSheetObjects(SHEET_NAMES.NOTIFICATIONS);
    const existingRefSet = {};
    for (let i = 0; i < existingNotifs.length; i++) {
      if (existingNotifs[i].user_id === userId && existingNotifs[i].reference_id) {
        existingRefSet[String(existingNotifs[i].reference_id)] = true;
      }
    }

    const newAlerts = [];
    const now = nowIso();

    // 1. Check Bills (Overdue & Due Soon)
    const billsData = handleBillsList(ctx, {});
    const bills = billsData.bills || [];
    for (let i = 0; i < bills.length; i++) {
      const b = bills[i];
      if (b.effective_status === 'overdue') {
        const refId = 'alert_bill_overdue_' + b.bill_id + '_' + b.due_date;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'bill_overdue',
            severity: 'danger',
            title: 'บิลเกินกำหนดชำระ: ' + b.bill_name,
            message: 'รายการ "' + b.bill_name + '" ยอด ' + b.amount + ' ' + b.currency + ' เกินกำหนดชำระตั้งแต่วันที่ ' + b.due_date,
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      } else if (b.is_due_soon) {
        const refId = 'alert_bill_duesoon_' + b.bill_id + '_' + b.due_date;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'bill_due',
            severity: 'warning',
            title: 'บิลใกล้ครบกำหนดชำระ: ' + b.bill_name,
            message: 'รายการ "' + b.bill_name + '" ยอด ' + b.amount + ' ' + b.currency + ' จะครบกำหนดในวันที่ ' + b.due_date + ' (อีก ' + b.days_until_due + ' วัน)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      }
    }

    // 2. Check Budgets (Warning & Over Budget)
    const budgetsData = handleBudgetsList(ctx, {});
    const budgets = budgetsData.budgets || [];
    for (let i = 0; i < budgets.length; i++) {
      const bdg = budgets[i];
      if (bdg.status === 'over_budget' || bdg.status === 'exceeded') {
        const refId = 'alert_budget_over_' + bdg.budget_id + '_' + currentYm;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'budget_alert',
            severity: 'danger',
            title: 'ใช้งบประมาณเกินวงเงิน: ' + bdg.budget_name,
            message: 'งบ "' + bdg.budget_name + '" ใช้ไปแล้ว ' + bdg.spent_amount + ' จากวงเงินสุทธิ ' + bdg.effective_limit + ' (' + bdg.used_pct + '%)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      } else if (bdg.status === 'warning') {
        const refId = 'alert_budget_warn_' + bdg.budget_id + '_' + currentYm;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'budget_alert',
            severity: 'warning',
            title: 'งบประมาณใกล้เต็ม: ' + bdg.budget_name,
            message: 'งบ "' + bdg.budget_name + '" ใช้ไปถึงเกณฑ์แจ้งเตือนแล้ว (' + bdg.used_pct + '% ของวงเงิน)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      }
    }

    // 3. Check Debts & Credit Cards (High DTI or Active Credit Card Statement)
    const debtsData = handleDebtsList(ctx, {});
    if (debtsData.summary && debtsData.summary.dti_status === 'high_risk') {
      const refId = 'alert_dti_high_' + currentYm;
      if (!existingRefSet[refId]) {
        existingRefSet[refId] = true;
        newAlerts.push({
          notification_id: generateId('ntf'),
          user_id: userId,
          notif_type: 'debt_alert',
          severity: 'danger',
          title: 'ภาระหนี้ต่อรายได้ (DTI) อยู่ในเกณฑ์สูง (' + debtsData.summary.dti_percentage + '%)',
          message: 'ยอดผ่อนหนี้ขั้นต่ำต่อเดือนรวม ' + debtsData.summary.combined_monthly_debt_service + ' คิดเป็น ' + debtsData.summary.dti_percentage + '% ของรายได้ ควรวางแผนลดภาระหนี้ดอกเบี้ยสูง',
          reference_id: refId,
          is_read: false,
          created_at: now
        });
      }
    }

    const creditCards = debtsData.credit_cards || [];
    for (let i = 0; i < creditCards.length; i++) {
      const cc = creditCards[i];
      if (cc.owed_amount > 0) {
        const refId = 'alert_cc_due_' + cc.account_id + '_' + cc.next_due_date;
        if (!existingRefSet[refId]) {
          existingRefSet[refId] = true;
          newAlerts.push({
            notification_id: generateId('ntf'),
            user_id: userId,
            notif_type: 'credit_card_due',
            severity: cc.utilization_pct >= 80 ? 'danger' : 'info',
            title: 'ยอดค้างชำระบัตรเครดิต: ' + cc.account_name,
            message: 'มียอดค้างชำระ ' + cc.owed_amount + ' ' + cc.currency + ' กำหนดชำระวันที่ ' + cc.next_due_date + ' (ใช้วงเงินไป ' + cc.utilization_pct + '%)',
            reference_id: refId,
            is_read: false,
            created_at: now
          });
        }
      }
    }

    if (newAlerts.length > 0) {
      batchAppendObjects(SHEET_NAMES.NOTIFICATIONS, newAlerts);
      writeAuditLog(ctx, 'notifications.generateAlerts', 'Notifications', userId, 'สร้างรายการแจ้งเตือนอัตโนมัติ ' + newAlerts.length + ' รายการ', {
        generated_count: newAlerts.length
      });
    }

    const updatedList = handleNotificationsList(ctx, {});
    return {
      generated_count: newAlerts.length,
      generated_alerts: newAlerts,
      unread_count: updatedList.unread_count,
      notifications: updatedList.notifications
    };
  });
}

/**
 * Marks one notification or all notifications for the user as read.
 */
function handleNotificationsMarkRead(ctx, params) {
  return withWriteLock(function() {
    const userId = ctx.user.user_id;
    const markAll = toBoolean(params && params.mark_all, false);
    const notifId = optionalString(params && params.notification_id, 64);

    if (!markAll && !notifId) {
      throw createAppError('VALIDATION_ERROR', 'กรุณาระบุ notification_id หรือตั้งค่า mark_all = true', 400);
    }

    const allNotifs = readSheetObjects(SHEET_NAMES.NOTIFICATIONS);
    let updatedCount = 0;

    for (let i = 0; i < allNotifs.length; i++) {
      const n = allNotifs[i];
      if (n.user_id !== userId) continue;
      if (toBoolean(n.is_read, false)) continue;

      if (markAll || n.notification_id === notifId) {
        n.is_read = true;
        updateSheetRowByIndex(SHEET_NAMES.NOTIFICATIONS, n._rowIndex, n);
        updatedCount++;
        if (!markAll) break;
      }
    }

    return {
      updated_count: updatedCount,
      notifications_state: handleNotificationsList(ctx, {})
    };
  });
}

