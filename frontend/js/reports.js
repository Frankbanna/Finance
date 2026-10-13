/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/reports.js (Phase 2 - Module H)
 * Description: Comprehensive financial reports & analytics:
 *              - Income & Expense by Category & Account
 *              - Cashflow & Net Worth
 *              - Monthly, Quarterly (Q1-Q4), and Yearly Comparisons
 *              - Explicit separation of Actuals vs Forecasted Projections
 *              - CSV Export & Print/PDF Report Generation
 */

window.PFM_REPORTS = {
  lastReport: null,
  periodChart: null,
  activeComparisonMode: 'monthly', // 'monthly' | 'quarterly' | 'yearly'

  init: function() {
    const now = new Date();
    const yr = now.getFullYear();
    const yrSelect = document.getElementById('repFilterYear');
    if (yrSelect) {
      yrSelect.innerHTML = [yr, yr - 1, yr - 2].map(y => `<option value="${y}">ปี ${y}</option>`).join('');
      yrSelect.value = String(yr);
    }

    const startEl = document.getElementById('repFilterStart');
    const endEl = document.getElementById('repFilterEnd');
    if (startEl && !startEl.value) startEl.value = `${yr}-01-01`;
    if (endEl && !endEl.value) endEl.value = `${yr}-12-31`;

    const form = document.getElementById('reportsFilterForm');
    if (form) {
      form.addEventListener('submit', (e) => {
        e.preventDefault();
        this.loadReports();
      });
    }
  },

  loadReports: async function() {
    const year = document.getElementById('repFilterYear').value;
    const startDate = document.getElementById('repFilterStart').value;
    const endDate = document.getElementById('repFilterEnd').value;
    const accountId = document.getElementById('repFilterAccount').value;

    try {
      const res = await PFM_API.call('reports.overview', {
        year: Number(year),
        start_date: startDate,
        end_date: endDate,
        account_id: accountId
      });
      this.lastReport = res;
      this.renderActualVsForecastBanner(res.actuals_summary, res.projections_summary, res.net_worth_report);
      this.renderComparisonSection(this.activeComparisonMode);
      this.renderCategoryAndAccountTables(res.category_report, res.account_report);
      this.renderBudgetAndGoalsSummary(res.budgets_vs_actual, res.savings_goals_summary);
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถสร้างรายงาน: ' + err.message, 'danger');
    }
  },

  switchComparisonMode: function(mode) {
    this.activeComparisonMode = mode;
    ['monthly', 'quarterly', 'yearly'].forEach(m => {
      const btn = document.getElementById('btnRepComp_' + m);
      if (btn) btn.classList.toggle('active', m === mode);
    });
    this.renderComparisonSection(mode);
  },

  renderActualVsForecastBanner: function(actuals, projections, netWorth) {
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';

    // Actuals (Real posted transactions)
    document.getElementById('repActualIncome').textContent = PFM_UTILS.formatCurrency(actuals.income, cur);
    document.getElementById('repActualExpense').textContent = PFM_UTILS.formatCurrency(actuals.net_expense, cur);
    document.getElementById('repActualNetCashflow').textContent = PFM_UTILS.formatCurrency(actuals.net_cashflow, cur);
    document.getElementById('repActualSavingsRate').textContent = `${actuals.savings_rate_pct.toFixed(1)}%`;

    // Net Worth
    document.getElementById('repNetWorthValue').textContent = PFM_UTILS.formatCurrency(netWorth.net_worth, cur);
    document.getElementById('repAssetsVsLiab').textContent =
      `สินทรัพย์: ${PFM_UTILS.formatCurrency(netWorth.total_assets, cur)} | หนี้สิน: ${PFM_UTILS.formatCurrency(netWorth.total_liabilities, cur)}`;

    // Projections (Separated 90-day Forecast from Recurring)
    document.getElementById('repProjIncome90d').textContent = PFM_UTILS.formatCurrency(projections.projected_income_90d, cur);
    document.getElementById('repProjExpense90d').textContent = PFM_UTILS.formatCurrency(projections.projected_expense_90d, cur);
    document.getElementById('repProjNet90d').textContent = PFM_UTILS.formatCurrency(projections.projected_net_90d, cur);
  },

  renderComparisonSection: function(mode) {
    if (!this.lastReport) return;
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';
    let rows = [];
    let labelKey = 'period';

    if (mode === 'quarterly') {
      rows = this.lastReport.quarterly_comparison || [];
      labelKey = 'label';
    } else if (mode === 'yearly') {
      rows = this.lastReport.yearly_comparison || [];
      labelKey = 'year';
    } else {
      rows = this.lastReport.monthly_comparison || [];
      labelKey = 'period';
    }

    // Render Comparison Chart
    const ctx = document.getElementById('chartReportComparison');
    if (ctx && window.Chart) {
      if (this.periodChart) this.periodChart.destroy();
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      const textColor = isDark ? '#CBD5E1' : '#475569';
      const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';

      this.periodChart = new Chart(ctx, {
        type: 'bar',
        data: {
          labels: rows.map(r => r[labelKey]),
          datasets: [
            {
              label: 'รายรับจริง (Actual Income)',
              data: rows.map(r => r.income),
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              borderRadius: 5
            },
            {
              label: 'รายจ่ายสุทธิจริง (Actual Net Expense)',
              data: rows.map(r => r.expense),
              backgroundColor: 'rgba(239, 68, 68, 0.8)',
              borderRadius: 5
            },
            {
              type: 'line',
              label: 'กระแสเงินสดสุทธิ (Net Cashflow)',
              data: rows.map(r => r.net),
              borderColor: '#2563EB',
              backgroundColor: '#2563EB',
              borderWidth: 2.5,
              tension: 0.25
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { labels: { color: textColor } } },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { color: gridColor } }
          }
        }
      });
    }

    // Render Comparison Table
    const tbody = document.getElementById('repComparisonTableBody');
    if (tbody) {
      tbody.innerHTML = rows.map(r => `
        <tr>
          <td class="fw-semibold">${PFM_UTILS.escapeHtml(r[labelKey])}</td>
          <td class="text-end amount-income fw-semibold">${PFM_UTILS.formatCurrency(r.income, cur)}</td>
          <td class="text-end amount-expense fw-semibold">${PFM_UTILS.formatCurrency(r.expense, cur)}</td>
          <td class="text-end fw-bold ${r.net >= 0 ? 'text-success' : 'text-danger'}">${PFM_UTILS.formatCurrency(r.net, cur)}</td>
        </tr>
      `).join('');
    }
  },

  renderCategoryAndAccountTables: function(catReport, accReport) {
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';

    const catBody = document.getElementById('repCategoryTableBody');
    if (catBody) {
      if (!catReport || catReport.length === 0) {
        catBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ไม่มีข้อมูลธุรกรรมในช่วงเวลาที่เลือก</td></tr>';
      } else {
        catBody.innerHTML = catReport.map(c => `
          <tr>
            <td>
              <span class="d-inline-block rounded-circle me-2" style="width:10px;height:10px;background:${PFM_UTILS.escapeHtml(c.color)}"></span>
              <span class="fw-semibold">${PFM_UTILS.escapeHtml(c.category_name)}</span>
            </td>
            <td class="text-center">${c.tx_count}</td>
            <td class="text-end amount-income">${PFM_UTILS.formatCurrency(c.income_amount, cur)}</td>
            <td class="text-end amount-expense fw-semibold">${PFM_UTILS.formatCurrency(c.expense_amount, cur)}</td>
          </tr>
        `).join('');
      }
    }

    const accBody = document.getElementById('repAccountTableBody');
    if (accBody) {
      if (!accReport || accReport.length === 0) {
        accBody.innerHTML = '<tr><td colspan="6" class="text-center text-muted py-3">ไม่มีข้อมูลบัญชี</td></tr>';
      } else {
        accBody.innerHTML = accReport.map(a => `
          <tr>
            <td class="fw-semibold">${PFM_UTILS.escapeHtml(a.account_name)} <span class="badge bg-secondary">${PFM_UTILS.escapeHtml(a.currency)}</span></td>
            <td class="text-end">${PFM_UTILS.formatCurrency(a.opening_balance, a.currency)}</td>
            <td class="text-end amount-income">+${PFM_UTILS.formatCurrency(a.inflow_income, a.currency)}</td>
            <td class="text-end amount-expense">-${PFM_UTILS.formatCurrency(a.outflow_expense, a.currency)}</td>
            <td class="text-end small text-muted">+${PFM_UTILS.formatNumber(a.transfer_in)} / -${PFM_UTILS.formatNumber(a.transfer_out)}</td>
            <td class="text-end fw-bold text-primary">${PFM_UTILS.formatCurrency(a.current_balance, a.currency)}</td>
          </tr>
        `).join('');
      }
    }
  },

  renderBudgetAndGoalsSummary: function(budgets, goalsSummary) {
    const cur = (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';
    const bdgBody = document.getElementById('repBudgetVsActualBody');
    if (bdgBody) {
      if (!budgets || budgets.length === 0) {
        bdgBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ยังไม่มีการตั้งงบประมาณ</td></tr>';
      } else {
        bdgBody.innerHTML = budgets.map(b => `
          <tr>
            <td class="fw-semibold">${PFM_UTILS.escapeHtml(b.budget_name)} <span class="small text-muted">(${PFM_UTILS.escapeHtml(b.category_name)})</span></td>
            <td class="text-end">${PFM_UTILS.formatCurrency(b.effective_limit, b.currency)}</td>
            <td class="text-end amount-expense">${PFM_UTILS.formatCurrency(b.spent_amount, b.currency)}</td>
            <td class="text-end fw-bold ${b.remaining_amount >= 0 ? 'text-success' : 'text-danger'}">
              ${PFM_UTILS.formatCurrency(b.remaining_amount, b.currency)} (${b.used_percentage.toFixed(1)}%)
            </td>
          </tr>
        `).join('');
      }
    }

    const golBody = document.getElementById('repGoalsSummaryBody');
    if (golBody) {
      const list = (goalsSummary && goalsSummary.goals) || [];
      if (list.length === 0) {
        golBody.innerHTML = '<tr><td colspan="4" class="text-center text-muted py-3">ยังไม่มีเป้าหมายการออม</td></tr>';
      } else {
        golBody.innerHTML = list.map(g => `
          <tr>
            <td class="fw-semibold">${PFM_UTILS.escapeHtml(g.goal_name)}</td>
            <td class="text-end">${PFM_UTILS.formatCurrency(g.target_amount, g.currency)}</td>
            <td class="text-end text-success fw-semibold">${PFM_UTILS.formatCurrency(g.current_amount, g.currency)} (${g.progress_pct.toFixed(1)}%)</td>
            <td class="text-end small">${PFM_UTILS.escapeHtml(g.estimated_completion_date || g.target_date)}</td>
          </tr>
        `).join('');
      }
    }
  },

  exportReportCsv: function() {
    if (!this.lastReport) {
      PFM_APP.showToast('กรุณาโหลดรายงานก่อนส่งออก CSV', 'warning');
      return;
    }

    const lines = [];
    lines.push('=== PERSONAL FINANCE MANAGER PRO - FINANCIAL REPORT ===');
    lines.push(`Period,${this.lastReport.period.start_date} to ${this.lastReport.period.end_date}`);
    lines.push('');
    lines.push('--- 1. ACTUAL CASHFLOW SUMMARY (REAL DATA) ---');
    lines.push('Metric,Amount');
    lines.push(`Actual Income,${this.lastReport.actuals_summary.income}`);
    lines.push(`Actual Net Expense,${this.lastReport.actuals_summary.net_expense}`);
    lines.push(`Actual Net Cashflow,${this.lastReport.actuals_summary.net_cashflow}`);
    lines.push(`Savings Rate (%),${this.lastReport.actuals_summary.savings_rate_pct}`);
    lines.push(`Internal Transfers (Excluded from Income/Expense),${this.lastReport.actuals_summary.internal_transfers_volume}`);
    lines.push('');
    lines.push('--- 2. 90-DAY FORECASTED PROJECTIONS (SEPARATED FROM ACTUALS) ---');
    lines.push(`Projected Income (90d),${this.lastReport.projections_summary.projected_income_90d}`);
    lines.push(`Projected Expense (90d),${this.lastReport.projections_summary.projected_expense_90d}`);
    lines.push(`Projected Net (90d),${this.lastReport.projections_summary.projected_net_90d}`);
    lines.push('');
    lines.push('--- 3. CATEGORY BREAKDOWN (ACTUALS) ---');
    lines.push('Category,Transactions Count,Income,Expense');
    (this.lastReport.category_report || []).forEach(c => {
      lines.push(`"${c.category_name.replace(/"/g, '""')}",${c.tx_count},${c.income_amount},${c.expense_amount}`);
    });

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pfm_financial_report_${PFM_UTILS.todayDateString()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  },

  printOrPdfReport: function() {
    window.print();
  }
};
