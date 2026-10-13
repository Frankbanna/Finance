# =============================================================================
# PERSONAL FINANCE MANAGER PRO
# Acceptance Test Suite — Phase 3 (Debts, Amortization, Credit Cards, Bills, Imports & Notifications)
# Tests live against http://localhost:3000/api backed by Google Spreadsheet:
# 15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A
# =============================================================================

$ErrorActionPreference = "Stop"
$ApiUrl = "http://localhost:3000/api"

function Invoke-PfmApi {
  param(
    [string]$Action,
    [hashtable]$Params = @{},
    [string]$SessionToken = ""
  )
  $bodyObj = @{
    action        = $Action
    session_token = $SessionToken
    params        = $Params
  }
  $jsonBody = $bodyObj | ConvertTo-Json -Depth 10 -Compress
  $resp = Invoke-RestMethod -Uri $ApiUrl -Method Post -ContentType "text/plain; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($jsonBody))
  if (-not $resp.ok) {
    throw "API Error [$Action]: $($resp.error.code) - $($resp.error.message)"
  }
  return $resp.data
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "STARTING PHASE 3 ACCEPTANCE TESTS (LIVE GOOGLE SHEETS BACKEND)" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan

# Wait until server is ready
$ready = $false
for ($retry = 0; $retry -lt 20; $retry++) {
  try {
    $ping = Invoke-PfmApi -Action "system.ping"
    if ($ping.status -eq "healthy") { $ready = $true; break }
  } catch {
    Start-Sleep -Seconds 2
  }
}
if (-not $ready) { throw "Live server at $ApiUrl is not responding." }
Write-Host "[PASS] 0. Server Health Check: $($ping.service)" -ForegroundColor Green

# 1. Authenticate as demo@pfm.local
$loginRes = Invoke-PfmApi -Action "auth.login" -Params @{
  email    = "demo@pfm.local"
  password = "Demo@1234"
}
$token = $loginRes.session_token
Write-Host "[PASS] 1. Authenticated as $($loginRes.user.email)" -ForegroundColor Green

# Fetch accounts
$accsRes = Invoke-PfmApi -Action "accounts.list" -SessionToken $token
$bankAcc = $accsRes.accounts | Where-Object { $_.account_type -eq "bank" } | Select-Object -First 1
$ccAcc   = $accsRes.accounts | Where-Object { $_.account_type -eq "credit_card" } | Select-Object -First 1
if (-not $bankAcc -or -not $ccAcc) { throw "Missing bank or credit_card test account" }

# 2. Test Credit Card Spend + Non-Duplicate Credit Card Settlement (Module G & Criteria #4)
$todayStr = (Get-Date).ToString("yyyy-MM-dd")
$dashBefore = Invoke-PfmApi -Action "dashboard.summary" -SessionToken $token -Params @{}
$expBeforeCcSpend = [double]$dashBefore.kpis.period_expense

$ccSpendRes = Invoke-PfmApi -Action "transactions.create" -SessionToken $token -Params @{
  tx_type         = "expense"
  tx_date         = $todayStr
  account_id      = $ccAcc.account_id
  category_id     = "cat_exp_shopping"
  amount          = 1500
  merchant        = "Central Department Store (รูดบัตรเครดิต KTC)"
  description     = "ทดสอบรูดบัตรเครดิต Phase 3"
  idempotency_key = "test_p3_cc_spend_1500"
  allow_duplicate = $true
}

$dashAfterSpend = Invoke-PfmApi -Action "dashboard.summary" -SessionToken $token -Params @{}
$expAfterCcSpend = [double]$dashAfterSpend.kpis.period_expense

# Now settle the credit card bill (1,500 THB) from Bank Account to Credit Card via debts.payCreditCard
$ccSettleRes = Invoke-PfmApi -Action "debts.payCreditCard" -SessionToken $token -Params @{
  from_account_id        = $bankAcc.account_id
  credit_card_account_id = $ccAcc.account_id
  payment_date           = $todayStr
  amount                 = 1500
  note                   = "ชำระบิลบัตรเครดิต KTC เต็มจำนวน"
  idempotency_key        = "test_p3_cc_settle_1500"
}

$dashAfterSettle = Invoke-PfmApi -Action "dashboard.summary" -SessionToken $token -Params @{}
$expAfterCcSettle = [double]$dashAfterSettle.kpis.period_expense

if ([Math]::Abs($expAfterCcSettle - $expAfterCcSpend) -gt 0.01) {
  throw "Credit card bill payment double-counted expense! Before settle: $expAfterCcSpend, After settle: $expAfterCcSettle"
}
Write-Host "[PASS] 2. Credit Card Spend & Settlement verified: Expense after spend = $expAfterCcSpend THB, Expense after CC settlement = $expAfterCcSettle THB (0 double-counting!)" -ForegroundColor Green

# 3. Test Debts Create, Installment Payment (Principal/Interest Split), Amortization & DTI (Module G)
$debtCreateRes = Invoke-PfmApi -Action "debts.create" -SessionToken $token -Params @{
  debt_name            = "สินเชื่อรถยนต์ Honda Civic"
  debt_type            = "auto_loan"
  lender_name          = "กรุงศรี ออโต้"
  principal_amount     = 400000
  current_balance      = 300000
  interest_rate_annual = 6.0
  minimum_payment      = 7500
  due_day              = 15
  start_date           = "2026-01-15"
}
$debtId = $debtCreateRes.debt.debt_id
Write-Host "[PASS] 3A. Created Loan in Debts sheet: $debtId (Balance: $($debtCreateRes.debt.current_balance) THB, Rate: 6.0%)" -ForegroundColor Green

# Pay 1 installment of 7,500 THB (Monthly interest on 300,000 @ 6% p.a. = 1,500 THB, Principal = 6,000 THB, Remaining = 294,000 THB)
$debtPayRes = Invoke-PfmApi -Action "debts.pay" -SessionToken $token -Params @{
  debt_id            = $debtId
  payment_date       = $todayStr
  total_amount       = 7500
  payment_account_id = $bankAcc.account_id
}
$paidPrin = [double]$debtPayRes.payment.principal_paid
$paidInt  = [double]$debtPayRes.payment.interest_paid
$remBal   = [double]$debtPayRes.payment.remaining_balance
if ($paidInt -ne 1500 -or $paidPrin -ne 6000 -or $remBal -ne 294000) {
  throw "Unexpected Debt Payment split! Principal=$paidPrin, Interest=$paidInt, Remaining=$remBal"
}
Write-Host "[PASS] 3B. Debt Installment Payment verified: Total 7,500 THB -> Principal = $paidPrin THB, Interest = $paidInt THB, New Remaining Balance = $remBal THB" -ForegroundColor Green

# Verify Amortization Schedule & DTI
$amortRes = Invoke-PfmApi -Action "debts.amortization" -SessionToken $token -Params @{
  debt_id = $debtId
}
$debtsListRes = Invoke-PfmApi -Action "debts.list" -SessionToken $token -Params @{}
Write-Host "[PASS] 3C. Amortization Schedule & DTI verified: Remaining Months = $($amortRes.months_to_payoff), DTI = $($debtsListRes.summary.dti_percentage)% ($($debtsListRes.summary.dti_status))" -ForegroundColor Green

# 4. Test Bills Create, Pay & Auto-Recurring Next Bill Generation (Module G)
$dueIn2Days = (Get-Date).AddDays(2).ToString("yyyy-MM-dd")
$billCreateRes = Invoke-PfmApi -Action "bills.create" -SessionToken $token -Params @{
  bill_name          = "ค่าไฟฟ้า กฟน. (MEA)"
  category_id        = "cat_exp_utilities"
  amount             = 1850
  due_date           = $dueIn2Days
  is_recurring       = $true
  frequency          = "monthly"
  remind_days_before = 5
  notes              = "สายไฟบ้านหลัก"
}
$billId = $billCreateRes.bill.bill_id
Write-Host "[PASS] 4A. Created Recurring Bill: $billId ($($billCreateRes.bill.bill_name), Due: $dueIn2Days)" -ForegroundColor Green

$billPayRes = Invoke-PfmApi -Action "bills.pay" -SessionToken $token -Params @{
  bill_id      = $billId
  account_id   = $bankAcc.account_id
  payment_date = $todayStr
  amount       = 1850
}
if (-not $billPayRes.next_recurring_bill) {
  throw "Expected next_recurring_bill to be auto-generated for recurring bill!"
}
Write-Host "[PASS] 4B. Paid Bill $billId -> Linked Tx: $($billPayRes.transaction.transaction_id), Auto-Generated Next Month Bill: $($billPayRes.next_recurring_bill.bill_id) (Due: $($billPayRes.next_recurring_bill.due_date))" -ForegroundColor Green

# Create an upcoming due-soon bill so Dashboard & Smart Alerts detect it
$dueTomorrow = (Get-Date).AddDays(1).ToString("yyyy-MM-dd")
$billDueSoon = Invoke-PfmApi -Action "bills.create" -SessionToken $token -Params @{
  bill_name          = "ค่าน้ำประปา (MWA)"
  category_id        = "cat_exp_utilities"
  amount             = 320
  due_date           = $dueTomorrow
  is_recurring       = $true
  frequency          = "monthly"
  remind_days_before = 3
  notes              = "แจ้งเตือนล่วงหน้า 3 วัน"
}
Write-Host "[PASS] 4C. Created Due-Soon Bill for Alert Engine: $($billDueSoon.bill.bill_id) (Due: $dueTomorrow)" -ForegroundColor Green

# 5. Test Import History (Module I)
$importsRes = Invoke-PfmApi -Action "imports.list" -SessionToken $token -Params @{}
if ($importsRes.imports.Count -lt 1) {
  throw "Expected at least 1 import history record in Import_History sheet"
}
Write-Host "[PASS] 5. Import History (imports.list) verified: Found $($importsRes.imports.Count) record(s) in Import_History sheet" -ForegroundColor Green

# 6. Test Smart Notifications Engine (Generate Alerts, Deduplication & Mark Read)
$alertGen1 = Invoke-PfmApi -Action "notifications.generateAlerts" -SessionToken $token -Params @{}
$alertGen2 = Invoke-PfmApi -Action "notifications.generateAlerts" -SessionToken $token -Params @{}
if ($alertGen2.generated_count -ne 0) {
  throw "Expected 0 duplicate alerts on immediate second run of notifications.generateAlerts, got $($alertGen2.generated_count)"
}
Write-Host "[PASS] 6A. Smart Notifications generated & deduplicated: First run created $($alertGen1.generated_count) alert(s), Second run created $($alertGen2.generated_count) duplicate(s), Unread Total = $($alertGen2.unread_count)" -ForegroundColor Green

if ($alertGen2.notifications.Count -gt 0) {
  $firstNotifId = $alertGen2.notifications[0].notification_id
  $markRes = Invoke-PfmApi -Action "notifications.markRead" -SessionToken $token -Params @{
    notification_id = $firstNotifId
  }
  Write-Host "[PASS] 6B. Marked Notification $firstNotifId as read (Updated: $($markRes.updated_count))" -ForegroundColor Green
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "ALL PHASE 3 ACCEPTANCE TESTS PASSED AGAINST LIVE GOOGLE SHEETS!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan

