# =============================================================================
# PERSONAL FINANCE MANAGER PRO — PHASE 2 END-TO-END ACCEPTANCE TEST SUITE
# Tests live HTTP API (http://localhost:3000/api) -> Real Google Spreadsheet:
# 15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A
# Covers: Module D (Budgets), Module E (Savings Goals & Contributions),
#         Module F (Recurring & Trigger Idempotency), Module H (Reports & Analytics)
# =============================================================================

param(
  [string]$ApiUrl = "http://localhost:3000/api"
)

$ErrorActionPreference = "Stop"

function Invoke-PfmApi([string]$Action, [string]$Token, [hashtable]$Params) {
  $bodyObj = @{
    action        = $Action
    session_token = $Token
    params        = $Params
  }
  $jsonBody = $bodyObj | ConvertTo-Json -Depth 10 -Compress
  $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonBody)
  $resp = Invoke-RestMethod -Uri $ApiUrl -Method Post -Body $bytes -ContentType "text/plain; charset=utf-8"
  if (-not $resp.ok) {
    throw "API Error [$Action]: $($resp.error.code) - $($resp.error.message)"
  }
  return $resp.data
}

function Assert-Condition([bool]$Condition, [string]$Title, [string]$Detail) {
  if ($Condition) {
    Write-Host "  [PASS] $Title" -ForegroundColor Green
    if ($Detail) { Write-Host "         -> $Detail" -ForegroundColor Gray }
  } else {
    Write-Host "  [FAIL] $Title : $Detail" -ForegroundColor Red
    throw "Assertion failed: $Title"
  }
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " RUNNING PHASE 2 LIVE ACCEPTANCE TESTS AGAINST GOOGLE SHEETS DB " -ForegroundColor Yellow
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Authenticate as Demo User
Write-Host "`n[1/6] Authenticating Demo User (demo@pfm.local)..." -ForegroundColor Cyan
$loginRes = Invoke-PfmApi -Action "auth.login" -Token "" -Params @{
  email     = "demo@pfm.local"
  auth_mode = "password"
  password  = "Demo@1234"
}
$token = [string]$loginRes.session_token
Assert-Condition ($token.StartsWith("tok_")) "Authenticated session token issued" "User: $($loginRes.user.email)"

$accsRes = Invoke-PfmApi -Action "accounts.list" -Token $token -Params @{}
$kbankAcc = $accsRes.accounts | Where-Object { $_.account_type -eq "bank" } | Select-Object -First 1
$cashAcc  = $accsRes.accounts | Where-Object { $_.account_type -eq "cash" } | Select-Object -First 1
Assert-Condition ($null -ne $kbankAcc -and $null -ne $cashAcc) "Loaded existing accounts from Google Sheets" "Bank=$($kbankAcc.account_id), Cash=$($cashAcc.account_id)"

# 2. Module D: Budgets CRUD, Rollover & Real-time Spent Math
Write-Host "`n[2/6] Testing Module D: Budgets (CRUD, Rollover, Alert Threshold & Real-Time Spent)..." -ForegroundColor Cyan
$bdgOverallRes = Invoke-PfmApi -Action "budgets.create" -Token $token -Params @{
  budget_name         = "งบรวมประจำเดือน (Overall Monthly)"
  period_type         = "monthly"
  category_id         = "ALL"
  amount_limit        = 15000
  currency            = "THB"
  rollover_enabled    = $true
  rollover_amount     = 1000
  alert_threshold_pct = 50
}
$bdgOverall = $bdgOverallRes.budget
Assert-Condition ($bdgOverall.effective_limit -eq 16000) "Overall Budget Rollover Math (15,000 + 1,000 = 16,000)" "effective_limit=$($bdgOverall.effective_limit), spent_amount=$($bdgOverall.spent_amount)"
Assert-Condition ($bdgOverall.spent_amount -gt 0 -and $bdgOverall.is_near_or_over -eq $true) "Overall Budget calculates real spent amount from Transactions & triggers threshold alert" "used_percentage=$($bdgOverall.used_percentage)%, status_level=$($bdgOverall.status_level)"

$bdgHousingRes = Invoke-PfmApi -Action "budgets.create" -Token $token -Params @{
  budget_name         = "งบค่าที่อยู่อาศัย (Housing)"
  period_type         = "monthly"
  category_id         = "cat_exp_housing"
  amount_limit        = 10000
  currency            = "THB"
  rollover_enabled    = $false
  rollover_amount     = 0
  alert_threshold_pct = 80
}
$bdgHousing = $bdgHousingRes.budget
Assert-Condition ($bdgHousing.spent_amount -eq 8000 -and $bdgHousing.used_percentage -eq 80) "Category Budget (cat_exp_housing) matches Net Housing Expense 8,000 (8,500 - 500 refund) / 10,000 (80%)" "spent=$($bdgHousing.spent_amount), remaining=$($bdgHousing.remaining_amount), used=$($bdgHousing.used_percentage)%"

$bdgUpdateRes = Invoke-PfmApi -Action "budgets.update" -Token $token -Params @{
  budget_id    = $bdgHousing.budget_id
  amount_limit = 9000
}
Assert-Condition ($bdgUpdateRes.budget.amount_limit -eq 9000 -and $bdgUpdateRes.budget.remaining_amount -eq 1000) "Budget update recalculates remaining_amount (9,000 - 8,000 = 1,000)" "remaining=$($bdgUpdateRes.budget.remaining_amount)"

# 3. Module E: Savings Goals & Contributions (Deposit / Withdraw / Monthly Saving Math)
Write-Host "`n[3/6] Testing Module E: Savings Goals & Goal_Contributions..." -ForegroundColor Cyan
$goalCreateRes = Invoke-PfmApi -Action "goals.create" -Token $token -Params @{
  goal_name         = "กองทุนสำรองฉุกเฉิน 6 เดือน"
  target_amount     = 120000
  current_amount    = 20000
  currency          = "THB"
  target_date       = "2027-04-30"
  linked_account_id = $kbankAcc.account_id
  color             = "#10B981"
  notes             = "ออมทุกเดือนหลังเงินเดือนออก"
}
$goal = $goalCreateRes.goal
Assert-Condition ($goal.current_amount -eq 20000 -and $goal.remaining_amount -eq 100000) "Savings Goal created with initial deposit 20,000 / 120,000" "progress=$($goal.progress_pct)%, required_monthly_saving=$($goal.required_monthly_saving)"

$depRes = Invoke-PfmApi -Action "goals.contribute" -Token $token -Params @{
  goal_id    = $goal.goal_id
  entry_type = "deposit"
  amount     = 10000
  tx_date    = "2026-10-13"
  note       = "เติมเงินออมประจำเดือนตุลาคม"
}
Assert-Condition ($depRes.goal.current_amount -eq 30000 -and $depRes.goal.progress_pct -eq 25) "Goal Deposit (+10,000) updates current_amount to 30,000 (25%)" "contributions_count=$($depRes.goal.contributions_count)"

$witRes = Invoke-PfmApi -Action "goals.contribute" -Token $token -Params @{
  goal_id    = $goal.goal_id
  entry_type = "withdraw"
  amount     = 2000
  tx_date    = "2026-10-13"
  note       = "ถอนบางส่วนสำรองฉุกเฉิน"
}
Assert-Condition ($witRes.goal.current_amount -eq 28000 -and $witRes.goal.contributions_count -eq 3) "Goal Withdraw (-2,000) updates current_amount to 28,000 & records 3 history items" "current_amount=$($witRes.goal.current_amount)"

# 4. Module F: Recurring Transactions, Forecast Separation & Trigger Idempotency
Write-Host "`n[4/6] Testing Module F: Recurring Transactions & Trigger Idempotency..." -ForegroundColor Cyan
$recCreateRes = Invoke-PfmApi -Action "recurring.create" -Token $token -Params @{
  title          = "ค่าอินเทอร์เน็ตไฟเบอร์ AIS"
  tx_type        = "expense"
  account_id     = $cashAcc.account_id
  category_id    = "cat_exp_utilities"
  amount         = 699
  currency       = "THB"
  frequency      = "monthly"
  interval_count = 1
  start_date     = "2026-10-01"
  next_run_date  = "2026-10-10"
  auto_post      = $true
}
$recRule = $recCreateRes.recurring
Assert-Condition ($recRule.next_run_date -eq "2026-10-10" -and $recRule.is_due_now -eq $true) "Recurring rule created and detected as due (2026-10-10 <= today)" "recurring_id=$($recRule.recurring_id)"

# Process due recurring rules (Run #1)
$proc1 = Invoke-PfmApi -Action "recurring.processDue" -Token $token -Params @{
  as_of_date   = "2026-10-13"
  recurring_id = $recRule.recurring_id
}
Assert-Condition ($proc1.generated_count -eq 1 -and $proc1.skipped_duplicates_count -eq 0) "Trigger Run #1 generated 1 actual Transaction in Google Sheets" "tx_id=$($proc1.generated_transactions[0].transaction_id), next_run=$($proc1.recurring_overview.recurring_rules[0].next_run_date)"

# Test Idempotency: Force next_run_date back to 2026-10-10 and run processDue again!
$null = Invoke-PfmApi -Action "recurring.update" -Token $token -Params @{
  recurring_id  = $recRule.recurring_id
  next_run_date = "2026-10-10"
}
$proc2 = Invoke-PfmApi -Action "recurring.processDue" -Token $token -Params @{
  as_of_date   = "2026-10-13"
  recurring_id = $recRule.recurring_id
}
Assert-Condition ($proc2.generated_count -eq 0 -and $proc2.skipped_duplicates_count -eq 1) "Trigger Idempotency Guard prevented duplicate transaction for 2026-10-10" "idempotency_key=rec_$($recRule.recurring_id)_2026-10-10"

# Check Forecast separation
$recList = Invoke-PfmApi -Action "recurring.list" -Token $token -Params @{}
Assert-Condition ($recList.upcoming_forecasts.Count -gt 0 -and $recList.upcoming_forecasts[0].record_nature -eq "FORECAST_ESTIMATE") "Upcoming forecasts are strictly separated from actual transactions" "90d_forecasts=$($recList.upcoming_forecasts.Count), actual_generated=$($recList.actual_generated_transactions.Count)"

# 5. Module H: Reports & Analytics (Actuals vs Projections, Comparisons)
Write-Host "`n[5/6] Testing Module H: Reports & Analytics (reports.overview)..." -ForegroundColor Cyan
$repRes = Invoke-PfmApi -Action "reports.overview" -Token $token -Params @{
  start_date = "2026-10-01"
  end_date   = "2026-10-31"
}
Assert-Condition ($repRes.actuals.record_nature -eq "ACTUAL_POSTED_ONLY" -and $repRes.projections.record_nature -eq "FORECAST_ESTIMATES_SEPARATED") "Reports strictly separate Actuals from 90-day Projections" "Actual Net Expense=$($repRes.actuals.net_expense), Projected 90d Expense=$($repRes.projections.projected_90d_expense)"
Assert-Condition ($repRes.actuals.net_expense -eq 9879) "Actual Net Expense includes new recurring 699 THB (9,180 + 699 = 9,879 THB)" "Income=$($repRes.actuals.income), Net Expense=$($repRes.actuals.net_expense), Net Cashflow=$($repRes.actuals.net_cashflow)"
Assert-Condition ($repRes.actuals.comparisons.monthly.Count -ge 1 -and $repRes.actuals.comparisons.quarterly.Count -ge 1 -and $repRes.actuals.comparisons.yearly.Count -ge 1) "Monthly, Quarterly, and Yearly comparisons populated" "ByCategory=$($repRes.actuals.by_category.Count), ByAccount=$($repRes.actuals.by_account.Count)"

# 6. Dashboard Integration Check
Write-Host "`n[6/6] Verifying Dashboard integration with Phase 2 Budgets..." -ForegroundColor Cyan
$dashRes = Invoke-PfmApi -Action "dashboard.summary" -Token $token -Params @{
  start_date = "2026-10-01"
  end_date   = "2026-10-31"
}
Assert-Condition ($dashRes.budgets_near_limit.Count -ge 2) "Dashboard displays real Phase 2 budgets near limit" "budgets_near_limit count=$($dashRes.budgets_near_limit.Count)"

Write-Host "`n=================================================================" -ForegroundColor Cyan
Write-Host " ALL PHASE 2 LIVE ACCEPTANCE TESTS PASSED SUCCESSFULLY!          " -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
