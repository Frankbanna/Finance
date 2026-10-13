# ==============================================================================
# PERSONAL FINANCE MANAGER PRO - PHASE 4 LIVE ACCEPTANCE TEST SUITE
# ==============================================================================
# Verifies Phase 4 (Smart Finance & Automation) against the REAL Google Sheets DB
# Spreadsheet ID: 15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A
# Note: Strictly excludes external Bank API per user security directive.
# ==============================================================================

$ErrorActionPreference = "Stop"
$ApiUrl = "http://localhost:3000/api"

function Invoke-PfmApi {
  param(
    [string]$Action,
    [hashtable]$Params = @{},
    [string]$Token = ""
  )
  $payload = @{
    action        = $Action
    session_token = $Token
    params        = $Params
  } | ConvertTo-Json -Depth 10 -Compress

  $res = Invoke-RestMethod -Uri $ApiUrl -Method Post -ContentType "application/json; charset=utf-8" -Body ([System.Text.Encoding]::UTF8.GetBytes($payload))
  if (-not $res.ok) {
    throw "API Error [$Action]: $($res.error.code) - $($res.error.message)"
  }
  return $res.data
}

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " RUNNING PHASE 4 LIVE GOOGLE SHEETS ACCEPTANCE TESTS" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan

# 1. Login with Demo User
$login = Invoke-PfmApi -Action "auth.login" -Params @{
  email    = "demo@pfm.local"
  password = "Demo@1234"
}
$token = $login.session_token
Write-Host "[PASS] 1. Authenticated as $($login.user.email) (Token acquired)" -ForegroundColor Green

# 2. Fetch Categories to get a valid expense category ID
$catRes = Invoke-PfmApi -Action "categories.list" -Token $token
$foodCat = $catRes.categories | Where-Object { $_.category_type -eq "expense" } | Select-Object -First 1
if (-not $foodCat) { throw "No expense category found" }
Write-Host "[PASS] 2. Loaded target category: $($foodCat.category_name) ($($foodCat.category_id))" -ForegroundColor Green

# 3. Create a Smart Auto-Categorization Rule in Google Sheets `Rules`
$ruleRes = Invoke-PfmApi -Action "rules.create" -Token $token -Params @{
  rule_name          = "Auto Coffee & Cafe Rule"
  match_field        = "any_text"
  match_operator     = "contains"
  match_value        = "starbucks"
  assign_category_id = $foodCat.category_id
  assign_tags        = "coffee,cafe,smart-rule"
  priority           = 5
  is_active          = $true
}
$ruleId = $ruleRes.rule.rule_id
Write-Host "[PASS] 3. Created Smart Rule in Rules sheet: $ruleId ($($ruleRes.rule.rule_name))" -ForegroundColor Green

# 4. Evaluate Rule against a sample merchant/description ("Bought Iced Latte at Starbucks Siam")
$evalActive = Invoke-PfmApi -Action "rules.evaluate" -Token $token -Params @{
  merchant    = "Starbucks Siam"
  description = "Bought Iced Latte"
  tx_type     = "expense"
}
if ($evalActive.matched_by -ne "user_rule" -or $evalActive.rule_id -ne $ruleId) {
  throw "Expected rule evaluation to match user_rule $ruleId"
}
Write-Host "[PASS] 4. Smart Rule Evaluator matched 'Starbucks' -> Category: $($evalActive.suggested_category_name), Tags: $($evalActive.suggested_tags)" -ForegroundColor Green

# 5. Toggle Rule OFF (is_active = false) and verify it does NOT match user_rule when disabled
$toggleOff = Invoke-PfmApi -Action "rules.update" -Token $token -Params @{
  rule_id   = $ruleId
  is_active = $false
}
$evalDisabled = Invoke-PfmApi -Action "rules.evaluate" -Token $token -Params @{
  merchant    = "Starbucks Siam"
  description = "Bought Iced Latte"
  tx_type     = "expense"
}
if ($evalDisabled.rule_id -eq $ruleId) {
  throw "Disabled rule should NOT match!"
}
Write-Host "[PASS] 5. Verified Rule Toggle OFF disables matching immediately" -ForegroundColor Green

# 6. Toggle Rule back ON (is_active = true)
$toggleOn = Invoke-PfmApi -Action "rules.update" -Token $token -Params @{
  rule_id   = $ruleId
  is_active = $true
}
$evalReEnabled = Invoke-PfmApi -Action "rules.evaluate" -Token $token -Params @{
  merchant    = "Starbucks Reserve"
  description = "Morning Coffee"
  tx_type     = "expense"
}
if ($evalReEnabled.rule_id -ne $ruleId) {
  throw "Re-enabled rule should match!"
}
Write-Host "[PASS] 6. Verified Rule Toggle ON re-enables matching ($($evalReEnabled.rule_name))" -ForegroundColor Green

# 7. Run Smart Financial Insights (Anomaly Detection, 30/60/90-day Cashflow Forecast, Budget & Goal Risk Radar)
$insights = Invoke-PfmApi -Action "analytics.insights" -Token $token
$fc = $insights.cashflow_forecasts
if (-not $fc -or -not $fc.days_30 -or -not $fc.days_60 -or -not $fc.days_90) {
  throw "Missing 30/60/90-day cashflow forecast horizons"
}
Write-Host "[PASS] 7. Smart Analytics & Cashflow Forecast computed from live Google Sheets:" -ForegroundColor Green
Write-Host "       - Starting Liquid Balance: $($insights.starting_liquid_balance) THB"
Write-Host "       - 30-Day Ending Cash Forecast: $($fc.days_30.projected_ending_cash) THB ($($fc.days_30.cashflow_status))"
Write-Host "       - 60-Day Ending Cash Forecast: $($fc.days_60.projected_ending_cash) THB ($($fc.days_60.cashflow_status))"
Write-Host "       - 90-Day Ending Cash Forecast: $($fc.days_90.projected_ending_cash) THB ($($fc.days_90.cashflow_status))"
Write-Host "       - Spending Anomalies Detected: $($insights.anomalies_detected.Count)"
Write-Host "       - At-Risk Budgets: $($insights.risk_radar.at_risk_budgets_count) | At-Risk Goals: $($insights.risk_radar.at_risk_goals_count)"

# 8. Dispatch Email & Google Calendar Reminder & log to Audit_Logs
$remindRes = Invoke-PfmApi -Action "automation.sendReminder" -Token $token -Params @{
  channel    = "both"
  title      = "[PFM PRO Live Test] Smart Financial & Bill Reminder"
  message    = "Automated test reminder for upcoming bills and budget status"
  event_date = (Get-Date).ToString("yyyy-MM-dd")
}
if (-not $remindRes.dispatched) {
  throw "Expected dispatched=true from automation.sendReminder"
}
Write-Host "[PASS] 8. Dispatched Email & Calendar Reminder -> Channel: $($remindRes.channel) ($($remindRes.detail))" -ForegroundColor Green

# 9. Verify Notifications Mark Read & Unread Count accuracy
$notifBefore = Invoke-PfmApi -Action "notifications.list" -Token $token
$markAll = Invoke-PfmApi -Action "notifications.markRead" -Token $token -Params @{
  mark_all = $true
}
$notifAfter = Invoke-PfmApi -Action "notifications.list" -Token $token
if ($notifAfter.unread_count -ne 0) {
  throw "Expected unread_count to be 0 after mark_all=true, got $($notifAfter.unread_count)"
}
Write-Host "[PASS] 9. Verified Notifications Mark-All-Read -> Unread Count: $($notifBefore.unread_count) -> $($notifAfter.unread_count)" -ForegroundColor Green

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host " ALL PHASE 4 LIVE GOOGLE SHEETS TESTS PASSED SUCCESSFULLY!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan

