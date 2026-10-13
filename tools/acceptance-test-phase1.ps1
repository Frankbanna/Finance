# =============================================================================
# PERSONAL FINANCE MANAGER PRO — PHASE 1 LIVE ACCEPTANCE TEST SUITE (PowerShell)
# Executes end-to-end API tests against http://localhost:3000/api connected to
# real Google Spreadsheet: 15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A
# =============================================================================

$ErrorActionPreference = "Stop"
$ApiUrl = "http://localhost:3000/api"

function Invoke-PfmApi([string]$Action, [string]$SessionToken, $Params) {
  $payload = @{
    action        = $Action
    session_token = $SessionToken
    params        = $Params
  } | ConvertTo-Json -Depth 10 -Compress

  $bytes = [System.Text.Encoding]::UTF8.GetBytes($payload)
  return Invoke-RestMethod -Method "POST" -Uri $ApiUrl -ContentType "text/plain; charset=utf-8" -Body $bytes
}

function Assert-True($Cond, [string]$Msg) {
  if (-not $Cond) {
    throw "ASSERTION FAILED: $Msg"
  }
}

Write-Host "=== STARTING PHASE 1 ACCEPTANCE TESTS AGAINST REAL GOOGLE SHEETS ===" -ForegroundColor Cyan

# 1. Health Check & Setup
$ping = Invoke-PfmApi -Action "system.ping" -SessionToken "" -Params @{}
Assert-True ($ping.ok -eq $true) "system.ping must succeed"
Write-Host "[PASS] 1. system.ping -> $($ping.data.version) (Spreadsheet: $($ping.data.spreadsheet_id))" -ForegroundColor Green

$setup = Invoke-PfmApi -Action "system.setup" -SessionToken "" -Params @{}
Assert-True ($setup.ok -eq $true) "system.setup must succeed"
Write-Host "[PASS] 2. system.setup -> Verified $($setup.data.verified_sheets.Count) sheets" -ForegroundColor Green

# 2. Register or Login Demo User (`demo@pfm.local` / `Demo@1234` / PIN `123456`)
$regRes = Invoke-PfmApi -Action "auth.register" -SessionToken "" -Params @{
  full_name     = "คุณสมชาย ใจดี (Demo Account)"
  email         = "demo@pfm.local"
  password      = "Demo@1234"
  pin           = "123456"
  base_currency = "THB"
  timezone      = "Asia/Bangkok"
}

$demoToken = ""
if ($regRes.ok) {
  $demoToken = $regRes.data.session_token
  Write-Host "[PASS] 3. Registered new Demo User in real Users sheet: $($regRes.data.user.user_id)" -ForegroundColor Green
} else {
  $loginRes = Invoke-PfmApi -Action "auth.login" -SessionToken "" -Params @{
    email     = "demo@pfm.local"
    auth_mode = "password"
    password  = "Demo@1234"
  }
  Assert-True ($loginRes.ok -eq $true) "Demo password login must succeed"
  $demoToken = $loginRes.data.session_token
  Write-Host "[PASS] 3. Logged in existing Demo User: $($loginRes.data.user.user_id)" -ForegroundColor Green
}

# 3. Verify 6-Digit PIN Login
$pinRes = Invoke-PfmApi -Action "auth.login" -SessionToken "" -Params @{
  email     = "demo@pfm.local"
  auth_mode = "pin"
  pin       = "123456"
}
Assert-True ($pinRes.ok -eq $true) "PIN login must succeed"
$demoToken = $pinRes.data.session_token
Write-Host "[PASS] 4. Verified 6-Digit PIN Authentication against Users sheet" -ForegroundColor Green

# 4. Create Accounts (Bank, Cash, Credit Card)
$accListRes = Invoke-PfmApi -Action "accounts.list" -SessionToken $demoToken -Params @{}
Assert-True ($accListRes.ok -eq $true) "accounts.list must succeed"

$bankAcc = $null
$cashAcc = $null
$ccAcc   = $null

if ($accListRes.data.accounts.Count -eq 0) {
  $b = Invoke-PfmApi -Action "accounts.create" -SessionToken $demoToken -Params @{
    account_name          = "กสิกรไทย ออมทรัพย์หลัก (KBANK)"
    account_type          = "bank"
    currency              = "THB"
    opening_balance       = 50000
    institution_name      = "KBANK"
    account_number_masked = "xxxx-8899"
    color                 = "#10B981"
    include_in_net_worth  = $true
  }
  Assert-True ($b.ok -eq $true) "Bank account creation must succeed"
  $bankAcc = $b.data.account

  $c = Invoke-PfmApi -Action "accounts.create" -SessionToken $demoToken -Params @{
    account_name         = "กระเป๋าเงินสดประจำวัน"
    account_type         = "cash"
    currency             = "THB"
    opening_balance      = 3000
    color                = "#F59E0B"
    include_in_net_worth = $true
  }
  Assert-True ($c.ok -eq $true) "Cash account creation must succeed"
  $cashAcc = $c.data.account

  $cc = Invoke-PfmApi -Action "accounts.create" -SessionToken $demoToken -Params @{
    account_name          = "บัตรเครดิต KTC Platinum"
    account_type          = "credit_card"
    currency              = "THB"
    opening_balance       = 0
    credit_limit          = 80000
    billing_day           = 25
    due_day               = 10
    institution_name      = "KTC"
    account_number_masked = "xxxx-4512"
    color                 = "#EF4444"
    include_in_net_worth  = $true
  }
  Assert-True ($cc.ok -eq $true) "Credit card account creation must succeed"
  $ccAcc = $cc.data.account
  Write-Host "[PASS] 5. Created 3 real accounts in Google Sheets: $($bankAcc.account_id), $($cashAcc.account_id), $($ccAcc.account_id)" -ForegroundColor Green
} else {
  $bankAcc = $accListRes.data.accounts[0]
  $cashAcc = $accListRes.data.accounts[1]
  $ccAcc   = $accListRes.data.accounts[2]
  Write-Host "[PASS] 5. Loaded existing accounts from Google Sheets" -ForegroundColor Green
}

# 5. Create Transactions (Income, Expense, Transfer, Refund) & Verify Idempotency
$incRes = Invoke-PfmApi -Action "transactions.create" -SessionToken $demoToken -Params @{
  tx_type         = "income"
  tx_date         = "2026-10-01"
  tx_time         = "09:00"
  account_id      = $bankAcc.account_id
  category_id     = "cat_inc_salary"
  amount          = 45000
  merchant        = "บริษัท เทคโนโลยี จำกัด"
  description     = "เงินเดือนประจำเดือนตุลาคม 2026"
  tags            = "salary,october"
  idempotency_key = "test_ik_inc_20261001"
}
Assert-True ($incRes.ok -eq $true) "Income transaction creation must succeed"

$replayRes = Invoke-PfmApi -Action "transactions.create" -SessionToken $demoToken -Params @{
  tx_type         = "income"
  tx_date         = "2026-10-01"
  tx_time         = "09:00"
  account_id      = $bankAcc.account_id
  category_id     = "cat_inc_salary"
  amount          = 45000
  merchant        = "บริษัท เทคโนโลยี จำกัด"
  description     = "เงินเดือนประจำเดือนตุลาคม 2026"
  idempotency_key = "test_ik_inc_20261001"
}
Assert-True ($replayRes.ok -eq $true -and $replayRes.data.idempotent_replay -eq $true) "Must prevent duplicate write via idempotency_key"
Write-Host "[PASS] 6. Verified Idempotency & Duplicate Prevention" -ForegroundColor Green

$expRes = Invoke-PfmApi -Action "transactions.create" -SessionToken $demoToken -Params @{
  tx_type         = "expense"
  tx_date         = "2026-10-03"
  tx_time         = "19:30"
  account_id      = $bankAcc.account_id
  category_id     = "cat_exp_housing"
  subcategory_id  = "cat_exp_housing_rent"
  amount          = 8500
  merchant        = "ค่าเช่าคอนโด ลุมพินี"
  description     = "ค่าเช่าประจำเดือน ต.ค."
  tags            = "rent,housing"
  receipt_url     = "https://drive.google.com/file/d/sample-receipt"
  idempotency_key = "test_ik_exp_20261003"
}
Assert-True ($expRes.ok -eq $true) "Expense transaction must succeed"

$trfRes = Invoke-PfmApi -Action "transactions.create" -SessionToken $demoToken -Params @{
  tx_type         = "transfer"
  tx_date         = "2026-10-04"
  tx_time         = "10:15"
  account_id      = $bankAcc.account_id
  to_account_id   = $cashAcc.account_id
  category_id     = "cat_trf_internal"
  amount          = 2000
  merchant        = "ถอนเงินสดตู้ ATM กสิกรไทย"
  description     = "โอนจากบัญชีธนาคารเข้ากระเป๋าเงินสด"
  tags            = "atm,transfer"
  idempotency_key = "test_ik_trf_20261004"
}
Assert-True ($trfRes.ok -eq $true) "Transfer transaction must succeed"

$refRes = Invoke-PfmApi -Action "transactions.create" -SessionToken $demoToken -Params @{
  tx_type         = "refund"
  tx_date         = "2026-10-05"
  tx_time         = "15:00"
  account_id      = $bankAcc.account_id
  category_id     = "cat_exp_housing"
  amount          = 500
  merchant        = "คืนเงินส่วนลดค่าส่วนกลางคอนโด"
  description     = "ได้รับเงินคืนค่ามัดจำคีย์การ์ด"
  tags            = "refund"
  idempotency_key = "test_ik_ref_20261005"
}
Assert-True ($refRes.ok -eq $true) "Refund transaction must succeed"
Write-Host "[PASS] 7. Created Income, Expense, Transfer, and Refund transactions in Google Sheets" -ForegroundColor Green

# 6. CSV Import Preview & Commit
$previewRes = Invoke-PfmApi -Action "transactions.importCsvPreview" -SessionToken $demoToken -Params @{
  account_id = $cashAcc.account_id
  rows = @(
    @{ tx_date = "2026-10-06"; tx_type = "expense"; amount = 120; merchant = "7-Eleven"; description = "ซื้อของใช้ส่วนตัว" },
    @{ tx_date = "2026-10-07"; tx_type = "expense"; amount = 60;  merchant = "BTS SkyTrain"; description = "ค่าเดินทางรถไฟฟ้า" }
  )
}
Assert-True ($previewRes.ok -eq $true -and $previewRes.data.summary.total_rows -eq 2) "CSV preview must parse 2 rows"

$commitRes = Invoke-PfmApi -Action "transactions.importCsvCommit" -SessionToken $demoToken -Params @{
  account_id      = $cashAcc.account_id
  file_name       = "acceptance_test_statement.csv"
  skip_duplicates = $true
  items           = $previewRes.data.items
}
Assert-True ($commitRes.ok -eq $true) "CSV import commit must succeed"
Write-Host "[PASS] 8. Verified CSV Import Preview & Commit (Imported: $($commitRes.data.imported_count), Skipped Duplicates: $($commitRes.data.skipped_duplicates))" -ForegroundColor Green

# 7. Verify Dashboard Calculations & Transfer Non-Double-Counting
$dashRes = Invoke-PfmApi -Action "dashboard.summary" -SessionToken $demoToken -Params @{
  start_date = "2026-10-01"
  end_date   = "2026-10-31"
}
Assert-True ($dashRes.ok -eq $true) "Dashboard summary must succeed"
$kpis = $dashRes.data.kpis

Assert-True ([double]$kpis.period_income -eq 45000) "Period income must equal 45,000 (transfer excluded)"
Assert-True ([double]$kpis.period_expense -eq 8180) "Period net expense must equal 8,180 (gross 8,680 - refund 500; transfer excluded)"
Assert-True ([double]$kpis.period_transfers_volume -eq 2000) "Transfer volume must be 2,000"
Assert-True ([double]$kpis.period_net_cashflow -eq 36820) "Net cashflow must equal 36,820"
Write-Host "[PASS] 9. Verified Dashboard KPI Math & Transfer Non-Double-Counting: Income=$($kpis.period_income), NetExpense=$($kpis.period_expense), NetCashflow=$($kpis.period_net_cashflow), SavingsRate=$($kpis.savings_rate_pct)%" -ForegroundColor Green

# 8. Verify Multi-User Isolation
$u2Reg = Invoke-PfmApi -Action "auth.register" -SessionToken "" -Params @{
  full_name     = "Alice Isolated User"
  email         = "alice.isolation@pfm.local"
  password      = "Alice@1234"
  base_currency = "THB"
}
$u2Token = if ($u2Reg.ok) { $u2Reg.data.session_token } else {
  (Invoke-PfmApi -Action "auth.login" -SessionToken "" -Params @{ email = "alice.isolation@pfm.local"; password = "Alice@1234" }).data.session_token
}
$u2Accs = Invoke-PfmApi -Action "accounts.list" -SessionToken $u2Token -Params @{}
$u2Txs  = Invoke-PfmApi -Action "transactions.list" -SessionToken $u2Token -Params @{}
Assert-True ($u2Accs.data.accounts.Count -eq 0 -and $u2Txs.data.transactions.Count -eq 0) "User 2 must not see Demo user's accounts or transactions"
Write-Host "[PASS] 10. Verified Strict Multi-User Isolation (User 2 sees 0 records of User 1)" -ForegroundColor Green

# 9. Verify Backup Export & Audit Logs
$backupRes = Invoke-PfmApi -Action "system.backupExport" -SessionToken $demoToken -Params @{}
Assert-True ($backupRes.ok -eq $true -and $backupRes.data.backup.tables.Accounts.Count -ge 3) "Backup export must include user accounts"

$logsRes = Invoke-PfmApi -Action "system.auditLogs" -SessionToken $demoToken -Params @{}
Assert-True ($logsRes.ok -eq $true -and $logsRes.data.audit_logs.Count -gt 0) "Audit logs must be recorded"
Write-Host "[PASS] 11. Verified Backup JSON Export and Audit Logs in Google Sheets" -ForegroundColor Green

Write-Host "=== ALL PHASE 1 LIVE ACCEPTANCE TESTS PASSED SUCCESSFULLY ===" -ForegroundColor Cyan

