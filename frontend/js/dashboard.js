/**
 * PERSONAL FINANCE MANAGER PRO
 * Module: frontend/js/dashboard.js
 * Description: Renders real-time Dashboard KPIs, Chart.js visualizations, MoM comparisons,
 *              account balances, near-limit budgets, upcoming bills, and recent transactions.
 */

window.PFM_DASHBOARD = {
  trendChart: null,
  categoryChart: null,
  lastData: null,

  init: function() {
    const range = PFM_UTILS.currentMonthRange();
    const startInput = document.getElementById('dashFilterStart');
    const endInput = document.getElementById('dashFilterEnd');
    if (startInput && !startInput.value) startInput.value = range.start_date;
    if (endInput && !endInput.value) endInput.value = range.end_date;

    const filterForm = document.getElementById('dashboardFilterForm');
    if (filterForm) {
      filterForm.addEventListener('submit', (e) => {
        e.preventDefault();
        this.loadDashboard();
      });
    }
  },

  resetFiltersToCurrentMonth: function() {
    const range = PFM_UTILS.currentMonthRange();
    document.getElementById('dashFilterStart').value = range.start_date;
    document.getElementById('dashFilterEnd').value = range.end_date;
    document.getElementById('dashFilterAccount').value = '';
    document.getElementById('dashFilterCategory').value = '';
    document.getElementById('dashFilterCurrency').value = '';
    this.loadDashboard();
  },

  loadDashboard: async function() {
    const startDate = document.getElementById('dashFilterStart').value;
    const endDate = document.getElementById('dashFilterEnd').value;
    const accountId = document.getElementById('dashFilterAccount').value;
    const categoryId = document.getElementById('dashFilterCategory').value;
    const currency = document.getElementById('dashFilterCurrency').value;

    const baseCur = currency || (PFM_APP.currentUser && PFM_APP.currentUser.base_currency) || 'THB';

    try {
      const data = await PFM_API.call('dashboard.summary', {
        start_date: startDate,
        end_date: endDate,
        account_id: accountId,
        category_id: categoryId,
        currency: currency
      });

      this.lastData = data;
      this.renderKpis(data.kpis, data.month_comparison, baseCur);
      this.renderAccountBalances(data.accounts);
      this.renderCharts(data.monthly_trends, data.category_breakdown, baseCur);
      this.renderBudgetsAndBills(data.budgets_near_limit, data.upcoming_bills, baseCur);
      this.renderRecentTransactions(data.recent_transactions);
    } catch (err) {
      PFM_APP.showToast('ไม่สามารถโหลดข้อมูล Dashboard: ' + err.message, 'danger');
    }
  },

  renderKpis: function(kpis, mom, cur) {
    document.getElementById('kpiTotalBalance').textContent = PFM_UTILS.formatCurrency(kpis.total_net_balance, cur);
    document.getElementById('kpiAssetsAndLiabilities').textContent =
      `สินทรัพย์: ${PFM_UTILS.formatCurrency(kpis.total_assets, cur)} | หนี้สิน: ${PFM_UTILS.formatCurrency(kpis.total_liabilities, cur)}`;

    document.getElementById('kpiPeriodIncome').textContent = PFM_UTILS.formatCurrency(kpis.period_income, cur);
    document.getElementById('kpiPeriodExpense').textContent = PFM_UTILS.formatCurrency(kpis.period_expense, cur);

    const netEl = document.getElementById('kpiNetCashflow');
    netEl.textContent = PFM_UTILS.formatCurrency(kpis.period_net_cashflow, cur);
    netEl.className = 'kpi-value ' + (kpis.period_net_cashflow >= 0 ? 'amount-income' : 'amount-expense');

    document.getElementById('kpiSavingsRate').textContent = `${kpis.savings_rate_pct.toFixed(1)}%`;
    const savingsBar = document.getElementById('kpiSavingsProgressBar');
    if (savingsBar) {
      const clamped = Math.max(0, Math.min(100, kpis.savings_rate_pct));
      savingsBar.style.width = clamped + '%';
    }

    // Month-over-month comparison badges
    const formatMomBadge = (pct, inverseColor) => {
      const sign = pct > 0 ? '+' : '';
      const isGood = inverseColor ? pct <= 0 : pct >= 0;
      const cls = isGood ? 'text-success' : 'text-danger';
      const icon = pct >= 0 ? 'bi-arrow-up-right' : 'bi-arrow-down-right';
      return `<span class="${cls} fw-semibold"><i class="bi ${icon}"></i> ${sign}${pct.toFixed(1)}% เทียบเดือนก่อน</span>`;
    };

    document.getElementById('momIncomeDiff').innerHTML =
      `${formatMomBadge(mom.income_change_pct, false)} (${PFM_UTILS.formatCurrency(mom.previous_month.income, cur)})`;
    document.getElementById('momExpenseDiff').innerHTML =
      `${formatMomBadge(mom.expense_change_pct, true)} (${PFM_UTILS.formatCurrency(mom.previous_month.expense, cur)})`;
    document.getElementById('momNetDiff').innerHTML =
      `${formatMomBadge(mom.net_change_pct, false)} | โอนระหว่างบัญชี: ${PFM_UTILS.formatCurrency(kpis.period_transfers_volume, cur)} (ไม่คิดซ้ำ)`;
  },

  renderAccountBalances: function(accounts) {
    const container = document.getElementById('dashAccountList');
    if (!container) return;

    if (!accounts || accounts.length === 0) {
      container.innerHTML = `
        <div class="col-12">
          <div class="text-center text-muted py-3">ยังไม่มีบัญชีในระบบ กดปุ่ม "+ เพิ่มบัญชี" เพื่อเริ่มต้น</div>
        </div>`;
      return;
    }

    container.innerHTML = accounts.map(acc => {
      const balClass = acc.current_balance >= 0 ? 'text-primary' : 'text-danger';
      return `
        <div class="col-12 col-sm-6 col-xl-3">
          <div class="surface-card account-card h-100" style="border-left-color: ${PFM_UTILS.escapeHtml(acc.color || '#2563EB')}">
            <div class="d-flex justify-content-between align-items-start mb-1">
              <div>
                <div class="fw-bold">${PFM_UTILS.escapeHtml(acc.account_name)}</div>
                <div class="small text-muted">${PFM_UTILS.escapeHtml(PFM_CONFIG.ACCOUNT_TYPE_LABELS[acc.account_type] || acc.account_type)}</div>
              </div>
              <span class="badge bg-secondary bg-opacity-10 text-secondary">${PFM_UTILS.escapeHtml(acc.currency)}</span>
            </div>
            <div class="fs-5 fw-bold mt-2 ${balClass}">
              ${PFM_UTILS.formatCurrency(acc.current_balance, acc.currency)}
            </div>
            <div class="small text-muted mt-1">
              ตั้งต้น: ${PFM_UTILS.formatCurrency(acc.opening_balance, acc.currency)}
            </div>
          </div>
        </div>
      `;
    }).join('');
  },

  renderCharts: function(monthlyTrends, categoryBreakdown, cur) {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const textColor = isDark ? '#CBD5E1' : '#475569';
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(15,23,42,0.06)';

    // 1. Monthly Income vs Expense Trend Chart
    const trendCtx = document.getElementById('chartIncomeExpenseTrend');
    if (trendCtx && window.Chart) {
      if (this.trendChart) this.trendChart.destroy();
      const labels = (monthlyTrends || []).map(m => m.month);
      const incData = (monthlyTrends || []).map(m => m.income);
      const expData = (monthlyTrends || []).map(m => m.expense);
      const netData = (monthlyTrends || []).map(m => m.net);

      this.trendChart = new Chart(trendCtx, {
        type: 'bar',
        data: {
          labels: labels,
          datasets: [
            {
              label: 'รายรับ (' + cur + ')',
              data: incData,
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              borderRadius: 6
            },
            {
              label: 'รายจ่ายสุทธิ (' + cur + ')',
              data: expData,
              backgroundColor: 'rgba(239, 68, 68, 0.8)',
              borderRadius: 6
            },
            {
              type: 'line',
              label: 'เงินคงเหลือสุทธิ (' + cur + ')',
              data: netData,
              borderColor: '#3B82F6',
              backgroundColor: '#3B82F6',
              borderWidth: 2.5,
              tension: 0.3,
              pointRadius: 4
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: {
            legend: { labels: { color: textColor } }
          },
          scales: {
            x: { ticks: { color: textColor }, grid: { color: gridColor } },
            y: { ticks: { color: textColor }, grid: { color: gridColor } }
          }
        }
      });
    }

    // 2. Category Expense Doughnut Chart
    const catCtx = document.getElementById('chartCategoryBreakdown');
    const catLegend = document.getElementById('dashCategoryBreakdownList');
    if (catCtx && window.Chart) {
      if (this.categoryChart) this.categoryChart.destroy();

      if (!categoryBreakdown || categoryBreakdown.length === 0) {
        this.categoryChart = new Chart(catCtx, {
          type: 'doughnut',
          data: {
            labels: ['ยังไม่มีรายจ่ายในช่วงเวลานี้'],
            datasets: [{ data: [1], backgroundColor: ['#CBD5E1'] }]
          },
          options: { responsive: true, maintainAspectRatio: false }
        });
        if (catLegend) {
          catLegend.innerHTML = '<div class="text-muted small text-center py-2">ไม่มีข้อมูลรายจ่ายในช่วงที่เลือก</div>';
        }
      } else {
        this.categoryChart = new Chart(catCtx, {
          type: 'doughnut',
          data: {
            labels: categoryBreakdown.map(c => c.category_name),
            datasets: [{
              data: categoryBreakdown.map(c => c.amount),
              backgroundColor: categoryBreakdown.map(c => c.color || '#3B82F6'),
              borderWidth: 1
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              legend: { position: 'bottom', labels: { color: textColor, boxWidth: 12 } }
            }
          }
        });

        if (catLegend) {
          catLegend.innerHTML = categoryBreakdown.slice(0, 5).map(c => `
            <div class="d-flex justify-content-between align-items-center small py-1 border-bottom">
              <div>
                <span class="d-inline-block rounded-circle me-2" style="width:10px;height:10px;background:${PFM_UTILS.escapeHtml(c.color)}"></span>
                ${PFM_UTILS.escapeHtml(c.category_name)}
              </div>
              <div class="fw-semibold">${PFM_UTILS.formatCurrency(c.amount, cur)} (${c.percentage.toFixed(1)}%)</div>
            </div>
          `).join('');
        }
      }
    }
  },

  renderBudgetsAndBills: function(budgets, bills, cur) {
    const budgetEl = document.getElementById('dashBudgetsNearLimit');
    if (budgetEl) {
      if (!budgets || budgets.length === 0) {
        budgetEl.innerHTML = '<div class="text-muted small py-2">ยังไม่มีการตั้งงบประมาณในชีต Budgets (จะขยายเต็มรูปแบบใน Phase 2)</div>';
      } else {
        budgetEl.innerHTML = budgets.slice(0, 5).map(b => {
          const barColor = b.used_percentage >= 100 ? 'bg-danger' : (b.is_near_or_over ? 'bg-warning' : 'bg-success');
          return `
            <div class="mb-3">
              <div class="d-flex justify-content-between small mb-1">
                <span class="fw-semibold">${PFM_UTILS.escapeHtml(b.budget_name)} (${PFM_UTILS.escapeHtml(b.category_name)})</span>
                <span>${PFM_UTILS.formatCurrency(b.spent_amount, cur)} / ${PFM_UTILS.formatCurrency(b.amount_limit, cur)} (${b.used_percentage.toFixed(0)}%)</span>
              </div>
              <div class="progress" style="height: 8px;">
                <div class="progress-bar ${barColor}" style="width: ${Math.min(100, b.used_percentage)}%"></div>
              </div>
            </div>
          `;
        }).join('');
      }
    }

    const billsEl = document.getElementById('dashUpcomingBills');
    if (billsEl) {
      if (!bills || bills.length === 0) {
        billsEl.innerHTML = '<div class="text-muted small py-2">ไม่มีรายการบิลค้างชำระในชีต Bills</div>';
      } else {
        billsEl.innerHTML = bills.map(b => {
          const badge = b.days_remaining < 0
            ? `<span class="badge bg-danger">เกินกำหนด ${Math.abs(b.days_remaining)} วัน</span>`
            : `<span class="badge bg-warning text-dark">ครบกำหนดใน ${b.days_remaining} วัน (${PFM_UTILS.escapeHtml(b.due_date)})</span>`;
          return `
            <div class="d-flex justify-content-between align-items-center py-2 border-bottom small">
              <div>
                <div class="fw-semibold">${PFM_UTILS.escapeHtml(b.bill_name)}</div>
                <div>${badge}</div>
              </div>
              <div class="fw-bold">${PFM_UTILS.formatCurrency(b.amount, b.currency || cur)}</div>
            </div>
          `;
        }).join('');
      }
    }
  },

  renderRecentTransactions: function(txs) {
    const tbody = document.getElementById('dashRecentTxBody');
    if (!tbody) return;

    if (!txs || txs.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted py-4">ยังไม่มีรายการธุรกรรมในช่วงเวลานี้</td></tr>';
      return;
    }

    const accMap = PFM_APP.getAccountMap();
    const catMap = PFM_APP.getCategoryMap();

    tbody.innerHTML = txs.map(tx => {
      const accName = (accMap[tx.account_id] && accMap[tx.account_id].account_name) || tx.account_id;
      const toAccName = tx.to_account_id && accMap[tx.to_account_id] ? ' -> ' + accMap[tx.to_account_id].account_name : '';
      const catName = (catMap[tx.category_id] && catMap[tx.category_id].category_name) || tx.category_id || '-';
      const sign = (tx.tx_type === 'income' || tx.tx_type === 'refund' || (tx.tx_type === 'adjustment' && tx.amount > 0)) ? '+' : (tx.tx_type === 'expense' ? '-' : '');
      return `
        <tr>
          <td class="small">${PFM_UTILS.escapeHtml(tx.tx_date)} <span class="text-muted">${PFM_UTILS.escapeHtml(tx.tx_time)}</span></td>
          <td><span class="badge badge-tx-${PFM_UTILS.escapeHtml(tx.tx_type)}">${PFM_UTILS.escapeHtml(PFM_CONFIG.TX_TYPE_LABELS[tx.tx_type] || tx.tx_type)}</span></td>
          <td>
            <div class="fw-semibold">${PFM_UTILS.escapeHtml(tx.merchant || tx.description || '-')}</div>
            <div class="small text-muted">${PFM_UTILS.escapeHtml(catName)}</div>
          </td>
          <td class="small">${PFM_UTILS.escapeHtml(accName + toAccName)}</td>
          <td class="text-end fw-bold amount-${PFM_UTILS.escapeHtml(tx.tx_type)}">
            ${sign}${PFM_UTILS.formatCurrency(tx.amount, tx.currency)}
          </td>
        </tr>
      `;
    }).join('');
  }
};

