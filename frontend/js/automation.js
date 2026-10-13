/**
 * ============================================================================
 * PERSONAL FINANCE MANAGER PRO - PHASE 4: SMART FINANCE & AUTOMATION UI
 * ============================================================================
 * Covers:
 * - Smart Categorization Rules (CRUD, Active Toggle, Live Test Evaluator)
 * - Spending Anomaly Detection & Trend Analysis (Real Historical Data vs Current)
 * - 30 / 60 / 90-Day Cashflow Forecast (Projected Income, Expense, Recurring, Bills, Debts)
 * - Budget & Savings Goal Risk Radar
 * - Email (Gmail) & Google Calendar Reminder Dispatch
 * Note: Strictly excludes external Bank API / OAuth per security policy.
 * ============================================================================
 */

window.PFM_AUTOMATION = {
  state: {
    rules: [],
    insights: null
  },

  init() {
    const remDateEl = document.getElementById("reminderDate");
    if (remDateEl && !remDateEl.value) {
      remDateEl.value = new Date().toISOString().slice(0, 10);
    }
  },

  async loadAll() {
    this.init();
    await Promise.all([
      this.loadRules(),
      this.loadInsights()
    ]);
  },

  async loadRules() {
    try {
      const res = await window.PFM_API.call("rules.list", {});
      this.state.rules = (res && res.rules) || [];
      this.renderRules();
    } catch (err) {
      this.showToast(err.message || "ไม่สามารถโหลดกฎอัตโนมัติได้", "danger");
    }
  },

  async loadInsights() {
    try {
      const res = await window.PFM_API.call("analytics.insights", {});
      this.state.insights = res || {};
      this.renderInsights();
    } catch (err) {
      this.showToast(err.message || "ไม่สามารถโหลดข้อมูลวิเคราะห์อัจฉริยะได้", "danger");
    }
  },

  renderRules() {
    const rules = this.state.rules || [];
    const countBadge = document.getElementById("smartRuleCountBadge");
    if (countBadge) {
      const activeCount = rules.filter(r => String(r.is_active).toUpperCase() !== "FALSE").length;
      countBadge.textContent = `${activeCount}/${rules.length} กฎที่เปิดใช้งาน`;
    }

    const tbody = document.getElementById("smartRulesTableBody");
    if (!tbody) return;

    if (rules.length === 0) {
      tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted py-4">ยังไม่มีกฎอัตโนมัติ กด "+ เพิ่มกฎจัดหมวดหมู่อัตโนมัติ" เพื่อสร้างกฎใหม่</td></tr>`;
      return;
    }

    tbody.innerHTML = rules.map(r => {
      const isActive = String(r.is_active).toUpperCase() !== "FALSE";
      const opVal = r.match_operator || r.match_type || "contains";
      const patternVal = r.match_value || r.pattern_value || "";
      const catName = r.assign_category_name || r.target_category_name || r.assign_category_id || r.target_category_id || "-";
      const tagsVal = r.assign_tags || r.auto_tags || "";

      const matchBadge = {
        contains: "มีคำว่า (Contains)",
        starts_with: "ขึ้นต้นด้วย (Starts With)",
        equals: "ตรงกันทุกตัวอักษร (Exact)",
        exact: "ตรงกันทุกตัวอักษร (Exact)",
        regex: "Regex"
      }[opVal] || opVal;

      return `
        <tr>
          <td class="ps-3">
            <div class="fw-semibold">${this.escapeHtml(r.rule_name)}</div>
            <div class="small text-muted">ลำดับความสำคัญ: #${r.priority || 10}</div>
          </td>
          <td>
            <span class="badge bg-secondary bg-opacity-10 text-secondary border me-1">${matchBadge}</span>
            <code class="fw-bold text-primary">${this.escapeHtml(patternVal)}</code>
          </td>
          <td>
            <span class="badge rounded-pill bg-primary">
              ${this.escapeHtml(catName)}
            </span>
          </td>
          <td>
            ${tagsVal ? `<span class="badge bg-info bg-opacity-10 text-info border border-info">${this.escapeHtml(tagsVal)}</span>` : `<span class="text-muted small">-</span>`}
          </td>
          <td class="text-center">
            <div class="form-check form-switch d-inline-block mb-0">
              <input class="form-check-input" type="checkbox" role="switch" ${isActive ? "checked" : ""}
                onchange="window.PFM_AUTOMATION.toggleRuleActive('${r.rule_id}', this.checked)">
            </div>
          </td>
          <td class="text-end pe-3">
            <button class="btn btn-sm btn-outline-danger py-0 px-2" onclick="window.PFM_AUTOMATION.deleteRule('${r.rule_id}', '${this.escapeHtml(r.rule_name)}')">
              <i class="bi bi-trash"></i>
            </button>
          </td>
        </tr>
      `;
    }).join("");
  },

  renderInsights() {
    const data = this.state.insights;
    if (!data) return;

    // 1. Render 30 / 60 / 90-Day Cashflow Forecast Cards
    const fcMap = data.cashflow_forecasts || (data.cashflow_forecast && data.cashflow_forecast.horizons) || {};
    const startCash = data.starting_liquid_balance ?? (data.cashflow_forecast && data.cashflow_forecast.current_liquid_balance) ?? 0;
    const fcContainer = document.getElementById("cashflowForecastCards");
    if (fcContainer) {
      const h30 = fcMap.days_30 || {};
      const h60 = fcMap.days_60 || {};
      const h90 = fcMap.days_90 || {};

      const renderHorizonCard = (title, h, iconClass) => {
        const endCash = h.projected_ending_cash ?? 0;
        const netFlow = h.projected_net_cashflow ?? h.projected_net_flow ?? 0;
        const expInc = h.expected_income ?? 0;
        const recExp = h.expected_recurring_expense ?? h.expected_baseline_expense ?? 0;
        const billsAndDebt = (h.unpaid_bills_due ?? h.committed_bills ?? 0) + (h.debt_service_commitments ?? h.committed_debt_payments ?? 0) + (h.committed_recurring_expense ?? 0);
        const daysNum = h.horizon_days || h.days || 30;
        const isSafe = endCash >= 0;

        const statusBadge = isSafe
          ? `<span class="badge bg-success"><i class="bi bi-shield-check me-1"></i>สภาพคล่องปกติ</span>`
          : `<span class="badge bg-danger"><i class="bi bi-exclamation-octagon me-1"></i>เสี่ยงเงินสดติดลบ</span>`;

        return `
          <div class="col-md-4">
            <div class="card border-0 shadow-sm h-100">
              <div class="card-body">
                <div class="d-flex justify-content-between align-items-center mb-2">
                  <span class="fw-bold text-secondary"><i class="bi ${iconClass} me-1 text-primary"></i>${title}</span>
                  ${statusBadge}
                </div>
                <h4 class="fw-bold mb-2 ${endCash >= 0 ? 'text-primary' : 'text-danger'}">
                  ${this.formatCurrency(endCash)}
                </h4>
                <div class="small text-muted mb-2">ยอดสภาพคล่องคาดการณ์ปลายงวด (จากปัจจุบัน ${this.formatCurrency(startCash)})</div>
                <hr class="my-2">
                <div class="d-flex justify-content-between small mb-1">
                  <span class="text-muted">รายรับประจำคาดการณ์:</span>
                  <span class="text-success fw-semibold">+${this.formatCurrency(expInc)}</span>
                </div>
                <div class="d-flex justify-content-between small mb-1">
                  <span class="text-muted">รายจ่ายประจำคาดการณ์:</span>
                  <span class="text-danger">-${this.formatCurrency(recExp)}</span>
                </div>
                <div class="d-flex justify-content-between small mb-1">
                  <span class="text-muted">บิลรอชำระ + ภาระหนี้สิน:</span>
                  <span class="text-warning fw-semibold">-${this.formatCurrency(billsAndDebt)}</span>
                </div>
                <div class="d-flex justify-content-between small pt-1 border-top mt-1">
                  <span class="fw-semibold">กระแสเงินสดสุทธิ (${daysNum} วัน):</span>
                  <span class="fw-bold ${netFlow >= 0 ? 'text-success' : 'text-danger'}">
                    ${netFlow >= 0 ? '+' : ''}${this.formatCurrency(netFlow)}
                  </span>
                </div>
              </div>
            </div>
          </div>
        `;
      };

      fcContainer.innerHTML =
        renderHorizonCard("คาดการณ์ 30 วันข้างหน้า", h30, "bi-calendar2-week") +
        renderHorizonCard("คาดการณ์ 60 วันข้างหน้า", h60, "bi-calendar2-month") +
        renderHorizonCard("คาดการณ์ 90 วันข้างหน้า", h90, "bi-calendar3");
    }

    // 2. Render Spending Anomalies Table
    const anomalies = data.anomalies_detected || data.spending_anomalies || [];
    const anomalyBadge = document.getElementById("anomalyCountBadge");
    if (anomalyBadge) {
      const warnCount = anomalies.length;
      anomalyBadge.className = `badge ${warnCount > 0 ? 'bg-danger' : 'bg-success'}`;
      anomalyBadge.textContent = warnCount > 0 ? `พบ ${warnCount} รายการสูงผิดปกติ` : "ไม่พบรายจ่ายผิดปกติ";
    }

    const anomalyTbody = document.getElementById("anomalyTableBody");
    if (anomalyTbody) {
      if (anomalies.length === 0) {
        anomalyTbody.innerHTML = `<tr><td colspan="5" class="text-center text-muted py-4">ไม่พบรายการใช้จ่ายที่สูงผิดปกติเมื่อเทียบกับค่าเฉลี่ยย้อนหลัง</td></tr>`;
      } else {
        anomalyTbody.innerHTML = anomalies.map(a => {
          const itemLabel = a.merchant ? `${a.category_name} (${a.merchant})` : a.category_name;
          const spentAmt = a.amount ?? a.current_month_spent ?? 0;
          const avgAmt = a.category_average ?? a.historical_monthly_avg ?? 0;
          const mult = a.multiplier_vs_avg ? `${a.multiplier_vs_avg}x ของค่าเฉลี่ย` : `+${a.spike_percentage || 0}%`;
          const reasonText = a.reason || a.recommendation || "";

          return `
            <tr class="table-warning bg-opacity-10">
              <td class="ps-3 fw-semibold">${this.escapeHtml(itemLabel)}</td>
              <td class="text-end fw-bold text-danger">${this.formatCurrency(spentAmt)}</td>
              <td class="text-end text-muted">${this.formatCurrency(avgAmt)}</td>
              <td class="text-center"><span class="badge bg-danger"><i class="bi bi-graph-up-arrow me-1"></i>${this.escapeHtml(mult)}</span></td>
              <td class="pe-3 small text-muted">${this.escapeHtml(reasonText)}</td>
            </tr>
          `;
        }).join("");
      }
    }

    // 3. Render Risk Radar (At-Risk Budgets & Savings Goals)
    const riskRadarEl = document.getElementById("smartRiskRadarList");
    if (riskRadarEl) {
      const bRisks = (data.risk_radar && data.risk_radar.at_risk_budgets) || data.budget_risks || [];
      const gRisks = (data.risk_radar && data.risk_radar.at_risk_goals) || data.goal_risks || [];

      if (bRisks.length === 0 && gRisks.length === 0) {
        riskRadarEl.innerHTML = `
          <div class="text-center text-muted py-4">
            <i class="bi bi-check2-circle fs-2 text-success d-block mb-2"></i>
            งบประมาณและเป้าหมายการออมทั้งหมดอยู่ในเกณฑ์ปลอดภัย
          </div>
        `;
      } else {
        let html = "";
        bRisks.forEach(b => {
          const st = b.status || b.risk_level || "warning";
          const pct = b.used_pct ?? b.usage_pct ?? 0;
          const limit = b.effective_limit ?? b.budget_amount ?? 0;
          const badgeClass = (st === "over_budget" || st === "EXCEEDED" || st === "exceeded") ? "bg-danger" : "bg-warning text-dark";
          html += `
            <div class="p-3 border rounded-3 mb-2 bg-light bg-opacity-50">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold"><i class="bi bi-pie-chart-fill text-danger me-1"></i>งบประมาณ: ${this.escapeHtml(b.budget_name)}</span>
                <span class="badge ${badgeClass}">${this.escapeHtml(st)} (${pct}%)</span>
              </div>
              <div class="small text-muted">
                ใช้จริง ${this.formatCurrency(b.spent_amount)} / วงเงิน ${this.formatCurrency(limit)}
                • คงเหลือ: <strong class="text-danger">${this.formatCurrency(b.remaining_amount ?? (limit - b.spent_amount))}</strong>
              </div>
            </div>
          `;
        });

        gRisks.forEach(g => {
          const st = g.risk_status || g.risk_level || "at_risk";
          const reqMonth = g.required_monthly_saving ?? g.required_per_month ?? 0;
          const badgeClass = (st === "OVERDUE" || st === "behind") ? "bg-danger" : "bg-warning text-dark";
          html += `
            <div class="p-3 border rounded-3 mb-2 bg-light bg-opacity-50">
              <div class="d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold"><i class="bi bi-bullseye text-primary me-1"></i>เป้าหมายออม: ${this.escapeHtml(g.goal_name)}</span>
                <span class="badge ${badgeClass}">${this.escapeHtml(st)} (${g.progress_pct}%)</span>
              </div>
              <div class="small text-muted">
                ขาดอีก ${this.formatCurrency(g.remaining_amount)} (ครบกำหนด ${g.target_date || '-'})
                • ต้องออมเดือนละ <strong class="text-primary">${this.formatCurrency(reqMonth)}/เดือน</strong>
              </div>
            </div>
          `;
        });

        riskRadarEl.innerHTML = html;
      }
    }
  },

  openRuleModal() {
    const form = document.getElementById("ruleForm");
    if (form) form.reset();

    const catSelect = document.getElementById("ruleTargetCategory");
    const categories = (window.PFM_APP && window.PFM_APP.categories) || [];
    if (catSelect) {
      catSelect.innerHTML = categories
        .filter(c => String(c.is_active).toUpperCase() !== "FALSE")
        .map(c => {
          const typeLabel = (c.category_type || c.type) === "income" ? "รายรับ" : "รายจ่าย";
          return `<option value="${c.category_id}">[${typeLabel}] ${this.escapeHtml(c.category_name)}</option>`;
        })
        .join("");
    }

    const modalEl = document.getElementById("ruleModal");
    if (modalEl) {
      const m = bootstrap.Modal.getOrCreateInstance(modalEl);
      m.show();
    }
  },

  showToast(msg, type = "info") {
    if (window.PFM_APP && typeof window.PFM_APP.toast === "function") {
      window.PFM_APP.toast(msg, type);
    } else if (window.PFM_UI && typeof window.PFM_UI.showToast === "function") {
      window.PFM_UI.showToast(msg, type);
    }
  },

  async saveRule(e) {
    e.preventDefault();
    const opVal = document.getElementById("ruleMatchType").value;
    const patVal = document.getElementById("rulePatternValue").value.trim();
    const catVal = document.getElementById("ruleTargetCategory").value;
    const tagsVal = document.getElementById("ruleAutoTags").value.trim();

    const payload = {
      rule_name: document.getElementById("ruleName").value.trim(),
      match_field: "any_text",
      match_operator: opVal === "exact" ? "equals" : opVal,
      match_type: opVal,
      match_value: patVal,
      pattern_value: patVal,
      assign_category_id: catVal,
      target_category_id: catVal,
      assign_tags: tagsVal,
      auto_tags: tagsVal,
      priority: Number(document.getElementById("rulePriority").value || 10),
      is_active: true
    };

    try {
      await window.PFM_API.call("rules.create", payload);
      const modalEl = document.getElementById("ruleModal");
      if (modalEl) bootstrap.Modal.getInstance(modalEl)?.hide();
      this.showToast("บันทึกกฎจัดหมวดหมู่อัตโนมัติเรียบร้อยแล้ว", "success");
      await this.loadRules();
    } catch (err) {
      this.showToast(err.message || "ไม่สามารถบันทึกกฎได้", "danger");
    }
  },

  async toggleRuleActive(ruleId, isActive) {
    try {
      await window.PFM_API.call("rules.update", {
        rule_id: ruleId,
        is_active: isActive
      });
      this.showToast(isActive ? "เปิดใช้งานกฎอัตโนมัติแล้ว" : "ปิดใช้งานกฎอัตโนมัติแล้ว", "info");
      await this.loadRules();
    } catch (err) {
      this.showToast(err.message || "อัปเดตสถานะกฎไม่สำเร็จ", "danger");
      await this.loadRules();
    }
  },

  async deleteRule(ruleId, ruleName) {
    if (!confirm(`ยืนยันการลบกฎอัตโนมัติ "${ruleName}" ?`)) return;
    try {
      await window.PFM_API.call("rules.delete", { rule_id: ruleId });
      this.showToast("ลบกฎอัตโนมัติเรียบร้อยแล้ว", "success");
      await this.loadRules();
    } catch (err) {
      this.showToast(err.message || "ลบกฎไม่สำเร็จ", "danger");
    }
  },

  async testRuleEvaluator() {
    const textEl = document.getElementById("ruleTestInput");
    const resultEl = document.getElementById("ruleTestResult");
    if (!textEl || !resultEl) return;

    const note = textEl.value.trim();
    if (!note) {
      resultEl.innerHTML = `<span class="text-warning">กรุณาพิมพ์ข้อความรายการหรือชื่อร้านค้าเพื่อทดสอบ</span>`;
      return;
    }

    try {
      const res = await window.PFM_API.call("rules.evaluate", {
        merchant: note,
        description: note,
        note: note,
        tx_type: "expense"
      });
      if (res && (res.matched_by === "user_rule" || res.matched)) {
        resultEl.innerHTML = `
          <span class="text-success fw-semibold">
            <i class="bi bi-check-circle-fill me-1"></i>ตรงกับกฎ "${this.escapeHtml(res.rule_name)}"
            → หมวดหมู่: <span class="badge bg-primary">${this.escapeHtml(res.suggested_category_name || res.suggested_category_id)}</span>
            ${res.suggested_tags ? `• แท็ก: <span class="badge bg-info text-dark">${this.escapeHtml(res.suggested_tags)}</span>` : ""}
          </span>
        `;
      } else {
        resultEl.innerHTML = `<span class="text-muted"><i class="bi bi-info-circle me-1"></i>ไม่ตรงกับกฎผู้ใช้ที่เปิดใช้งานอยู่ (คำแนะนำพื้นฐาน: ${this.escapeHtml(res.suggested_category_id || '-')})</span>`;
      }
    } catch (err) {
      resultEl.innerHTML = `<span class="text-danger">${this.escapeHtml(err.message || "เกิดข้อผิดพลาดในการทดสอบกฎ")}</span>`;
    }
  },

  /**
   * Used inside the Transaction Modal when user clicks "แนะนำหมวดหมู่อัตโนมัติ"
   */
  async suggestCategoryForTransactionModal() {
    const merchantEl = document.getElementById("txMerchant");
    const descEl = document.getElementById("txDescription");
    const typeEl = document.getElementById("txType");
    const catEl = document.getElementById("txCategory");
    const tagsEl = document.getElementById("txTags");

    const merchant = merchantEl ? merchantEl.value.trim() : "";
    const desc = descEl ? descEl.value.trim() : "";
    const combinedNote = `${merchant} ${desc}`.trim();

    if (!combinedNote) {
      this.showToast("กรุณากรอกชื่อร้านค้าหรือหมายเหตุก่อนเพื่อให้ระบบแนะนำหมวดหมู่", "warning");
      return;
    }

    try {
      const res = await window.PFM_API.call("rules.evaluate", {
        merchant: merchant || combinedNote,
        description: desc || combinedNote,
        note: combinedNote,
        tx_type: typeEl ? typeEl.value : "expense"
      });

      if (res && res.suggested_category_id) {
        if (catEl) {
          catEl.value = res.suggested_category_id;
          catEl.dispatchEvent(new Event("change"));
        }
        if (tagsEl && res.suggested_tags && !tagsEl.value.trim()) {
          tagsEl.value = res.suggested_tags;
        }
        this.showToast(`แนะนำหมวดหมู่อัตโนมัติสำเร็จ (${res.rule_name || res.suggested_category_id})`, "success");
      } else {
        this.showToast("ไม่พบกฎที่ตรงกับข้อความนี้ สามารถเพิ่มกฎใหม่ได้ที่เมนู Smart Finance", "info");
      }
    } catch (err) {
      this.showToast(err.message || "ไม่สามารถประมวลผลกฎอัตโนมัติได้", "danger");
    }
  },

  async sendReminderDispatch(e) {
    e.preventDefault();
    const channel = document.getElementById("reminderChannel").value;
    const recipientEmail = document.getElementById("reminderEmail").value.trim();
    const reminderDate = document.getElementById("reminderDate").value;
    const subject = document.getElementById("reminderSubject").value.trim();

    const btn = document.getElementById("btnSendReminder");
    if (btn) btn.disabled = true;

    try {
      const res = await window.PFM_API.call("automation.sendReminder", {
        channel,
        recipient_email: recipientEmail,
        reminder_date: reminderDate,
        event_date: reminderDate,
        title: subject,
        subject: subject,
        message: `แจ้งเตือนสถานะบิลและงบประมาณไปยัง ${recipientEmail}`
      });

      const statusEl = document.getElementById("reminderDispatchStatus");
      if (res) {
        this.showToast("บันทึกและจัดส่งการแจ้งเตือนอัตโนมัติเรียบร้อยแล้ว", "success");
        if (statusEl) {
          statusEl.innerHTML = `
            <div class="alert alert-success py-2 px-3 small mb-0 mt-2">
              <i class="bi bi-check-circle-fill me-1"></i>
              <strong>สำเร็จ:</strong> ช่องทาง <code>${this.escapeHtml(res.channel)}</code> •
              ผู้รับ: <code>${this.escapeHtml(recipientEmail)}</code> •
              ${this.escapeHtml(res.detail || "บันทึกใน Audit_Logs และ Notifications เรียบร้อย")}
            </div>
          `;
        }
        if (window.PFM_NOTIFICATIONS) {
          await window.PFM_NOTIFICATIONS.loadNotifications();
        }
      }
    } catch (err) {
      this.showToast(err.message || "ส่งการแจ้งเตือนไม่สำเร็จ", "danger");
    } finally {
      if (btn) btn.disabled = false;
    }
  },

  formatCurrency(val) {
    const num = Number(val) || 0;
    return num.toLocaleString("th-TH", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " ฿";
  },

  escapeHtml(str) {
    return String(str ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }
};

