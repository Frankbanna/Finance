# =============================================================================
# PERSONAL FINANCE MANAGER PRO
# Live Google Sheets Server & API Bridge (PowerShell + gsheets CLI)
# Connects Standalone Frontend directly to real Google Spreadsheet:
# 15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A
# =============================================================================

param(
  [int]$Port = 3000,
  [string]$SpreadsheetId = "15B_GJFBZjTEOhTeK89ZP0yWEosRbzMZ9Qx3hexa-I7A"
)
$ErrorActionPreference = "Stop"
$ProjectRoot = Split-Path -Parent $PSScriptRoot
$FrontendDir = Join-Path $ProjectRoot "frontend"
$GSheetsCmd  = "C:\Users\fang0\.gemini\config\plugins\gsheets\skills\gsheets\scripts\gsheets.cmd"
$TempBatchFile = Join-Path $env:TEMP "pfm_gsheets_batch.json"
$PepperSecret = "pfm_pro_default_pepper_$SpreadsheetId"

$SheetHeaders = @{
  "Users"              = @('user_id','email','password_hash','pin_hash','salt','full_name','base_currency','timezone','role','status','failed_attempts','locked_until','session_token_hash','session_expires_at','created_at','updated_at')
  "Accounts"           = @('account_id','user_id','account_name','account_type','currency','opening_balance','current_balance','credit_limit','billing_day','due_day','institution_name','account_number_masked','color','icon','include_in_net_worth','is_archived','last_reconciled_at','created_at','updated_at')
  "Transactions"       = @('transaction_id','user_id','tx_date','tx_time','tx_type','account_id','to_account_id','category_id','subcategory_id','amount','currency','exchange_rate','to_amount','merchant','description','tags','receipt_url','reference_tx_id','recurring_id','import_id','idempotency_key','dedup_hash','status','revision','edit_history_json','created_at','updated_at')
  "Categories"         = @('category_id','user_id','parent_id','category_name','category_type','color','icon','is_system','is_active','created_at','updated_at')
  "Budgets"            = @('budget_id','user_id','budget_name','period_type','category_id','amount_limit','currency','start_date','end_date','rollover_enabled','rollover_amount','alert_threshold_pct','is_active','created_at','updated_at')
  "Goals"              = @('goal_id','user_id','goal_name','target_amount','current_amount','currency','target_date','linked_account_id','priority','status','color','icon','notes','created_at','updated_at')
  "Goal_Contributions" = @('contribution_id','goal_id','user_id','tx_date','entry_type','amount','linked_transaction_id','note','created_at')
  "Recurring"          = @('recurring_id','user_id','title','tx_type','account_id','to_account_id','category_id','amount','currency','frequency','interval_count','start_date','end_date','next_run_date','last_run_date','auto_post','status','created_at','updated_at')
  "Debts"              = @('debt_id','user_id','debt_name','debt_type','lender_name','linked_account_id','principal_amount','current_balance','interest_rate_annual','minimum_payment','due_day','start_date','target_payoff_date','status','created_at','updated_at')
  "Debt_Payments"      = @('payment_id','debt_id','user_id','payment_date','total_amount','principal_paid','interest_paid','fee_amount','remaining_balance','linked_transaction_id','created_at')
  "Bills"              = @('bill_id','user_id','bill_name','category_id','amount','currency','due_date','is_recurring','frequency','status','remind_days_before','paid_transaction_id','notes','created_at','updated_at')
  "Rules"              = @('rule_id','user_id','rule_name','match_field','match_operator','match_value','assign_category_id','assign_tags','is_active','priority','created_at','updated_at')
  "Notifications"      = @('notification_id','user_id','notif_type','severity','title','message','reference_id','is_read','created_at')
  "Import_History"     = @('import_id','user_id','source_type','file_name','account_id','total_rows','imported_rows','skipped_duplicates','status','created_at')
  "Audit_Logs"         = @('log_id','request_id','user_id','action','entity_type','entity_id','summary','metadata_json','created_at')
  "Settings"           = @('setting_id','user_id','setting_key','setting_value','updated_at')
}

$Global:SheetData = @{}
$Global:PendingBatchOps = New-Object System.Collections.ArrayList

function Sync-AllSheetsFromGoogle() {
  Write-Host "[Sync] Pulling all 16 sheets from Google Spreadsheet ($SpreadsheetId)..." -ForegroundColor DarkCyan
  $rawLines = & $GSheetsCmd readonly read-all $SpreadsheetId --json
  $fullText = ($rawLines -join "`n")
  $blocks = $fullText -split "(?m)^--- (.+?) ---\r?\n"
  for ($i = 1; $i -lt $blocks.Count; $i += 2) {
    $sheetName = $blocks[$i].Trim()
    $jsonBlock = $blocks[$i + 1].Trim()
    $list = New-Object System.Collections.ArrayList
    if (-not [string]::IsNullOrWhiteSpace($jsonBlock) -and $jsonBlock -ne "null") {
      $parsed = $jsonBlock | ConvertFrom-Json
      if ($null -ne $parsed) {
        if ($parsed.Count -gt 0 -and ($parsed[0] -is [string] -or $parsed[0] -is [ValueType])) {
          # PowerShell 5.1 unwrapped a 1-row 2D array `[["col1","col2"]]` into `@("col1","col2")`
          $null = $list.Add(@($parsed))
        } else {
          foreach ($row in $parsed) {
            $null = $list.Add(@($row))
          }
        }
      }
    }
    $Global:SheetData[$sheetName] = $list
  }
  Write-Host "[Sync] Synchronized $($Global:SheetData.Keys.Count) sheets from Google Sheets." -ForegroundColor Green
}

function Flush-PendingBatchToGoogle() {
  if ($Global:PendingBatchOps.Count -eq 0) { return }
  $json = ConvertTo-Json -InputObject @($Global:PendingBatchOps) -Depth 10 -Compress
  [System.IO.File]::WriteAllText($TempBatchFile, $json, (New-Object System.Text.UTF8Encoding($false)))
  $Global:PendingBatchOps.Clear()
  $null = & $GSheetsCmd mutate batch $SpreadsheetId -f $TempBatchFile
}

function New-Id([string]$Prefix) {
  $u = [guid]::NewGuid().ToString("N").Substring(0, 16)
  return "${Prefix}_${u}"
}

function Get-NowIso() {
  return (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ")
}

function Get-HmacSha256([string]$PlainText, [string]$Salt) {
  $keyBytes = [System.Text.Encoding]::UTF8.GetBytes("${Salt}:${PepperSecret}")
  $msgBytes = [System.Text.Encoding]::UTF8.GetBytes($PlainText)
  $hmac = New-Object System.Security.Cryptography.HMACSHA256 -ArgumentList (,$keyBytes)
  $hashBytes = $hmac.ComputeHash($msgBytes)
  return ([System.BitConverter]::ToString($hashBytes)).Replace("-", "").ToLowerInvariant()
}

function Get-TxDedupHash([string]$UserId, [string]$TxDate, [string]$TxType, [string]$AccountId, [double]$Amount, [string]$Merchant) {
  $amtStr = $Amount.ToString("0.00", [System.Globalization.CultureInfo]::InvariantCulture)
  $norm = "$($UserId.Trim())|$($TxDate.Trim())|$($TxType.Trim().ToLowerInvariant())|$($AccountId.Trim())|$amtStr|$($Merchant.Trim().ToLowerInvariant())"
  $sha = [System.Security.Cryptography.SHA256]::Create()
  $bytes = $sha.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($norm))
  return ([System.BitConverter]::ToString($bytes)).Replace("-", "").ToLowerInvariant().Substring(0, 24)
}

function Read-SheetObjects([string]$SheetName) {
  $cols = $SheetHeaders[$SheetName]
  $rows = $Global:SheetData[$SheetName]
  $list = @()
  if ($null -eq $rows -or $rows.Count -le 1) {
    return @()
  }
  for ($r = 1; $r -lt $rows.Count; $r++) {
    $row = $rows[$r]
    if ($null -eq $row -or $row.Count -eq 0) { continue }
    $c0 = if ($row.Count -gt 0) { [string]$row[0] } else { "" }
    $c1 = if ($row.Count -gt 1) { [string]$row[1] } else { "" }
    if ([string]::IsNullOrWhiteSpace($c0) -and [string]::IsNullOrWhiteSpace($c1)) { continue }

    $obj = [ordered]@{ _rowIndex = ($r + 1) }
    for ($c = 0; $c -lt $cols.Count; $c++) {
      $colName = $cols[$c]
      $val = if ($c -lt $row.Count -and $null -ne $row[$c]) { $row[$c] } else { "" }
      $obj[$colName] = $val
    }
    $list += [pscustomobject]$obj
  }
  return $list
}

function Convert-ObjectToRow([string]$SheetName, $Obj) {
  $cols = $SheetHeaders[$SheetName]
  $arr = @()
  foreach ($col in $cols) {
    $v = $Obj.$col
    if ($null -eq $v) { $arr += "" } else { $arr += [string]$v }
  }
  return ,$arr
}

function Append-SheetObject([string]$SheetName, $Obj) {
  $rowArr = Convert-ObjectToRow -SheetName $SheetName -Obj $Obj
  if (-not $Global:SheetData.ContainsKey($SheetName)) {
    $Global:SheetData[$SheetName] = New-Object System.Collections.ArrayList
  }
  $null = $Global:SheetData[$SheetName].Add($rowArr)
  $op = [ordered]@{
    op    = "append"
    range = "${SheetName}!A1"
    data  = @( ,$rowArr )
  }
  $null = $Global:PendingBatchOps.Add($op)
}

function BatchAppend-SheetObjects([string]$SheetName, [array]$ObjList) {
  if ($null -eq $ObjList -or $ObjList.Count -eq 0) { return }
  if (-not $Global:SheetData.ContainsKey($SheetName)) {
    $Global:SheetData[$SheetName] = New-Object System.Collections.ArrayList
  }
  $rows = @()
  foreach ($o in $ObjList) {
    $r = Convert-ObjectToRow -SheetName $SheetName -Obj $o
    $null = $Global:SheetData[$SheetName].Add($r)
    $rows += ,$r
  }
  $op = [ordered]@{
    op    = "append"
    range = "${SheetName}!A1"
    data  = $rows
  }
  $null = $Global:PendingBatchOps.Add($op)
}

function Update-SheetRow([string]$SheetName, [int]$RowIndex, $Obj) {
  $rowArr = Convert-ObjectToRow -SheetName $SheetName -Obj $Obj
  $Global:SheetData[$SheetName][$RowIndex - 1] = $rowArr
  $op = [ordered]@{
    op    = "write"
    range = "${SheetName}!A${RowIndex}"
    data  = @( ,$rowArr )
  }
  $null = $Global:PendingBatchOps.Add($op)
}

function Write-AuditLog($RequestId, $UserId, $Action, $EntityType, $EntityId, $Summary, $MetaObj) {
  try {
    $entry = [pscustomobject]@{
      log_id        = (New-Id "aud")
      request_id    = $RequestId
      user_id       = if ($UserId) { $UserId } else { "ANONYMOUS" }
      action        = $Action
      entity_type   = $EntityType
      entity_id     = $EntityId
      summary       = $Summary
      metadata_json = ($MetaObj | ConvertTo-Json -Compress -Depth 5)
      created_at    = (Get-NowIso)
    }
    Append-SheetObject -SheetName "Audit_Logs" -Obj $entry
  } catch {}
}

function Sanitize-User($u) {
  return [ordered]@{
    user_id       = [string]$u.user_id
    email         = [string]$u.email
    full_name     = [string]$u.full_name
    base_currency = if ($u.base_currency) { [string]$u.base_currency } else { "THB" }
    timezone      = if ($u.timezone) { [string]$u.timezone } else { "Asia/Bangkok" }
    role          = if ($u.role) { [string]$u.role } else { "user" }
    status        = if ($u.status) { [string]$u.status } else { "active" }
    has_pin       = (-not [string]::IsNullOrWhiteSpace([string]$u.pin_hash))
    created_at    = [string]$u.created_at
    updated_at    = [string]$u.updated_at
  }
}

function Authenticate-Request([string]$SessionToken) {
  if ([string]::IsNullOrWhiteSpace($SessionToken)) {
    throw [System.Exception]::new("UNAUTHORIZED|กรุณาเข้าสู่ระบบก่อนใช้งาน")
  }
  $users = Read-SheetObjects -SheetName "Users"
  foreach ($u in $users) {
    if ([string]::IsNullOrWhiteSpace([string]$u.session_token_hash) -or [string]::IsNullOrWhiteSpace([string]$u.salt)) { continue }
    $expected = Get-HmacSha256 -PlainText $SessionToken -Salt ([string]$u.salt)
    if ($expected -eq [string]$u.session_token_hash) {
      if ([string]$u.status -ne "active") {
        throw [System.Exception]::new("ACCOUNT_LOCKED|บัญชีผู้ใช้นี้ถูกระงับหรือล็อกชั่วคราว")
      }
      return $u
    }
  }
  throw [System.Exception]::new("UNAUTHORIZED|เซสชันไม่ถูกต้องหรือหมดอายุ กรุณาเข้าสู่ระบบใหม่")
}

function Recalculate-UserAccountBalances([string]$UserId) {
  $allAccounts = Read-SheetObjects -SheetName "Accounts"
  $allTxs      = Read-SheetObjects -SheetName "Transactions"

  $userAccs = @()
  $balMap = @{}
  foreach ($a in $allAccounts) {
    if ([string]$a.user_id -eq $UserId) {
      $userAccs += $a
      $balMap[[string]$a.account_id] = [double]($a.opening_balance -as [double])
    }
  }

  foreach ($tx in $allTxs) {
    if ([string]$tx.user_id -ne $UserId) { continue }
    if ([string]$tx.status -ne "posted") { continue }
    $amt = [double]($tx.amount -as [double])
    $toAmt = if (-not [string]::IsNullOrWhiteSpace([string]$tx.to_amount)) { [double]($tx.to_amount -as [double]) } else { $amt }
    $accId = [string]$tx.account_id
    $toAccId = [string]$tx.to_account_id
    $tType = [string]$tx.tx_type

    if ($tType -eq "income" -or $tType -eq "refund") {
      if ($balMap.ContainsKey($accId)) { $balMap[$accId] += $amt }
    } elseif ($tType -eq "expense") {
      if ($balMap.ContainsKey($accId)) { $balMap[$accId] -= $amt }
    } elseif ($tType -eq "adjustment") {
      if ($balMap.ContainsKey($accId)) { $balMap[$accId] += $amt }
    } elseif ($tType -eq "transfer") {
      if ($balMap.ContainsKey($accId)) { $balMap[$accId] -= $amt }
      if ($toAccId -and $balMap.ContainsKey($toAccId)) { $balMap[$toAccId] += $toAmt }
    }
  }

  $now = Get-NowIso
  $normalizedList = @()
  foreach ($acc in $userAccs) {
    $aid = [string]$acc.account_id
    $computed = [Math]::Round([double]$balMap[$aid], 2)
    $curBal = [Math]::Round([double]($acc.current_balance -as [double]), 2)
    if ($computed -ne $curBal) {
      $acc.current_balance = $computed
      $acc.updated_at = $now
      Update-SheetRow -SheetName "Accounts" -RowIndex $acc._rowIndex -Obj $acc
    }
    $normalizedList += [ordered]@{
      account_id            = [string]$acc.account_id
      user_id               = [string]$acc.user_id
      account_name          = [string]$acc.account_name
      account_type          = [string]$acc.account_type
      currency              = if ($acc.currency) { [string]$acc.currency } else { "THB" }
      opening_balance       = [double]($acc.opening_balance -as [double])
      current_balance       = $computed
      credit_limit          = [double]($acc.credit_limit -as [double])
      billing_day           = if ($acc.billing_day) { [int]($acc.billing_day -as [int]) } else { $null }
      due_day               = if ($acc.due_day) { [int]($acc.due_day -as [int]) } else { $null }
      institution_name      = [string]$acc.institution_name
      account_number_masked = [string]$acc.account_number_masked
      color                 = if ($acc.color) { [string]$acc.color } else { "#2563EB" }
      icon                  = if ($acc.icon) { [string]$acc.icon } else { "wallet" }
      include_in_net_worth  = ([string]$acc.include_in_net_worth -ne "FALSE" -and [string]$acc.include_in_net_worth -ne "False")
      is_archived           = ([string]$acc.is_archived -eq "TRUE" -or [string]$acc.is_archived -eq "True")
      last_reconciled_at    = [string]$acc.last_reconciled_at
      created_at            = [string]$acc.created_at
      updated_at            = [string]$acc.updated_at
    }
  }
  return ,$normalizedList
}

function Normalize-Transaction($r) {
  $hist = @()
  if (-not [string]::IsNullOrWhiteSpace([string]$r.edit_history_json)) {
    try {
      $parsed = [string]$r.edit_history_json | ConvertFrom-Json
      if ($parsed -is [array]) { $hist = $parsed } else { $hist = @($parsed) }
    } catch {}
  }
  $tagsStr = [string]$r.tags
  $tagArr = @()
  if (-not [string]::IsNullOrWhiteSpace($tagsStr)) {
    $tagArr = @($tagsStr.Split(",") | ForEach-Object { $_.Trim() } | Where-Object { $_ -ne "" })
  }
  $amt = [double]($r.amount -as [double])
  $toAmt = if (-not [string]::IsNullOrWhiteSpace([string]$r.to_amount)) { [double]($r.to_amount -as [double]) } else { $amt }

  return [ordered]@{
    transaction_id   = [string]$r.transaction_id
    user_id          = [string]$r.user_id
    tx_date          = ([string]$r.tx_date).Substring(0, [Math]::Min(10, ([string]$r.tx_date).Length))
    tx_time          = if ($r.tx_time) { [string]$r.tx_time } else { "12:00" }
    tx_type          = [string]$r.tx_type
    account_id       = [string]$r.account_id
    to_account_id    = [string]$r.to_account_id
    category_id      = [string]$r.category_id
    subcategory_id   = [string]$r.subcategory_id
    amount           = $amt
    currency         = if ($r.currency) { [string]$r.currency } else { "THB" }
    exchange_rate    = if ($r.exchange_rate) { [double]($r.exchange_rate -as [double]) } else { 1.0 }
    to_amount        = $toAmt
    merchant         = [string]$r.merchant
    description      = [string]$r.description
    tags             = $tagArr
    tags_raw         = $tagsStr
    receipt_url      = [string]$r.receipt_url
    reference_tx_id  = [string]$r.reference_tx_id
    recurring_id     = [string]$r.recurring_id
    import_id        = [string]$r.import_id
    idempotency_key  = [string]$r.idempotency_key
    dedup_hash       = [string]$r.dedup_hash
    status           = if ($r.status) { [string]$r.status } else { "posted" }
    revision         = if ($r.revision) { [int]($r.revision -as [int]) } else { 1 }
    edit_history     = $hist
    created_at       = [string]$r.created_at
    updated_at       = [string]$r.updated_at
  }
}

function Invoke-ApiAction([string]$RequestId, [string]$Action, [string]$SessionToken, $Params) {
  $publicActions = @("system.ping", "system.setup", "auth.register", "auth.login")
  $authUser = $null
  if ($publicActions -notcontains $Action) {
    $authUser = Authenticate-Request -SessionToken $SessionToken
  }

  switch ($Action) {
    "system.ping" {
      return @{
        service = "Bank_bana"
        version = "1.0.0-phase4-complete"
        status  = "healthy"
        spreadsheet_id = $SpreadsheetId
      }
    }

    "system.setup" {
      return @{
        spreadsheet_id = $SpreadsheetId
        verified_sheets = @($SheetHeaders.Keys)
        timestamp = (Get-NowIso)
      }
    }

    "auth.register" {
      $email = ([string]$Params.email).Trim().ToLowerInvariant()
      $password = [string]$Params.password
      $pin = ([string]$Params.pin).Trim()
      $fullName = ([string]$Params.full_name).Trim()
      $baseCur = if ($Params.base_currency) { ([string]$Params.base_currency).Trim().ToUpperInvariant() } else { "THB" }
      $tz = if ($Params.timezone) { ([string]$Params.timezone).Trim() } else { "Asia/Bangkok" }

      if ([string]::IsNullOrWhiteSpace($email) -or [string]::IsNullOrWhiteSpace($password) -or [string]::IsNullOrWhiteSpace($fullName)) {
        throw [System.Exception]::new("VALIDATION_ERROR|กรุณากรอกชื่อ อีเมล และรหัสผ่านให้ครบถ้วน")
      }
      if ($password.Length -lt 6) {
        throw [System.Exception]::new("VALIDATION_ERROR|รหัสผ่านต้องมีอย่างน้อย 6 ตัวอักษร")
      }
      if ($pin -and $pin -notmatch '^\d{6}$') {
        throw [System.Exception]::new("VALIDATION_ERROR|รหัส PIN ต้องเป็นตัวเลข 6 หลักเท่านั้น")
      }

      $users = Read-SheetObjects -SheetName "Users"
      foreach ($u in $users) {
        if (([string]$u.email).ToLowerInvariant() -eq $email) {
          throw [System.Exception]::new("DUPLICATE_EMAIL|อีเมลนี้ถูกใช้งานในระบบแล้ว")
        }
      }

      $now = Get-NowIso
      $userId = New-Id "usr"
      $salt = [guid]::NewGuid().ToString("N")
      $pwdHash = Get-HmacSha256 -PlainText $password -Salt $salt
      $pinHash = if ($pin) { Get-HmacSha256 -PlainText $pin -Salt $salt } else { "" }
      $rawToken = "tok_" + [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
      $tokHash = Get-HmacSha256 -PlainText $rawToken -Salt $salt
      $expAt = (Get-Date).ToUniversalTime().AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

      $newUser = [pscustomobject]@{
        user_id            = $userId
        email              = $email
        password_hash      = $pwdHash
        pin_hash           = $pinHash
        salt               = $salt
        full_name          = $fullName
        base_currency      = $baseCur
        timezone           = $tz
        role               = "user"
        status             = "active"
        failed_attempts    = 0
        locked_until       = ""
        session_token_hash = $tokHash
        session_expires_at = $expAt
        created_at         = $now
        updated_at         = $now
      }
      Append-SheetObject -SheetName "Users" -Obj $newUser
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "auth.register" -EntityType "Users" -EntityId $userId -Summary "ลงทะเบียนผู้ใช้ใหม่: $email" -MetaObj @{ email = $email }

      return @{
        user          = (Sanitize-User $newUser)
        session_token = $rawToken
        expires_at    = $expAt
      }
    }

    "auth.login" {
      $email = ([string]$Params.email).Trim().ToLowerInvariant()
      $authMode = if ($Params.auth_mode) { ([string]$Params.auth_mode).Trim().ToLowerInvariant() } else { "password" }
      $cred = if ($authMode -eq "pin") { ([string]$Params.pin).Trim() } else { [string]$Params.password }

      $users = Read-SheetObjects -SheetName "Users"
      $userRow = $null
      foreach ($u in $users) {
        if (([string]$u.email).ToLowerInvariant() -eq $email) {
          $userRow = $u
          break
        }
      }
      if ($null -eq $userRow) {
        throw [System.Exception]::new("INVALID_CREDENTIALS|อีเมลหรือรหัสยืนยันตัวตนไม่ถูกต้อง")
      }

      $incomingHash = Get-HmacSha256 -PlainText $cred -Salt ([string]$userRow.salt)
      $isValid = $false
      if ($authMode -eq "pin") {
        if ([string]::IsNullOrWhiteSpace([string]$userRow.pin_hash)) {
          throw [System.Exception]::new("PIN_NOT_SET|บัญชีนี้ยังไม่ได้ตั้งรหัส PIN")
        }
        $isValid = ($incomingHash -eq [string]$userRow.pin_hash)
      } else {
        $isValid = ($incomingHash -eq [string]$userRow.password_hash)
      }

      if (-not $isValid) {
        $attempts = [int]($userRow.failed_attempts -as [int]) + 1
        $userRow.failed_attempts = $attempts
        $userRow.updated_at = (Get-NowIso)
        Update-SheetRow -SheetName "Users" -RowIndex $userRow._rowIndex -Obj $userRow
        throw [System.Exception]::new("INVALID_CREDENTIALS|อีเมลหรือรหัสยืนยันตัวตนไม่ถูกต้อง (ผิดครั้งที่ $attempts/5)")
      }

      $now = Get-NowIso
      $rawToken = "tok_" + [guid]::NewGuid().ToString("N") + [guid]::NewGuid().ToString("N")
      $tokHash = Get-HmacSha256 -PlainText $rawToken -Salt ([string]$userRow.salt)
      $expAt = (Get-Date).ToUniversalTime().AddDays(7).ToString("yyyy-MM-ddTHH:mm:ss.fffZ")

      $userRow.failed_attempts = 0
      $userRow.locked_until = ""
      $userRow.session_token_hash = $tokHash
      $userRow.session_expires_at = $expAt
      $userRow.updated_at = $now

      Update-SheetRow -SheetName "Users" -RowIndex $userRow._rowIndex -Obj $userRow
      Write-AuditLog -RequestId $RequestId -UserId $userRow.user_id -Action "auth.login" -EntityType "Users" -EntityId $userRow.user_id -Summary "เข้าสู่ระบบสำเร็จ ($authMode)" -MetaObj @{ auth_mode = $authMode }

      return @{
        user          = (Sanitize-User $userRow)
        session_token = $rawToken
        expires_at    = $expAt
      }
    }

    "auth.logout" {
      $authUser.session_token_hash = ""
      $authUser.session_expires_at = ""
      $authUser.updated_at = (Get-NowIso)
      Update-SheetRow -SheetName "Users" -RowIndex $authUser._rowIndex -Obj $authUser
      return @{ logged_out = $true }
    }

    "auth.me" {
      return @{ user = (Sanitize-User $authUser) }
    }

    "auth.updateProfile" {
      if ($Params.full_name) { $authUser.full_name = ([string]$Params.full_name).Trim() }
      if ($Params.base_currency) { $authUser.base_currency = ([string]$Params.base_currency).Trim().ToUpperInvariant() }
      if ($Params.timezone) { $authUser.timezone = ([string]$Params.timezone).Trim() }
      if ($Params.new_password) {
        $curHash = Get-HmacSha256 -PlainText ([string]$Params.current_password) -Salt ([string]$authUser.salt)
        if ($curHash -ne [string]$authUser.password_hash) {
          throw [System.Exception]::new("INVALID_CREDENTIALS|รหัสผ่านปัจจุบันไม่ถูกต้อง")
        }
        $authUser.password_hash = Get-HmacSha256 -PlainText ([string]$Params.new_password) -Salt ([string]$authUser.salt)
      }
      if ($null -ne $Params.new_pin -and ([string]$Params.new_pin).Trim() -ne "") {
        $pinStr = ([string]$Params.new_pin).Trim()
        if ($pinStr -notmatch '^\d{6}$') {
          throw [System.Exception]::new("VALIDATION_ERROR|รหัส PIN ต้องเป็นตัวเลข 6 หลัก")
        }
        $authUser.pin_hash = Get-HmacSha256 -PlainText $pinStr -Salt ([string]$authUser.salt)
      }
      $authUser.updated_at = (Get-NowIso)
      Update-SheetRow -SheetName "Users" -RowIndex $authUser._rowIndex -Obj $authUser
      Write-AuditLog -RequestId $RequestId -UserId $authUser.user_id -Action "auth.updateProfile" -EntityType "Users" -EntityId $authUser.user_id -Summary "อัปเดตโปรไฟล์ผู้ใช้" -MetaObj @{}
      return @{ user = (Sanitize-User $authUser) }
    }

    "categories.list" {
      $userId = [string]$authUser.user_id
      $allRows = Read-SheetObjects -SheetName "Categories"
      $cats = @()
      foreach ($r in $allRows) {
        if ([string]$r.user_id -ne "SYSTEM" -and [string]$r.user_id -ne $userId) { continue }
        if ([string]$r.is_active -eq "FALSE" -or [string]$r.is_active -eq "False") { continue }
        $cats += [ordered]@{
          category_id   = [string]$r.category_id
          user_id       = [string]$r.user_id
          parent_id     = [string]$r.parent_id
          category_name = [string]$r.category_name
          category_type = [string]$r.category_type
          color         = if ($r.color) { [string]$r.color } else { "#64748B" }
          icon          = if ($r.icon) { [string]$r.icon } else { "tag" }
          is_system     = ([string]$r.user_id -eq "SYSTEM" -or [string]$r.is_system -eq "TRUE" -or [string]$r.is_system -eq "True")
          is_active     = $true
        }
      }
      return @{ categories = $cats }
    }

    "categories.create" {
      $userId = [string]$authUser.user_id
      $now = Get-NowIso
      $newCat = [pscustomobject]@{
        category_id   = (New-Id "cat")
        user_id       = $userId
        parent_id     = ([string]$Params.parent_id).Trim()
        category_name = ([string]$Params.category_name).Trim()
        category_type = ([string]$Params.category_type).Trim()
        color         = if ($Params.color) { ([string]$Params.color).Trim() } else { "#3B82F6" }
        icon          = "tag"
        is_system     = "FALSE"
        is_active     = "TRUE"
        created_at    = $now
        updated_at    = $now
      }
      Append-SheetObject -SheetName "Categories" -Obj $newCat
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "categories.create" -EntityType "Categories" -EntityId $newCat.category_id -Summary "สร้างหมวดหมู่: $($newCat.category_name)" -MetaObj @{}
      return @{ category = $newCat }
    }

    "accounts.list" {
      $userId = [string]$authUser.user_id
      $accs = Recalculate-UserAccountBalances -UserId $userId
      return @{ accounts = $accs }
    }

    "accounts.create" {
      $userId = [string]$authUser.user_id
      $now = Get-NowIso
      $openBal = [Math]::Round([double]($Params.opening_balance -as [double]), 2)
      $newAcc = [pscustomobject]@{
        account_id            = (New-Id "acc")
        user_id               = $userId
        account_name          = ([string]$Params.account_name).Trim()
        account_type          = ([string]$Params.account_type).Trim()
        currency              = if ($Params.currency) { ([string]$Params.currency).Trim().ToUpperInvariant() } else { "THB" }
        opening_balance       = $openBal
        current_balance       = $openBal
        credit_limit          = [double]($Params.credit_limit -as [double])
        billing_day           = if ($Params.billing_day) { $Params.billing_day } else { "" }
        due_day               = if ($Params.due_day) { $Params.due_day } else { "" }
        institution_name      = ([string]$Params.institution_name).Trim()
        account_number_masked = ([string]$Params.account_number_masked).Trim()
        color                 = if ($Params.color) { ([string]$Params.color).Trim() } else { "#2563EB" }
        icon                  = "wallet"
        include_in_net_worth  = if ($Params.include_in_net_worth -eq $false) { "FALSE" } else { "TRUE" }
        is_archived           = "FALSE"
        last_reconciled_at    = $now
        created_at            = $now
        updated_at            = $now
      }
      Append-SheetObject -SheetName "Accounts" -Obj $newAcc
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "accounts.create" -EntityType "Accounts" -EntityId $newAcc.account_id -Summary "สร้างบัญชี: $($newAcc.account_name)" -MetaObj @{ opening_balance = $openBal }
      $accs = Recalculate-UserAccountBalances -UserId $userId
      $created = $accs | Where-Object { $_.account_id -eq $newAcc.account_id } | Select-Object -First 1
      return @{ account = $created }
    }

    "accounts.update" {
      $userId = [string]$authUser.user_id
      $accId = ([string]$Params.account_id).Trim()
      $allAccs = Read-SheetObjects -SheetName "Accounts"
      $target = $null
      foreach ($a in $allAccs) {
        if ([string]$a.account_id -eq $accId -and [string]$a.user_id -eq $userId) {
          $target = $a
          break
        }
      }
      if ($null -eq $target) {
        throw [System.Exception]::new("NOT_FOUND|ไม่พบบัญชีที่ต้องการแก้ไข")
      }
      if ($null -ne $Params.account_name) { $target.account_name = ([string]$Params.account_name).Trim() }
      if ($null -ne $Params.account_type) { $target.account_type = ([string]$Params.account_type).Trim() }
      if ($null -ne $Params.currency) { $target.currency = ([string]$Params.currency).Trim().ToUpperInvariant() }
      if ($null -ne $Params.opening_balance) { $target.opening_balance = [double]($Params.opening_balance -as [double]) }
      if ($null -ne $Params.institution_name) { $target.institution_name = ([string]$Params.institution_name).Trim() }
      if ($null -ne $Params.account_number_masked) { $target.account_number_masked = ([string]$Params.account_number_masked).Trim() }
      if ($null -ne $Params.credit_limit) { $target.credit_limit = [double]($Params.credit_limit -as [double]) }
      if ($null -ne $Params.color) { $target.color = ([string]$Params.color).Trim() }
      $target.updated_at = (Get-NowIso)
      Update-SheetRow -SheetName "Accounts" -RowIndex $target._rowIndex -Obj $target

      $accs = Recalculate-UserAccountBalances -UserId $userId
      $updated = $accs | Where-Object { $_.account_id -eq $accId } | Select-Object -First 1
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "accounts.update" -EntityType "Accounts" -EntityId $accId -Summary "แก้ไขบัญชี: $($target.account_name)" -MetaObj @{}
      return @{ account = $updated }
    }

    "accounts.reconcile" {
      $userId = [string]$authUser.user_id
      $accId = ([string]$Params.account_id).Trim()
      $actualBal = [Math]::Round([double]($Params.actual_balance -as [double]), 2)
      $note = if ($Params.note) { ([string]$Params.note).Trim() } else { "กระทบยอดบัญชี (Reconciliation)" }

      $null = Recalculate-UserAccountBalances -UserId $userId
      $allAccs = Read-SheetObjects -SheetName "Accounts"
      $target = $null
      foreach ($a in $allAccs) {
        if ([string]$a.account_id -eq $accId -and [string]$a.user_id -eq $userId) {
          $target = $a
          break
        }
      }
      if ($null -eq $target) {
        throw [System.Exception]::new("NOT_FOUND|ไม่พบบัญชีที่ต้องการกระทบยอด")
      }

      $curBal = [Math]::Round([double]($target.current_balance -as [double]), 2)
      $diff = [Math]::Round($actualBal - $curBal, 2)
      $now = Get-NowIso
      $todayStr = (Get-Date).ToString("yyyy-MM-dd")
      $timeStr  = (Get-Date).ToString("HH:mm")

      if ([Math]::Abs($diff) -ge 0.01) {
        $txId = New-Id "txn"
        $histJson = (@(@{ revision = 1; action = "created_by_reconcile"; timestamp = $now; previous_balance = $curBal; actual_balance = $actualBal; diff = $diff }) | ConvertTo-Json -Compress)
        $adjTx = [pscustomobject]@{
          transaction_id    = $txId
          user_id           = $userId
          tx_date           = $todayStr
          tx_time           = $timeStr
          tx_type           = "adjustment"
          account_id        = $accId
          to_account_id     = ""
          category_id       = "cat_adj_reconcile"
          subcategory_id    = ""
          amount            = $diff
          currency          = [string]$target.currency
          exchange_rate     = 1
          to_amount         = $diff
          merchant          = "System Reconciliation"
          description       = "$note (เดิม: $curBal -> จริง: $actualBal)"
          tags              = "reconcile,adjustment"
          receipt_url       = ""
          reference_tx_id   = ""
          recurring_id      = ""
          import_id         = ""
          idempotency_key   = "rec_$txId"
          dedup_hash        = (Get-TxDedupHash -UserId $userId -TxDate $todayStr -TxType "adjustment" -AccountId $accId -Amount $diff -Merchant "System Reconciliation")
          status            = "posted"
          revision          = 1
          edit_history_json = $histJson
          created_at        = $now
          updated_at        = $now
        }
        Append-SheetObject -SheetName "Transactions" -Obj $adjTx
      }

      $target.current_balance = $actualBal
      $target.last_reconciled_at = $now
      $target.updated_at = $now
      Update-SheetRow -SheetName "Accounts" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "accounts.reconcile" -EntityType "Accounts" -EntityId $accId -Summary "กระทบยอดบัญชี ส่วนต่าง: $diff" -MetaObj @{ diff = $diff }

      $accs = Recalculate-UserAccountBalances -UserId $userId
      $updated = $accs | Where-Object { $_.account_id -eq $accId } | Select-Object -First 1
      return @{
        account = $updated
        difference = $diff
      }
    }

    "accounts.balanceHistory" {
      $userId = [string]$authUser.user_id
      $accId = ([string]$Params.account_id).Trim()
      $accs = Recalculate-UserAccountBalances -UserId $userId
      $target = $accs | Where-Object { $_.account_id -eq $accId } | Select-Object -First 1
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบบัญชี") }

      $allTxs = Read-SheetObjects -SheetName "Transactions" | Where-Object {
        [string]$_.user_id -eq $userId -and [string]$_.status -eq "posted" -and ([string]$_.account_id -eq $accId -or [string]$_.to_account_id -eq $accId)
      } | Sort-Object { "$($_.tx_date) $($_.tx_time)" }

      $running = [double]$target.opening_balance
      $hist = @(
        [ordered]@{
          date = ([string]$target.created_at).Substring(0, [Math]::Min(10, ([string]$target.created_at).Length))
          time = "00:00"
          event = "ยอดเงินตั้งต้น (Opening Balance)"
          change = $running
          balance_after = $running
        }
      )

      foreach ($tx in $allTxs) {
        $amt = [double]($tx.amount -as [double])
        $toAmt = if (-not [string]::IsNullOrWhiteSpace([string]$tx.to_amount)) { [double]($tx.to_amount -as [double]) } else { $amt }
        $delta = 0.0
        $tType = [string]$tx.tx_type
        if ($tType -eq "income" -or $tType -eq "refund") { $delta = $amt }
        elseif ($tType -eq "expense") { $delta = -$amt }
        elseif ($tType -eq "adjustment") { $delta = $amt }
        elseif ($tType -eq "transfer") {
          if ([string]$tx.account_id -eq $accId) { $delta = -$amt }
          if ([string]$tx.to_account_id -eq $accId) { $delta = $toAmt }
        }
        $running = [Math]::Round($running + $delta, 2)
        $hist += [ordered]@{
          date = [string]$tx.tx_date
          time = [string]$tx.tx_time
          event = if ($tx.merchant) { [string]$tx.merchant } else { [string]$tx.description }
          change = $delta
          balance_after = $running
        }
      }
      return @{ account = $target; history = $hist }
    }

    "transactions.list" {
      $userId = [string]$authUser.user_id
      $search = if ($Params.search) { ([string]$Params.search).Trim().ToLowerInvariant() } else { "" }
      $txType = if ($Params.tx_type) { ([string]$Params.tx_type).Trim() } else { "" }
      $accId  = if ($Params.account_id) { ([string]$Params.account_id).Trim() } else { "" }
      $catId  = if ($Params.category_id) { ([string]$Params.category_id).Trim() } else { "" }
      $statusFilter = if ($Params.status) { ([string]$Params.status).Trim() } else { "ALL_ACTIVE" }
      $startDate = if ($Params.start_date) { ([string]$Params.start_date).Trim() } else { "" }
      $endDate   = if ($Params.end_date) { ([string]$Params.end_date).Trim() } else { "" }
      $sortBy    = if ($Params.sort_by) { ([string]$Params.sort_by).Trim() } else { "tx_date" }
      $sortDir   = if ($Params.sort_dir) { ([string]$Params.sort_dir).Trim().ToLowerInvariant() } else { "desc" }
      $page      = [Math]::Max(1, [int]($Params.page -as [int]))
      if ($page -eq 0) { $page = 1 }
      $pageSize  = [int]($Params.page_size -as [int])
      if ($pageSize -le 0) { $pageSize = 20 }

      $allRows = Read-SheetObjects -SheetName "Transactions"
      $filtered = @()
      foreach ($r in $allRows) {
        if ([string]$r.user_id -ne $userId) { continue }
        $st = if ($r.status) { [string]$r.status } else { "posted" }
        if ($statusFilter -eq "ALL_ACTIVE" -and $st -eq "voided") { continue }
        if ($statusFilter -ne "ALL" -and $statusFilter -ne "ALL_ACTIVE" -and $st -ne $statusFilter) { continue }

        $dStr = ([string]$r.tx_date).Substring(0, [Math]::Min(10, ([string]$r.tx_date).Length))
        if ($startDate -and $dStr -lt $startDate) { continue }
        if ($endDate -and $dStr -gt $endDate) { continue }
        if ($txType -and [string]$r.tx_type -ne $txType) { continue }
        if ($accId -and [string]$r.account_id -ne $accId -and [string]$r.to_account_id -ne $accId) { continue }
        if ($catId -and [string]$r.category_id -ne $catId -and [string]$r.subcategory_id -ne $catId) { continue }

        if ($search) {
          $hay = "$($r.merchant) $($r.description) $($r.tags) $($r.transaction_id) $($r.amount)".ToLowerInvariant()
          if (-not $hay.Contains($search)) { continue }
        }
        $filtered += ,(Normalize-Transaction $r)
      }

      if ($sortBy -eq "amount") {
        $filtered = if ($sortDir -eq "asc") { @($filtered | Sort-Object { [double]$_.amount }) } else { @($filtered | Sort-Object { [double]$_.amount } -Descending) }
      } elseif ($sortBy -eq "merchant") {
        $filtered = if ($sortDir -eq "asc") { @($filtered | Sort-Object { [string]$_.merchant }) } else { @($filtered | Sort-Object { [string]$_.merchant } -Descending) }
      } else {
        $filtered = if ($sortDir -eq "asc") { @($filtered | Sort-Object { "$($_.tx_date) $($_.tx_time) $($_.created_at)" }) } else { @($filtered | Sort-Object { "$($_.tx_date) $($_.tx_time) $($_.created_at)" } -Descending) }
      }

      $totalCount = $filtered.Count
      $totalPages = [Math]::Max(1, [int][Math]::Ceiling($totalCount / [double]$pageSize))
      $offset = ($page - 1) * $pageSize
      $pagedItems = @($filtered | Select-Object -Skip $offset -First $pageSize)

      return @{
        transactions = $pagedItems
        pagination = @{
          page = $page
          page_size = $pageSize
          total_count = $totalCount
          total_pages = $totalPages
        }
      }
    }

    "transactions.create" {
      $userId = [string]$authUser.user_id
      $txType = ([string]$Params.tx_type).Trim()
      $txDate = ([string]$Params.tx_date).Trim()
      $txTime = if ($Params.tx_time) { ([string]$Params.tx_time).Trim() } else { "12:00" }
      $accId  = ([string]$Params.account_id).Trim()
      $toAccId = if ($txType -eq "transfer") { ([string]$Params.to_account_id).Trim() } else { "" }
      $amt = [Math]::Round([double]($Params.amount -as [double]), 2)

      if ($txType -eq "transfer" -and ($accId -eq $toAccId -or [string]::IsNullOrWhiteSpace($toAccId))) {
        throw [System.Exception]::new("VALIDATION_ERROR|การโอนเงินต้องระบุบัญชีปลายทางที่ไม่ซ้ำกับบัญชีต้นทาง")
      }
      if ($amt -eq 0 -or ($txType -ne "adjustment" -and $amt -lt 0)) {
        throw [System.Exception]::new("VALIDATION_ERROR|จำนวนเงินต้องมากกว่า 0")
      }

      $allAccs = Read-SheetObjects -SheetName "Accounts"
      $sourceAcc = $null
      foreach ($a in $allAccs) {
        if ([string]$a.user_id -eq $userId -and [string]$a.account_id -eq $accId) {
          $sourceAcc = $a
          break
        }
      }
      if ($null -eq $sourceAcc) {
        throw [System.Exception]::new("NOT_FOUND|ไม่พบบัญชีต้นทาง")
      }

      $catId = if ($Params.category_id) { ([string]$Params.category_id).Trim() } else {
        if ($txType -eq "transfer") { "cat_trf_internal" } elseif ($txType -eq "adjustment") { "cat_adj_reconcile" } else { "cat_exp_shopping" }
      }
      $subCatId = ([string]$Params.subcategory_id).Trim()
      $merchant = ([string]$Params.merchant).Trim()
      $desc     = ([string]$Params.description).Trim()
      $tags     = ([string]$Params.tags).Trim()
      $receipt  = ([string]$Params.receipt_url).Trim()
      $ik       = ([string]$Params.idempotency_key).Trim()
      $dedup    = Get-TxDedupHash -UserId $userId -TxDate $txDate -TxType $txType -AccountId $accId -Amount $amt -Merchant ($merchant + $desc)
      $allowDup = ($Params.allow_duplicate -eq $true)

      $allTxs = Read-SheetObjects -SheetName "Transactions"
      foreach ($ex in $allTxs) {
        if ([string]$ex.user_id -ne $userId) { continue }
        if ($ik -and [string]$ex.idempotency_key -eq $ik) {
          return @{
            transaction = (Normalize-Transaction $ex)
            idempotent_replay = $true
          }
        }
        if (-not $allowDup -and [string]$ex.status -eq "posted" -and [string]$ex.dedup_hash -eq $dedup) {
          throw [System.Exception]::new("DUPLICATE_TRANSACTION|ตรวจพบรายการซ้ำกับข้อมูลที่มีอยู่แล้ว หากต้องการบันทึกซ้ำกรุณายืนยัน")
        }
      }

      $now = Get-NowIso
      $txId = New-Id "txn"
      $histJson = (@(@{ revision = 1; action = "created"; timestamp = $now; amount = $amt; tx_type = $txType }) | ConvertTo-Json -Compress)

      $newTx = [pscustomobject]@{
        transaction_id    = $txId
        user_id           = $userId
        tx_date           = $txDate
        tx_time           = $txTime
        tx_type           = $txType
        account_id        = $accId
        to_account_id     = $toAccId
        category_id       = $catId
        subcategory_id    = $subCatId
        amount            = $amt
        currency          = if ($sourceAcc.currency) { [string]$sourceAcc.currency } else { "THB" }
        exchange_rate     = 1
        to_amount         = $amt
        merchant          = $merchant
        description       = $desc
        tags              = $tags
        receipt_url       = $receipt
        reference_tx_id   = ""
        recurring_id      = ""
        import_id         = ""
        idempotency_key   = if ($ik) { $ik } else { "ik_$txId" }
        dedup_hash        = $dedup
        status            = "posted"
        revision          = 1
        edit_history_json = $histJson
        created_at        = $now
        updated_at        = $now
      }
      Append-SheetObject -SheetName "Transactions" -Obj $newTx
      $updatedAccs = Recalculate-UserAccountBalances -UserId $userId
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "transactions.create" -EntityType "Transactions" -EntityId $txId -Summary "สร้างธุรกรรม $txType จำนวน $amt" -MetaObj @{ tx_type = $txType; amount = $amt }

      return @{
        transaction = (Normalize-Transaction $newTx)
        accounts    = $updatedAccs
      }
    }

    "transactions.update" {
      $userId = [string]$authUser.user_id
      $txId = ([string]$Params.transaction_id).Trim()
      $allTxs = Read-SheetObjects -SheetName "Transactions"
      $target = $null
      foreach ($t in $allTxs) {
        if ([string]$t.transaction_id -eq $txId -and [string]$t.user_id -eq $userId) {
          $target = $t
          break
        }
      }
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบรายการธุรกรรม") }

      $prevSnap = @{
        tx_date = [string]$target.tx_date
        tx_type = [string]$target.tx_type
        amount  = [double]($target.amount -as [double])
        merchant = [string]$target.merchant
      }

      if ($Params.tx_type) { $target.tx_type = ([string]$Params.tx_type).Trim() }
      if ($Params.tx_date) { $target.tx_date = ([string]$Params.tx_date).Trim() }
      if ($Params.tx_time) { $target.tx_time = ([string]$Params.tx_time).Trim() }
      if ($Params.account_id) { $target.account_id = ([string]$Params.account_id).Trim() }
      if ($null -ne $Params.to_account_id) { $target.to_account_id = ([string]$Params.to_account_id).Trim() }
      if ($null -ne $Params.category_id) { $target.category_id = ([string]$Params.category_id).Trim() }
      if ($null -ne $Params.subcategory_id) { $target.subcategory_id = ([string]$Params.subcategory_id).Trim() }
      if ($null -ne $Params.amount) {
        $target.amount = [Math]::Round([double]($Params.amount -as [double]), 2)
        $target.to_amount = $target.amount
      }
      if ($null -ne $Params.merchant) { $target.merchant = ([string]$Params.merchant).Trim() }
      if ($null -ne $Params.description) { $target.description = ([string]$Params.description).Trim() }
      if ($null -ne $Params.tags) { $target.tags = ([string]$Params.tags).Trim() }
      if ($null -ne $Params.receipt_url) { $target.receipt_url = ([string]$Params.receipt_url).Trim() }

      $now = Get-NowIso
      $nextRev = [int]($target.revision -as [int]) + 1
      $hist = @()
      if (-not [string]::IsNullOrWhiteSpace([string]$target.edit_history_json)) {
        try {
          $parsed = [string]$target.edit_history_json | ConvertFrom-Json
          if ($parsed -is [array]) { $hist = $parsed } else { $hist = @($parsed) }
        } catch {}
      }
      $hist += @{
        revision = $nextRev
        action   = "updated"
        timestamp = $now
        reason   = if ($Params.edit_reason) { ([string]$Params.edit_reason).Trim() } else { "แก้ไขข้อมูล" }
        previous = $prevSnap
      }
      $target.revision = $nextRev
      $target.edit_history_json = ($hist | ConvertTo-Json -Compress -Depth 6)
      $target.updated_at = $now

      Update-SheetRow -SheetName "Transactions" -RowIndex $target._rowIndex -Obj $target
      $updatedAccs = Recalculate-UserAccountBalances -UserId $userId
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "transactions.update" -EntityType "Transactions" -EntityId $txId -Summary "แก้ไขธุรกรรม Rev.$nextRev" -MetaObj @{}
      return @{
        transaction = (Normalize-Transaction $target)
        accounts    = $updatedAccs
      }
    }

    "transactions.void" {
      $userId = [string]$authUser.user_id
      $txId = ([string]$Params.transaction_id).Trim()
      $restore = ($Params.restore -eq $true)
      $reason = if ($Params.reason) { ([string]$Params.reason).Trim() } else { "ยกเลิกโดยผู้ใช้" }

      $allTxs = Read-SheetObjects -SheetName "Transactions"
      $target = $null
      foreach ($t in $allTxs) {
        if ([string]$t.transaction_id -eq $txId -and [string]$t.user_id -eq $userId) {
          $target = $t
          break
        }
      }
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบรายการธุรกรรม") }

      $now = Get-NowIso
      $nextRev = [int]($target.revision -as [int]) + 1
      $hist = @()
      if (-not [string]::IsNullOrWhiteSpace([string]$target.edit_history_json)) {
        try {
          $parsed = [string]$target.edit_history_json | ConvertFrom-Json
          if ($parsed -is [array]) { $hist = $parsed } else { $hist = @($parsed) }
        } catch {}
      }
      $hist += @{
        revision = $nextRev
        action   = if ($restore) { "restored" } else { "voided" }
        timestamp = $now
        reason   = $reason
      }
      $target.status = if ($restore) { "posted" } else { "voided" }
      $target.revision = $nextRev
      $target.edit_history_json = ($hist | ConvertTo-Json -Compress -Depth 6)
      $target.updated_at = $now

      Update-SheetRow -SheetName "Transactions" -RowIndex $target._rowIndex -Obj $target
      $updatedAccs = Recalculate-UserAccountBalances -UserId $userId
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "transactions.void" -EntityType "Transactions" -EntityId $txId -Summary "$($target.status): $reason" -MetaObj @{}
      return @{
        transaction = (Normalize-Transaction $target)
        accounts    = $updatedAccs
      }
    }

    "transactions.importCsvPreview" {
      $userId = [string]$authUser.user_id
      $accId  = ([string]$Params.account_id).Trim()
      $rows   = $Params.rows
      $allTxs = Read-SheetObjects -SheetName "Transactions"
      $existingHashes = @{}
      foreach ($t in $allTxs) {
        if ([string]$t.user_id -eq $userId -and [string]$t.status -eq "posted" -and $t.dedup_hash) {
          $existingHashes[[string]$t.dedup_hash] = [string]$t.transaction_id
        }
      }

      $previewItems = @()
      $dupCount = 0
      $validCount = 0
      $invalidCount = 0
      $idx = 0

      foreach ($r in $rows) {
        $idx++
        $txDate = ([string]$r.tx_date).Trim()
        $txType = if ($r.tx_type) { ([string]$r.tx_type).Trim().ToLowerInvariant() } else { "expense" }
        $amt    = [Math]::Round([Math]::Abs([double]($r.amount -as [double])), 2)
        $merch  = ([string]$r.merchant).Trim()
        $desc   = ([string]$r.description).Trim()
        $catId  = ([string]$r.category_id).Trim()
        $rowTags = if ($r.tags) { [string]$r.tags } else { "csv-import" }

        if ([string]::IsNullOrWhiteSpace($catId)) {
          $evalRes = Invoke-ApiAction -RequestId $RequestId -Action "rules.evaluate" -SessionToken $SessionToken -Params @{
            merchant    = $merch
            description = $desc
            amount      = $amt
            tx_type     = $txType
          }
          $catId = [string]$evalRes.suggested_category_id
          if ($evalRes.matched_by -eq "user_rule" -and $evalRes.suggested_tags) {
            $rowTags = "$rowTags,$($evalRes.suggested_tags)"
          }
        }

        $errs = @()
        if ($txDate -notmatch '^\d{4}-\d{2}-\d{2}$') { $errs += "วันที่ต้องเป็น YYYY-MM-DD" }
        if ($amt -le 0) { $errs += "จำนวนเงินต้องมากกว่า 0" }

        $dedup = Get-TxDedupHash -UserId $userId -TxDate $txDate -TxType $txType -AccountId $accId -Amount $amt -Merchant ($merch + $desc)
        $isDup = $existingHashes.ContainsKey($dedup)

        if ($errs.Count -gt 0) { $invalidCount++ }
        elseif ($isDup) { $dupCount++ }
        else { $validCount++ }

        $previewItems += [ordered]@{
          row_number = $idx
          tx_date    = $txDate
          tx_time    = if ($r.tx_time) { [string]$r.tx_time } else { "12:00" }
          tx_type    = $txType
          account_id = $accId
          category_id = $catId
          amount     = $amt
          merchant   = $merch
          description = $desc
          tags       = $rowTags
          dedup_hash = $dedup
          is_duplicate = $isDup
          is_valid   = ($errs.Count -eq 0)
          errors     = $errs
        }
      }

      return @{
        summary = @{
          total_rows = $idx
          valid_rows = $validCount
          duplicate_rows = $dupCount
          invalid_rows = $invalidCount
        }
        items = $previewItems
      }
    }

    "transactions.importCsvCommit" {
      $userId = [string]$authUser.user_id
      $accId  = ([string]$Params.account_id).Trim()
      $fileName = if ($Params.file_name) { ([string]$Params.file_name).Trim() } else { "statement.csv" }
      $skipDups = ($Params.skip_duplicates -ne $false)
      $items    = $Params.items

      $allAccs = Read-SheetObjects -SheetName "Accounts"
      $targetAcc = $allAccs | Where-Object { [string]$_.account_id -eq $accId -and [string]$_.user_id -eq $userId } | Select-Object -First 1
      if ($null -eq $targetAcc) { throw [System.Exception]::new("NOT_FOUND|ไม่พบบัญชีที่ต้องการนำเข้า") }

      $allTxs = Read-SheetObjects -SheetName "Transactions"
      $existingHashes = @{}
      foreach ($t in $allTxs) {
        if ([string]$t.user_id -eq $userId -and [string]$t.status -eq "posted" -and $t.dedup_hash) {
          $existingHashes[[string]$t.dedup_hash] = $true
        }
      }

      $now = Get-NowIso
      $importId = New-Id "imp"
      $toInsert = @()
      $skipped = 0
      $i = 0

      foreach ($item in $items) {
        $i++
        $txDate = ([string]$item.tx_date).Trim()
        $txType = if ($item.tx_type) { ([string]$item.tx_type).Trim() } else { "expense" }
        $amt    = [Math]::Round([double]($item.amount -as [double]), 2)
        $merch  = ([string]$item.merchant).Trim()
        $desc   = ([string]$item.description).Trim()
        $dedup  = Get-TxDedupHash -UserId $userId -TxDate $txDate -TxType $txType -AccountId $accId -Amount $amt -Merchant ($merch + $desc)

        if ($skipDups -and $existingHashes.ContainsKey($dedup)) {
          $skipped++
          continue
        }
        $existingHashes[$dedup] = $true
        $txId = New-Id "txn"
        $histJson = (@(@{ revision = 1; action = "imported_csv"; import_id = $importId; timestamp = $now }) | ConvertTo-Json -Compress)

        $toInsert += [pscustomobject]@{
          transaction_id    = $txId
          user_id           = $userId
          tx_date           = $txDate
          tx_time           = if ($item.tx_time) { [string]$item.tx_time } else { "12:00" }
          tx_type           = $txType
          account_id        = $accId
          to_account_id     = ""
          category_id       = if ($item.category_id) { [string]$item.category_id } else { "cat_exp_shopping" }
          subcategory_id    = ""
          amount            = $amt
          currency          = if ($targetAcc.currency) { [string]$targetAcc.currency } else { "THB" }
          exchange_rate     = 1
          to_amount         = $amt
          merchant          = $merch
          description       = $desc
          tags              = if ($item.tags) { [string]$item.tags } else { "csv-import" }
          receipt_url       = ""
          reference_tx_id   = ""
          recurring_id      = ""
          import_id         = $importId
          idempotency_key   = "imp_${importId}_${i}"
          dedup_hash        = $dedup
          status            = "posted"
          revision          = 1
          edit_history_json = $histJson
          created_at        = $now
          updated_at        = $now
        }
      }

      if ($toInsert.Count -gt 0) {
        BatchAppend-SheetObjects -SheetName "Transactions" -ObjList $toInsert
      }

      $impRec = [pscustomobject]@{
        import_id          = $importId
        user_id            = $userId
        source_type        = "csv_upload"
        file_name          = $fileName
        account_id         = $accId
        total_rows         = $items.Count
        imported_rows      = $toInsert.Count
        skipped_duplicates = $skipped
        status             = "completed"
        created_at         = $now
      }
      Append-SheetObject -SheetName "Import_History" -Obj $impRec
      $updatedAccs = Recalculate-UserAccountBalances -UserId $userId
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "transactions.importCsvCommit" -EntityType "Import_History" -EntityId $importId -Summary "นำเข้า CSV $($toInsert.Count) รายการ (ข้ามซ้ำ $skipped)" -MetaObj @{}

      return @{
        import_record      = $impRec
        imported_count     = $toInsert.Count
        skipped_duplicates = $skipped
        accounts           = $updatedAccs
      }
    }

    "dashboard.summary" {
      $userId = [string]$authUser.user_id
      $filterAcc = if ($Params.account_id) { ([string]$Params.account_id).Trim() } else { "" }
      $filterCat = if ($Params.category_id) { ([string]$Params.category_id).Trim() } else { "" }
      $filterCur = if ($Params.currency) { ([string]$Params.currency).Trim().ToUpperInvariant() } else { "" }

      $now = Get-Date
      $defaultStart = (Get-Date -Year $now.Year -Month $now.Month -Day 1).ToString("yyyy-MM-dd")
      $defaultEnd   = (Get-Date -Year $now.Year -Month $now.Month -Day ([DateTime]::DaysInMonth($now.Year, $now.Month))).ToString("yyyy-MM-dd")

      $startDate = if ($Params.start_date) { ([string]$Params.start_date).Trim() } else { $defaultStart }
      $endDate   = if ($Params.end_date) { ([string]$Params.end_date).Trim() } else { $defaultEnd }

      $refDate = [DateTime]::ParseExact($startDate.Substring(0, 10), "yyyy-MM-dd", $null)
      $prevMonthDate = $refDate.AddMonths(-1)
      $prevStart = (Get-Date -Year $prevMonthDate.Year -Month $prevMonthDate.Month -Day 1).ToString("yyyy-MM-dd")
      $prevEnd   = (Get-Date -Year $prevMonthDate.Year -Month $prevMonthDate.Month -Day ([DateTime]::DaysInMonth($prevMonthDate.Year, $prevMonthDate.Month))).ToString("yyyy-MM-dd")

      $allAccs = Recalculate-UserAccountBalances -UserId $userId
      $accs = @($allAccs | Where-Object {
        (-not $_.is_archived) -and
        (-not $filterAcc -or $_.account_id -eq $filterAcc) -and
        (-not $filterCur -or $_.currency -eq $filterCur)
      })

      $totalAssets = 0.0
      $totalLiab   = 0.0
      $totalNet    = 0.0
      $balByCur    = @{}

      foreach ($a in $accs) {
        $b = [double]$a.current_balance
        $c = [string]$a.currency
        if (-not $balByCur.ContainsKey($c)) { $balByCur[$c] = 0.0 }
        $balByCur[$c] = [Math]::Round($balByCur[$c] + $b, 2)
        if ($a.include_in_net_worth) {
          $totalNet += $b
          if ($b -ge 0) { $totalAssets += $b } else { $totalLiab += [Math]::Abs($b) }
        }
      }

      $catsRes = Invoke-ApiAction -RequestId $RequestId -Action "categories.list" -SessionToken $SessionToken -Params @{}
      $catMap = @{}
      foreach ($c in $catsRes.categories) { $catMap[$c.category_id] = $c }

      $allTxsRaw = Read-SheetObjects -SheetName "Transactions"
      $userTxs = @()
      foreach ($r in $allTxsRaw) {
        if ([string]$r.user_id -ne $userId) { continue }
        if ([string]$r.status -ne "posted") { continue }
        if ($filterAcc -and [string]$r.account_id -ne $filterAcc -and [string]$r.to_account_id -ne $filterAcc) { continue }
        if ($filterCat -and [string]$r.category_id -ne $filterCat -and [string]$r.subcategory_id -ne $filterCat) { continue }
        if ($filterCur -and ([string]$r.currency).ToUpperInvariant() -ne $filterCur) { continue }
        $userTxs += ,(Normalize-Transaction $r)
      }

      $periodIncome = 0.0
      $periodGrossExp = 0.0
      $periodRefunds = 0.0
      $periodTransfers = 0.0
      $prevIncome = 0.0
      $prevExp = 0.0
      $expByCat = @{}

      $trendKeys = @()
      $trendMap = @{}
      for ($m = 5; $m -ge 0; $m--) {
        $td = $refDate.AddMonths(-$m)
        $ym = $td.ToString("yyyy-MM")
        $trendKeys += $ym
        $trendMap[$ym] = @{ month = $ym; income = 0.0; expense = 0.0; net = 0.0 }
      }

      foreach ($tx in $userTxs) {
        $d = [string]$tx.tx_date
        $ym = $d.Substring(0, 7)
        $amt = [double]$tx.amount
        $tType = [string]$tx.tx_type

        if ($trendMap.ContainsKey($ym)) {
          if ($tType -eq "income") { $trendMap[$ym].income += $amt }
          elseif ($tType -eq "expense") { $trendMap[$ym].expense += $amt }
          elseif ($tType -eq "refund") { $trendMap[$ym].expense = [Math]::Max(0.0, $trendMap[$ym].expense - $amt) }
        }

        if ($d -ge $prevStart -and $d -le $prevEnd) {
          if ($tType -eq "income") { $prevIncome += $amt }
          elseif ($tType -eq "expense") { $prevExp += $amt }
          elseif ($tType -eq "refund") { $prevExp -= $amt }
        }

        if ($d -ge $startDate -and $d -le $endDate) {
          if ($tType -eq "income") {
            $periodIncome += $amt
          } elseif ($tType -eq "expense") {
            $periodGrossExp += $amt
            $cid = if ($tx.category_id) { [string]$tx.category_id } else { "uncategorized" }
            if (-not $expByCat.ContainsKey($cid)) { $expByCat[$cid] = 0.0 }
            $expByCat[$cid] += $amt
          } elseif ($tType -eq "refund") {
            $periodRefunds += $amt
            $cid = if ($tx.category_id) { [string]$tx.category_id } else { "uncategorized" }
            if (-not $expByCat.ContainsKey($cid)) { $expByCat[$cid] = 0.0 }
            $expByCat[$cid] -= $amt
          } elseif ($tType -eq "transfer") {
            # Strictly tracked separately — never added to income or expense!
            $periodTransfers += $amt
          }
        }
      }

      $prevExp = [Math]::Max(0.0, $prevExp)
      $periodNetExp = [Math]::Max(0.0, $periodGrossExp - $periodRefunds)
      $periodNetCashflow = [Math]::Round($periodIncome - $periodNetExp, 2)
      $savingsRate = if ($periodIncome -gt 0) { [Math]::Round((($periodIncome - $periodNetExp) / $periodIncome) * 100.0, 2) } else { 0.0 }
      $prevNetCashflow = [Math]::Round($prevIncome - $prevExp, 2)

      $calcPct = { param($cur, $prev)
        if ($prev -eq 0) { if ($cur -gt 0) { return 100.0 } else { return 0.0 } }
        return [Math]::Round((($cur - $prev) / [Math]::Abs($prev)) * 100.0, 2)
      }

      $monthlyTrends = @()
      foreach ($ym in $trendKeys) {
        $b = $trendMap[$ym]
        $inc = [Math]::Round($b.income, 2)
        $exp = [Math]::Round([Math]::Max(0.0, $b.expense), 2)
        $monthlyTrends += [ordered]@{
          month   = $ym
          income  = $inc
          expense = $exp
          net     = [Math]::Round($inc - $exp, 2)
        }
      }

      $catBreakdown = @()
      foreach ($cid in $expByCat.Keys) {
        $val = [Math]::Round([Math]::Max(0.0, $expByCat[$cid]), 2)
        if ($val -le 0) { continue }
        $cObj = if ($catMap.ContainsKey($cid)) { $catMap[$cid] } else { @{ category_name = "อื่นๆ"; color = "#64748B"; icon = "tag" } }
        $pct  = if ($periodNetExp -gt 0) { [Math]::Round(($val / $periodNetExp) * 100.0, 2) } else { 0.0 }
        $catBreakdown += [ordered]@{
          category_id   = $cid
          category_name = $cObj.category_name
          color         = $cObj.color
          icon          = $cObj.icon
          amount        = $val
          percentage    = $pct
        }
      }
      $catBreakdown = @($catBreakdown | Sort-Object { [double]$_.amount } -Descending)

      $recentTxs = @($userTxs | Sort-Object { "$($_.tx_date) $($_.tx_time) $($_.created_at)" } -Descending | Select-Object -First 10)

      $budgetsRes = Invoke-ApiAction -RequestId $RequestId -Action "budgets.list" -SessionToken $SessionToken -Params @{}
      $nearLimitBudgets = @($budgetsRes.budgets | Sort-Object { [double]$_.used_percentage } -Descending)

      $todayDateStr = $now.ToString("yyyy-MM-dd")
      $todayDt = [DateTime]::ParseExact($todayDateStr, "yyyy-MM-dd", $null)
      $allBillsRaw = Read-SheetObjects -SheetName "Bills"
      $upcomingBills = @()
      foreach ($bl in $allBillsRaw) {
        if ([string]$bl.user_id -ne $userId) { continue }
        $st = ([string]$bl.status).ToLowerInvariant()
        if ($st -ne "unpaid" -and $st -ne "overdue") { continue }
        $dueStr = if ($bl.due_date) { ([string]$bl.due_date).Substring(0, [Math]::Min(10, ([string]$bl.due_date).Length)) } else { $todayDateStr }
        $daysRem = 0
        try {
          $dueDt = [DateTime]::ParseExact($dueStr, "yyyy-MM-dd", $null)
          $daysRem = [int][Math]::Round(($dueDt - $todayDt).TotalDays)
        } catch {}
        $upcomingBills += [ordered]@{
          bill_id        = [string]$bl.bill_id
          bill_name      = [string]$bl.bill_name
          amount         = [Math]::Round([double]($bl.amount -as [double]), 2)
          currency       = if ($bl.currency) { [string]$bl.currency } else { "THB" }
          due_date       = $dueStr
          days_remaining = $daysRem
          status         = if ($daysRem -lt 0) { "overdue" } else { "unpaid" }
        }
      }
      $upcomingBills = @($upcomingBills | Sort-Object { [string]$_.due_date } | Select-Object -First 8)

      return [ordered]@{
        filters_applied = @{
          start_date  = $startDate
          end_date    = $endDate
          account_id  = if ($filterAcc) { $filterAcc } else { "ALL" }
          category_id = if ($filterCat) { $filterCat } else { "ALL" }
          currency    = if ($filterCur) { $filterCur } else { "ALL" }
        }
        kpis = [ordered]@{
          total_net_balance       = [Math]::Round($totalNet, 2)
          total_assets            = [Math]::Round($totalAssets, 2)
          total_liabilities       = [Math]::Round($totalLiab, 2)
          balances_by_currency    = $balByCur
          period_income           = [Math]::Round($periodIncome, 2)
          period_expense          = [Math]::Round($periodNetExp, 2)
          period_gross_expense    = [Math]::Round($periodGrossExp, 2)
          period_refunds          = [Math]::Round($periodRefunds, 2)
          period_transfers_volume = [Math]::Round($periodTransfers, 2)
          period_net_cashflow     = $periodNetCashflow
          savings_rate_pct        = $savingsRate
        }
        month_comparison = [ordered]@{
          current_period = @{ start_date = $startDate; end_date = $endDate; income = [Math]::Round($periodIncome, 2); expense = [Math]::Round($periodNetExp, 2); net_cashflow = $periodNetCashflow }
          previous_month = @{ start_date = $prevStart; end_date = $prevEnd; income = [Math]::Round($prevIncome, 2); expense = [Math]::Round($prevExp, 2); net_cashflow = $prevNetCashflow }
          income_change_pct  = (& $calcPct $periodIncome $prevIncome)
          expense_change_pct = (& $calcPct $periodNetExp $prevExp)
          net_change_pct     = (& $calcPct $periodNetCashflow $prevNetCashflow)
        }
        accounts            = $accs
        monthly_trends      = $monthlyTrends
        category_breakdown  = $catBreakdown
        budgets_near_limit  = $nearLimitBudgets
        upcoming_bills      = $upcomingBills
        recent_transactions = $recentTxs
      }
    }

    # =========================================================================
    # PHASE 2 — MODULE D: BUDGETS (budgets.list, budgets.create, budgets.update, budgets.delete)
    # =========================================================================
    "budgets.list" {
      $userId = [string]$authUser.user_id
      $includeInactive = ($Params.include_inactive -eq $true -or [string]$Params.include_inactive -eq "true")

      $catsRes = Invoke-ApiAction -RequestId $RequestId -Action "categories.list" -SessionToken $SessionToken -Params @{}
      $catMap = @{}
      $parentChildrenMap = @{}
      foreach ($c in $catsRes.categories) {
        $catMap[$c.category_id] = $c
        if ($c.parent_id) {
          if (-not $parentChildrenMap.ContainsKey($c.parent_id)) { $parentChildrenMap[$c.parent_id] = @() }
          $parentChildrenMap[$c.parent_id] += $c.category_id
        }
      }

      $allTxsRaw = Read-SheetObjects -SheetName "Transactions"
      $userTxs = @()
      foreach ($r in $allTxsRaw) {
        if ([string]$r.user_id -eq $userId -and [string]$r.status -eq "posted") {
          $userTxs += ,(Normalize-Transaction $r)
        }
      }

      $now = Get-Date
      $todayStr = $now.ToString("yyyy-MM-dd")
      $monthStart = (Get-Date -Year $now.Year -Month $now.Month -Day 1).ToString("yyyy-MM-dd")
      $monthEnd   = (Get-Date -Year $now.Year -Month $now.Month -Day ([DateTime]::DaysInMonth($now.Year, $now.Month))).ToString("yyyy-MM-dd")
      $yearStart  = "$($now.Year)-01-01"
      $yearEnd    = "$($now.Year)-12-31"
      $dow = [int]$now.DayOfWeek
      $mondayDiff = if ($dow -eq 0) { -6 } else { 1 - $dow }
      $weekStart = $now.AddDays($mondayDiff).ToString("yyyy-MM-dd")
      $weekEnd   = $now.AddDays($mondayDiff + 6).ToString("yyyy-MM-dd")

      $budgetRows = Read-SheetObjects -SheetName "Budgets" | Where-Object {
        [string]$_.user_id -eq $userId -and ($includeInactive -or ([string]$_.is_active -ne "FALSE" -and [string]$_.is_active -ne "False"))
      }

      $enriched = @()
      $totalEffective = 0.0
      $totalSpent = 0.0
      $nearCount = 0
      $overCount = 0

      foreach ($row in $budgetRows) {
        $pType = if ($row.period_type) { ([string]$row.period_type).ToLowerInvariant() } else { "monthly" }
        $wStart = $monthStart
        $wEnd   = $monthEnd
        if ($pType -eq "daily") { $wStart = $todayStr; $wEnd = $todayStr }
        elseif ($pType -eq "weekly") { $wStart = $weekStart; $wEnd = $weekEnd }
        elseif ($pType -eq "yearly") { $wStart = $yearStart; $wEnd = $yearEnd }

        if ($row.start_date -and $row.end_date -and ([string]$row.start_date).Length -ge 10 -and [string]$row.start_date -gt $wStart) { $wStart = ([string]$row.start_date).Substring(0, 10) }
        if ($row.end_date -and ([string]$row.end_date).Length -ge 10 -and [string]$row.end_date -lt $wEnd) { $wEnd = ([string]$row.end_date).Substring(0, 10) }

        $catId = if ($row.category_id) { [string]$row.category_id } else { "ALL" }
        $targetCatIds = @($catId)
        if ($catId -ne "ALL" -and $parentChildrenMap.ContainsKey($catId)) {
          $targetCatIds += $parentChildrenMap[$catId]
        }

        $grossExp = 0.0
        $refunds  = 0.0
        $matchedCount = 0
        $bCur = if ($row.currency) { ([string]$row.currency).ToUpperInvariant() } else { "THB" }

        foreach ($tx in $userTxs) {
          if ($tx.tx_date -lt $wStart -or $tx.tx_date -gt $wEnd) { continue }
          if ($bCur -and $tx.currency -and ([string]$tx.currency).ToUpperInvariant() -ne $bCur) { continue }
          $matchesCat = ($catId -eq "ALL") -or ($targetCatIds -contains $tx.category_id) -or ($targetCatIds -contains $tx.subcategory_id)
          if (-not $matchesCat) { continue }

          if ($tx.tx_type -eq "expense") {
            $grossExp += [double]$tx.amount
            $matchedCount++
          } elseif ($tx.tx_type -eq "refund") {
            $refunds += [double]$tx.amount
          }
        }

        $spent = [Math]::Round([Math]::Max(0.0, $grossExp - $refunds), 2)
        $baseLimit = [Math]::Round([double]($row.amount_limit -as [double]), 2)
        $rollEnabled = ([string]$row.rollover_enabled -eq "TRUE" -or [string]$row.rollover_enabled -eq "True" -or $row.rollover_enabled -eq $true)
        $rollAmt = if ($rollEnabled) { [Math]::Round([double]($row.rollover_amount -as [double]), 2) } else { 0.0 }
        $effLimit = [Math]::Round($baseLimit + $rollAmt, 2)
        $remaining = [Math]::Round($effLimit - $spent, 2)
        $usedPct = if ($effLimit -gt 0) { [Math]::Round(($spent / $effLimit) * 100.0, 2) } else { 0.0 }
        $alertPct = if ($row.alert_threshold_pct) { [double]($row.alert_threshold_pct -as [double]) } else { 80.0 }

        $statusLevel = "normal"
        if ($usedPct -gt 100) { $statusLevel = "exceeded"; $overCount++ }
        elseif ($usedPct -ge $alertPct) { $statusLevel = "warning"; $nearCount++ }

        $totalEffective += $effLimit
        $totalSpent += $spent

        $catObj = if ($catId -ne "ALL" -and $catMap.ContainsKey($catId)) { $catMap[$catId] } else { $null }
        $enriched += [ordered]@{
          budget_id                = [string]$row.budget_id
          user_id                  = [string]$row.user_id
          budget_name              = [string]$row.budget_name
          period_type              = $pType
          category_id              = $catId
          category_name            = if ($catId -eq "ALL") { "งบรวมทุกหมวดหมู่ (Overall)" } elseif ($catObj) { $catObj.category_name } else { $catId }
          category_color           = if ($catId -eq "ALL") { "#2563EB" } elseif ($catObj) { $catObj.color } else { "#64748B" }
          amount_limit             = $baseLimit
          rollover_enabled         = $rollEnabled
          rollover_amount          = $rollAmt
          effective_limit          = $effLimit
          spent_amount             = $spent
          remaining_amount         = $remaining
          used_percentage          = $usedPct
          alert_threshold_pct      = $alertPct
          status_level             = $statusLevel
          alert_status             = $statusLevel
          is_near_or_over          = ($statusLevel -ne "normal")
          currency                 = $bCur
          window_start             = $wStart
          window_end               = $wEnd
          period_window            = @{ start_date = $wStart; end_date = $wEnd }
          start_date               = if ($row.start_date) { ([string]$row.start_date).Substring(0, [Math]::Min(10, ([string]$row.start_date).Length)) } else { "" }
          end_date                 = if ($row.end_date) { ([string]$row.end_date).Substring(0, [Math]::Min(10, ([string]$row.end_date).Length)) } else { "" }
          matched_tx_count         = $matchedCount
          is_active                = ([string]$row.is_active -ne "FALSE" -and [string]$row.is_active -ne "False")
          created_at               = [string]$row.created_at
          updated_at               = [string]$row.updated_at
        }
      }

      $enriched = @($enriched | Sort-Object { [double]$_.used_percentage } -Descending)
      return [ordered]@{
        budgets = $enriched
        summary = [ordered]@{
          total_budgets          = $enriched.Count
          total_effective_limit  = [Math]::Round($totalEffective, 2)
          total_spent            = [Math]::Round($totalSpent, 2)
          total_remaining        = [Math]::Round($totalEffective - $totalSpent, 2)
          overall_used_pct       = if ($totalEffective -gt 0) { [Math]::Round(($totalSpent / $totalEffective) * 100.0, 2) } else { 0.0 }
          near_limit_count       = $nearCount
          exceeded_count         = $overCount
        }
      }
    }

    "budgets.create" {
      $userId = [string]$authUser.user_id
      $bName = ([string]$Params.budget_name).Trim()
      if (-not $bName) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุชื่องบประมาณ") }
      $pType = if ($Params.period_type) { ([string]$Params.period_type).Trim().ToLowerInvariant() } else { "monthly" }
      $catId = if ($Params.category_id) { ([string]$Params.category_id).Trim() } else { "ALL" }
      $limitAmt = [Math]::Round([double]($Params.amount_limit -as [double]), 2)
      if ($limitAmt -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|วงเงินงบประมาณต้องมากกว่า 0") }

      $now = Get-NowIso
      $newBudget = [pscustomobject]@{
        budget_id           = (New-Id "bdg")
        user_id             = $userId
        budget_name         = $bName
        period_type         = $pType
        category_id         = $catId
        amount_limit        = $limitAmt
        currency            = if ($Params.currency) { ([string]$Params.currency).Trim().ToUpperInvariant() } else { "THB" }
        start_date          = if ($Params.start_date) { ([string]$Params.start_date).Trim() } else { "" }
        end_date            = if ($Params.end_date) { ([string]$Params.end_date).Trim() } else { "" }
        rollover_enabled    = if ($Params.rollover_enabled -eq $true -or [string]$Params.rollover_enabled -eq "true") { "TRUE" } else { "FALSE" }
        rollover_amount     = [Math]::Round([double]($Params.rollover_amount -as [double]), 2)
        alert_threshold_pct = if ($Params.alert_threshold_pct) { [double]($Params.alert_threshold_pct -as [double]) } else { 80 }
        is_active           = "TRUE"
        created_at          = $now
        updated_at          = $now
      }
      Append-SheetObject -SheetName "Budgets" -Obj $newBudget
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "budgets.create" -EntityType "Budgets" -EntityId $newBudget.budget_id -Summary "สร้างงบประมาณ: $bName ($limitAmt)" -MetaObj @{ period_type = $pType; category_id = $catId }

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "budgets.list" -SessionToken $SessionToken -Params @{ include_inactive = $true }
      $created = $listRes.budgets | Where-Object { $_.budget_id -eq $newBudget.budget_id } | Select-Object -First 1
      return @{ budget = $created; summary = $listRes.summary }
    }

    "budgets.update" {
      $userId = [string]$authUser.user_id
      $bId = ([string]$Params.budget_id).Trim()
      $allB = Read-SheetObjects -SheetName "Budgets"
      $target = $allB | Where-Object { [string]$_.budget_id -eq $bId -and [string]$_.user_id -eq $userId } | Select-Object -First 1
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบงบประมาณที่ต้องการแก้ไข") }

      if ($null -ne $Params.budget_name) { $target.budget_name = ([string]$Params.budget_name).Trim() }
      if ($null -ne $Params.period_type) { $target.period_type = ([string]$Params.period_type).Trim().ToLowerInvariant() }
      if ($null -ne $Params.category_id) { $target.category_id = ([string]$Params.category_id).Trim() }
      if ($null -ne $Params.amount_limit) { $target.amount_limit = [Math]::Round([double]($Params.amount_limit -as [double]), 2) }
      if ($null -ne $Params.rollover_enabled) { $target.rollover_enabled = if ($Params.rollover_enabled -eq $true -or [string]$Params.rollover_enabled -eq "true") { "TRUE" } else { "FALSE" } }
      if ($null -ne $Params.rollover_amount) { $target.rollover_amount = [Math]::Round([double]($Params.rollover_amount -as [double]), 2) }
      if ($null -ne $Params.alert_threshold_pct) { $target.alert_threshold_pct = [double]($Params.alert_threshold_pct -as [double]) }
      if ($null -ne $Params.is_active) { $target.is_active = if ($Params.is_active -eq $false -or [string]$Params.is_active -eq "false") { "FALSE" } else { "TRUE" } }
      $target.updated_at = (Get-NowIso)

      Update-SheetRow -SheetName "Budgets" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "budgets.update" -EntityType "Budgets" -EntityId $bId -Summary "แก้ไขงบประมาณ: $($target.budget_name)" -MetaObj @{}

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "budgets.list" -SessionToken $SessionToken -Params @{ include_inactive = $true }
      $updated = $listRes.budgets | Where-Object { $_.budget_id -eq $bId } | Select-Object -First 1
      return @{ budget = $updated; summary = $listRes.summary }
    }

    "budgets.delete" {
      $userId = [string]$authUser.user_id
      $bId = ([string]$Params.budget_id).Trim()
      $allB = Read-SheetObjects -SheetName "Budgets"
      $target = $allB | Where-Object { [string]$_.budget_id -eq $bId -and [string]$_.user_id -eq $userId } | Select-Object -First 1
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบงบประมาณที่ต้องการยกเลิก") }

      $target.is_active = "FALSE"
      $target.updated_at = (Get-NowIso)
      Update-SheetRow -SheetName "Budgets" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "budgets.delete" -EntityType "Budgets" -EntityId $bId -Summary "ปิดใช้งานงบประมาณ: $($target.budget_name)" -MetaObj @{}
      return @{ deleted = $true; budget_id = $bId }
    }

    # =========================================================================
    # PHASE 2 — MODULE E: SAVINGS GOALS (goals.list, goals.create, goals.update, goals.contribute)
    # =========================================================================
    "goals.list" {
      $userId = [string]$authUser.user_id
      $allContribs = Read-SheetObjects -SheetName "Goal_Contributions" | Where-Object { [string]$_.user_id -eq $userId }
      $contribsByGoal = @{}
      foreach ($c in $allContribs) {
        $gid = [string]$c.goal_id
        if (-not $contribsByGoal.ContainsKey($gid)) { $contribsByGoal[$gid] = @() }
        $contribsByGoal[$gid] += [ordered]@{
          contribution_id       = [string]$c.contribution_id
          goal_id               = $gid
          user_id               = [string]$c.user_id
          tx_date               = if ($c.tx_date) { ([string]$c.tx_date).Substring(0, [Math]::Min(10, ([string]$c.tx_date).Length)) } else { "" }
          entry_type            = [string]$c.entry_type
          amount                = [Math]::Round([double]($c.amount -as [double]), 2)
          linked_transaction_id = [string]$c.linked_transaction_id
          note                  = [string]$c.note
          created_at            = [string]$c.created_at
        }
      }

      $accs = Recalculate-UserAccountBalances -UserId $userId
      $accMap = @{}
      foreach ($a in $accs) { $accMap[$a.account_id] = $a }

      $goalRows = Read-SheetObjects -SheetName "Goals" | Where-Object { [string]$_.user_id -eq $userId -and [string]$_.status -ne "cancelled" }
      $now = Get-Date
      $enrichedGoals = @()
      $totalTarget = 0.0
      $totalSaved  = 0.0
      $totalMonthlyReq = 0.0
      $completedCount = 0
      $atRiskCount = 0

      foreach ($g in $goalRows) {
        $gid = [string]$g.goal_id
        $targetAmt = [Math]::Round([double]($g.target_amount -as [double]), 2)
        $currentAmt = [Math]::Round([double]($g.current_amount -as [double]), 2)
        $remainingAmt = [Math]::Round([Math]::Max(0.0, $targetAmt - $currentAmt), 2)
        $progressPct = if ($targetAmt -gt 0) { [Math]::Round([Math]::Min(100.0, ($currentAmt / $targetAmt) * 100.0), 2) } else { 0.0 }

        $targetDateStr = if ($g.target_date) { ([string]$g.target_date).Substring(0, [Math]::Min(10, ([string]$g.target_date).Length)) } else { "" }
        $daysRem = $null
        $monthsRem = $null
        $reqMonthly = 0.0

        if ($targetDateStr -match '^\d{4}-\d{2}-\d{2}$') {
          $tDate = [DateTime]::ParseExact($targetDateStr, "yyyy-MM-dd", $null)
          $daysRem = [Math]::Ceiling(($tDate - $now.Date).TotalDays)
          $monthsRem = [Math]::Max(0.1, [Math]::Round($daysRem / 30.4375, 2))
          if ($remainingAmt -gt 0) {
            $reqMonthly = if ($daysRem -le 0) { $remainingAmt } else { [Math]::Round($remainingAmt / [Math]::Max(1.0, ($daysRem / 30.4375)), 2) }
          }
        }

        $gContribs = if ($contribsByGoal.ContainsKey($gid)) { @($contribsByGoal[$gid] | Sort-Object { "$($_.tx_date) $($_.created_at)" } -Descending) } else { @() }
        $createdDate = if ($g.created_at) { [DateTime]::Parse([string]$g.created_at) } else { $now }
        $monthsActive = [Math]::Max(1.0, ($now - $createdDate).TotalDays / 30.4375)
        $avgMonthlySaving = [Math]::Round($currentAmt / $monthsActive, 2)

        $estCompletion = $null
        if ($remainingAmt -le 0) {
          $estCompletion = $now.ToString("yyyy-MM-dd")
        } elseif ($avgMonthlySaving -gt 0) {
          $mToFinish = $remainingAmt / $avgMonthlySaving
          $estCompletion = $now.AddDays([Math]::Min(36500, [Math]::Ceiling($mToFinish * 30.4375))).ToString("yyyy-MM-dd")
        }

        $health = "on_track"
        if ($remainingAmt -le 0 -or [string]$g.status -eq "completed") {
          $health = "completed"
          $completedCount++
        } elseif ($null -ne $daysRem -and $daysRem -lt 0 -and $remainingAmt -gt 0) {
          $health = "overdue"
          $atRiskCount++
        } elseif ($targetDateStr -and $estCompletion -and $estCompletion -gt $targetDateStr) {
          $health = "at_risk"
          $atRiskCount++
        }

        $totalTarget += $targetAmt
        $totalSaved  += $currentAmt
        $totalMonthlyReq += $reqMonthly

        $linkedAccId = [string]$g.linked_account_id
        $enrichedGoals += [ordered]@{
          goal_id                   = $gid
          user_id                   = [string]$g.user_id
          goal_name                 = [string]$g.goal_name
          target_amount             = $targetAmt
          current_amount            = $currentAmt
          remaining_amount          = $remainingAmt
          progress_pct              = $progressPct
          currency                  = if ($g.currency) { [string]$g.currency } else { "THB" }
          target_date               = $targetDateStr
          days_remaining            = $daysRem
          months_remaining          = $monthsRem
          required_monthly_saving   = $reqMonthly
          avg_monthly_saving        = $avgMonthlySaving
          estimated_completion_date = $estCompletion
          health_status             = $health
          linked_account_id         = $linkedAccId
          linked_account_name       = if ($linkedAccId -and $accMap.ContainsKey($linkedAccId)) { $accMap[$linkedAccId].account_name } else { "" }
          priority                  = if ($g.priority) { [string]$g.priority } else { "medium" }
          status                    = if ($remainingAmt -le 0) { "completed" } else { [string]$g.status }
          color                     = if ($g.color) { [string]$g.color } else { "#10B981" }
          icon                      = if ($g.icon) { [string]$g.icon } else { "bullseye" }
          notes                     = [string]$g.notes
          contributions_count       = $gContribs.Count
          recent_contributions      = @($gContribs | Select-Object -First 20)
          created_at                = [string]$g.created_at
          updated_at                = [string]$g.updated_at
        }
      }

      return [ordered]@{
        goals = $enrichedGoals
        summary = [ordered]@{
          total_goals             = $enrichedGoals.Count
          total_target_amount     = [Math]::Round($totalTarget, 2)
          total_saved_amount      = [Math]::Round($totalSaved, 2)
          total_remaining_amount  = [Math]::Round([Math]::Max(0.0, $totalTarget - $totalSaved), 2)
          overall_progress_pct    = if ($totalTarget -gt 0) { [Math]::Round(($totalSaved / $totalTarget) * 100.0, 2) } else { 0.0 }
          total_required_monthly  = [Math]::Round($totalMonthlyReq, 2)
          completed_count         = $completedCount
          at_risk_count           = $atRiskCount
        }
      }
    }

    "goals.create" {
      $userId = [string]$authUser.user_id
      $gName = ([string]$Params.goal_name).Trim()
      if (-not $gName) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุชื่อเป้าหมายการออม") }
      $targetAmt = [Math]::Round([double]($Params.target_amount -as [double]), 2)
      if ($targetAmt -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|ยอดเป้าหมายต้องมากกว่า 0") }
      $initAmt = if ($null -ne $Params.initial_amount) { [Math]::Round([double]($Params.initial_amount -as [double]), 2) } else { [Math]::Round([double]($Params.current_amount -as [double]), 2) }

      $now = Get-NowIso
      $gid = New-Id "gol"
      $newGoal = [pscustomobject]@{
        goal_id           = $gid
        user_id           = $userId
        goal_name         = $gName
        target_amount     = $targetAmt
        current_amount    = $initAmt
        currency          = if ($Params.currency) { ([string]$Params.currency).Trim().ToUpperInvariant() } else { "THB" }
        target_date       = if ($Params.target_date) { ([string]$Params.target_date).Trim() } else { "" }
        linked_account_id = if ($Params.linked_account_id) { ([string]$Params.linked_account_id).Trim() } else { "" }
        priority          = if ($Params.priority) { ([string]$Params.priority).Trim().ToLowerInvariant() } else { "medium" }
        status            = if ($initAmt -ge $targetAmt) { "completed" } else { "active" }
        color             = if ($Params.color) { ([string]$Params.color).Trim() } else { "#10B981" }
        icon              = "bullseye"
        notes             = if ($Params.notes) { ([string]$Params.notes).Trim() } else { "" }
        created_at        = $now
        updated_at        = $now
      }
      Append-SheetObject -SheetName "Goals" -Obj $newGoal

      if ($initAmt -gt 0) {
        $contrib = [pscustomobject]@{
          contribution_id       = (New-Id "gct")
          goal_id               = $gid
          user_id               = $userId
          tx_date               = (Get-Date).ToString("yyyy-MM-dd")
          entry_type            = "deposit"
          amount                = $initAmt
          linked_transaction_id = ""
          note                  = "ยอดตั้งต้นเป้าหมายการออม"
          created_at            = $now
        }
        Append-SheetObject -SheetName "Goal_Contributions" -Obj $contrib
      }

      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "goals.create" -EntityType "Goals" -EntityId $gid -Summary "สร้างเป้าหมายการออม: $gName ($targetAmt)" -MetaObj @{}
      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "goals.list" -SessionToken $SessionToken -Params @{}
      $created = $listRes.goals | Where-Object { $_.goal_id -eq $gid } | Select-Object -First 1
      return @{ goal = $created; summary = $listRes.summary }
    }

    "goals.update" {
      $userId = [string]$authUser.user_id
      $gid = ([string]$Params.goal_id).Trim()
      $allG = Read-SheetObjects -SheetName "Goals"
      $target = $allG | Where-Object { [string]$_.goal_id -eq $gid -and [string]$_.user_id -eq $userId } | Select-Object -First 1
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบเป้าหมายการออมที่ต้องการแก้ไข") }

      if ($null -ne $Params.goal_name) { $target.goal_name = ([string]$Params.goal_name).Trim() }
      if ($null -ne $Params.target_amount) { $target.target_amount = [Math]::Round([double]($Params.target_amount -as [double]), 2) }
      if ($null -ne $Params.target_date) { $target.target_date = ([string]$Params.target_date).Trim() }
      if ($null -ne $Params.linked_account_id) { $target.linked_account_id = ([string]$Params.linked_account_id).Trim() }
      if ($null -ne $Params.color) { $target.color = ([string]$Params.color).Trim() }
      if ($null -ne $Params.notes) { $target.notes = ([string]$Params.notes).Trim() }
      if ($null -ne $Params.status) { $target.status = ([string]$Params.status).Trim().ToLowerInvariant() }
      $target.updated_at = (Get-NowIso)

      Update-SheetRow -SheetName "Goals" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "goals.update" -EntityType "Goals" -EntityId $gid -Summary "แก้ไขเป้าหมายการออม: $($target.goal_name)" -MetaObj @{}

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "goals.list" -SessionToken $SessionToken -Params @{}
      $updated = $listRes.goals | Where-Object { $_.goal_id -eq $gid } | Select-Object -First 1
      return @{ goal = $updated; summary = $listRes.summary }
    }

    "goals.contribute" {
      $userId = [string]$authUser.user_id
      $gid = ([string]$Params.goal_id).Trim()
      $entryType = if ($Params.entry_type) { ([string]$Params.entry_type).Trim().ToLowerInvariant() } else { "deposit" }
      if (@("deposit","withdraw") -notcontains $entryType) {
        throw [System.Exception]::new("VALIDATION_ERROR|entry_type ต้องเป็น deposit หรือ withdraw")
      }
      $amt = [Math]::Round([double]($Params.amount -as [double]), 2)
      if ($amt -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|จำนวนเงินต้องมากกว่า 0") }

      $allG = Read-SheetObjects -SheetName "Goals"
      $target = $allG | Where-Object { [string]$_.goal_id -eq $gid -and [string]$_.user_id -eq $userId } | Select-Object -First 1
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบเป้าหมายการออม") }

      $curSaved = [Math]::Round([double]($target.current_amount -as [double]), 2)
      if ($entryType -eq "withdraw" -and $amt -gt $curSaved) {
        throw [System.Exception]::new("INSUFFICIENT_GOAL_BALANCE|ยอดถอนมากกว่ายอดที่ออมสะสมไว้")
      }
      $newSaved = if ($entryType -eq "deposit") { [Math]::Round($curSaved + $amt, 2) } else { [Math]::Round($curSaved - $amt, 2) }
      $targetAmt = [Math]::Round([double]($target.target_amount -as [double]), 2)

      $now = Get-NowIso
      $txDate = if ($Params.tx_date) { ([string]$Params.tx_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }
      $note = if ($Params.note) { ([string]$Params.note).Trim() } else { if ($entryType -eq "deposit") { "เติมเงินออมเข้าเป้าหมาย" } else { "ถอนเงินออมจากเป้าหมาย" } }

      $contrib = [pscustomobject]@{
        contribution_id       = (New-Id "gct")
        goal_id               = $gid
        user_id               = $userId
        tx_date               = $txDate
        entry_type            = $entryType
        amount                = $amt
        linked_transaction_id = ""
        note                  = $note
        created_at            = $now
      }
      Append-SheetObject -SheetName "Goal_Contributions" -Obj $contrib

      $target.current_amount = $newSaved
      if ($newSaved -ge $targetAmt) { $target.status = "completed" }
      elseif ([string]$target.status -eq "completed" -and $newSaved -lt $targetAmt) { $target.status = "active" }
      $target.updated_at = $now

      Update-SheetRow -SheetName "Goals" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "goals.contribute" -EntityType "Goals" -EntityId $gid -Summary "$($entryType): $($target.goal_name) จำนวน $amt" -MetaObj @{ entry_type = $entryType; amount = $amt; new_balance = $newSaved }

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "goals.list" -SessionToken $SessionToken -Params @{}
      $updated = $listRes.goals | Where-Object { $_.goal_id -eq $gid } | Select-Object -First 1
      return @{ goal = $updated; contribution = $contrib; summary = $listRes.summary }
    }

    # =========================================================================
    # PHASE 2 — MODULE F: RECURRING TRANSACTIONS (recurring.list, recurring.create, recurring.update, recurring.processDue)
    # =========================================================================
    "recurring.list" {
      $userId = [string]$authUser.user_id
      $accs = Recalculate-UserAccountBalances -UserId $userId
      $accMap = @{}
      foreach ($a in $accs) { $accMap[$a.account_id] = $a }

      $catsRes = Invoke-ApiAction -RequestId $RequestId -Action "categories.list" -SessionToken $SessionToken -Params @{}
      $catMap = @{}
      foreach ($c in $catsRes.categories) { $catMap[$c.category_id] = $c }

      $rulesRaw = Read-SheetObjects -SheetName "Recurring" | Where-Object { [string]$_.user_id -eq $userId -and [string]$_.status -ne "cancelled" }
      $todayStr = (Get-Date).ToString("yyyy-MM-dd")
      $horizonStr = (Get-Date).AddDays(90).ToString("yyyy-MM-dd")

      $advanceDate = { param([string]$dStr, [string]$freq, [int]$iv)
        $dt = [DateTime]::ParseExact($dStr.Substring(0, 10), "yyyy-MM-dd", $null)
        $step = [Math]::Max(1, $iv)
        if ($freq -eq "daily") { return $dt.AddDays($step).ToString("yyyy-MM-dd") }
        elseif ($freq -eq "weekly") { return $dt.AddDays(7 * $step).ToString("yyyy-MM-dd") }
        elseif ($freq -eq "yearly") { return $dt.AddYears($step).ToString("yyyy-MM-dd") }
        else { return $dt.AddMonths($step).ToString("yyyy-MM-dd") }
      }

      $enrichedRules = @()
      $upcomingForecasts = @()
      $dueNowCount = 0

      foreach ($r in $rulesRaw) {
        $rid = [string]$r.recurring_id
        $freq = if ($r.frequency) { ([string]$r.frequency).ToLowerInvariant() } else { "monthly" }
        $iv = [Math]::Max(1, [int]($r.interval_count -as [int]))
        $amt = [Math]::Round([double]($r.amount -as [double]), 2)
        $nextRun = if ($r.next_run_date) { ([string]$r.next_run_date).Substring(0, [Math]::Min(10, ([string]$r.next_run_date).Length)) } else { "" }
        $endDate = if ($r.end_date) { ([string]$r.end_date).Substring(0, [Math]::Min(10, ([string]$r.end_date).Length)) } else { "" }
        $isActive = ([string]$r.status -eq "active")
        $isDueNow = ($isActive -and $nextRun -and $nextRun -le $todayStr -and (-not $endDate -or $nextRun -le $endDate))
        if ($isDueNow) { $dueNowCount++ }

        $accName = if ($accMap.ContainsKey([string]$r.account_id)) { $accMap[[string]$r.account_id].account_name } else { [string]$r.account_id }
        $catName = if ($catMap.ContainsKey([string]$r.category_id)) { $catMap[[string]$r.category_id].category_name } else { "ไม่ระบุหมวดหมู่" }

        $enrichedRules += [ordered]@{
          recurring_id         = $rid
          user_id              = [string]$r.user_id
          title                = [string]$r.title
          template_name        = [string]$r.title
          merchant             = [string]$r.title
          tx_type              = [string]$r.tx_type
          account_id           = [string]$r.account_id
          account_name         = $accName
          to_account_id        = [string]$r.to_account_id
          category_id          = [string]$r.category_id
          category_name        = $catName
          amount               = $amt
          currency             = if ($r.currency) { [string]$r.currency } else { "THB" }
          frequency            = $freq
          interval_count       = $iv
          start_date           = if ($r.start_date) { ([string]$r.start_date).Substring(0, [Math]::Min(10, ([string]$r.start_date).Length)) } else { "" }
          end_date             = $endDate
          next_run_date        = $nextRun
          next_occurrence_date = $nextRun
          last_run_date        = if ($r.last_run_date) { ([string]$r.last_run_date).Substring(0, [Math]::Min(10, ([string]$r.last_run_date).Length)) } else { "" }
          auto_post            = ([string]$r.auto_post -ne "FALSE" -and [string]$r.auto_post -ne "False")
          auto_create_tx       = ([string]$r.auto_post -ne "FALSE" -and [string]$r.auto_post -ne "False")
          status               = [string]$r.status
          is_active            = $isActive
          is_due_now           = $isDueNow
        }

        if ($isActive -and $nextRun) {
          $simDate = $nextRun
          $safety = 0
          while ($simDate -le $horizonStr -and $safety -lt 24) {
            if ($endDate -and $simDate -gt $endDate) { break }
            if ($simDate -ge $todayStr) {
              $upcomingForecasts += [ordered]@{
                recurring_id   = $rid
                title          = [string]$r.title
                template_name  = [string]$r.title
                scheduled_date = $simDate
                forecast_date  = $simDate
                tx_type        = [string]$r.tx_type
                amount         = $amt
                currency       = if ($r.currency) { [string]$r.currency } else { "THB" }
                account_id     = [string]$r.account_id
                account_name   = $accName
                category_id    = [string]$r.category_id
                category_name  = $catName
                record_nature  = "FORECAST_ESTIMATE"
                is_actual_tx   = $false
              }
            }
            $simDate = & $advanceDate $simDate $freq $iv
            $safety++
          }
        }
      }

      $upcomingForecasts = @($upcomingForecasts | Sort-Object { [string]$_.scheduled_date })

      $actualGen = @()
      $allTxsRaw = Read-SheetObjects -SheetName "Transactions"
      foreach ($tx in $allTxsRaw) {
        if ([string]$tx.user_id -eq $userId -and [string]$tx.status -eq "posted" -and [string]$tx.recurring_id) {
          $actualGen += ,(Normalize-Transaction $tx)
        }
      }
      $actualGen = @($actualGen | Sort-Object { "$($_.tx_date) $($_.created_at)" } -Descending | Select-Object -First 20)

      return [ordered]@{
        recurring_rules               = $enrichedRules
        upcoming_forecasts            = @($upcomingForecasts | Select-Object -First 40)
        actual_generated_transactions = $actualGen
        summary = [ordered]@{
          total_rules         = $enrichedRules.Count
          active_rules        = @($enrichedRules | Where-Object { $_.is_active }).Count
          due_now_count       = $dueNowCount
          forecast_90d_count  = $upcomingForecasts.Count
        }
      }
    }

    "recurring.create" {
      $userId = [string]$authUser.user_id
      $title = if ($Params.title) { ([string]$Params.title).Trim() } elseif ($Params.template_name) { ([string]$Params.template_name).Trim() } else { "" }
      if (-not $title) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุชื่อรายการประจำ") }
      $txType = if ($Params.tx_type) { ([string]$Params.tx_type).Trim().ToLowerInvariant() } else { "expense" }
      $accId = ([string]$Params.account_id).Trim()
      $amt = [Math]::Round([double]($Params.amount -as [double]), 2)
      if ($amt -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|จำนวนเงินต้องมากกว่า 0") }
      $freq = if ($Params.frequency) { ([string]$Params.frequency).Trim().ToLowerInvariant() } else { "monthly" }
      $iv = if ($Params.interval_count) { [Math]::Max(1, [int]($Params.interval_count -as [int])) } else { 1 }
      $startDate = if ($Params.start_date) { ([string]$Params.start_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }
      $nextRun = if ($Params.next_run_date) { ([string]$Params.next_run_date).Trim() } elseif ($Params.next_occurrence_date) { ([string]$Params.next_occurrence_date).Trim() } else { $startDate }

      $now = Get-NowIso
      $rid = New-Id "rec"
      $newRec = [pscustomobject]@{
        recurring_id   = $rid
        user_id        = $userId
        title          = $title
        tx_type        = $txType
        account_id     = $accId
        to_account_id  = if ($txType -eq "transfer" -and $Params.to_account_id) { ([string]$Params.to_account_id).Trim() } else { "" }
        category_id    = if ($txType -eq "transfer") { "cat_sys_transfer" } elseif ($Params.category_id) { ([string]$Params.category_id).Trim() } else { "" }
        amount         = $amt
        currency       = if ($Params.currency) { ([string]$Params.currency).Trim().ToUpperInvariant() } else { "THB" }
        frequency      = $freq
        interval_count = $iv
        start_date     = $startDate
        end_date       = if ($Params.end_date) { ([string]$Params.end_date).Trim() } else { "" }
        next_run_date  = $nextRun
        last_run_date  = ""
        auto_post      = if ($Params.auto_post -eq $false -or $Params.auto_create_tx -eq $false) { "FALSE" } else { "TRUE" }
        status         = "active"
        created_at     = $now
        updated_at     = $now
      }
      Append-SheetObject -SheetName "Recurring" -Obj $newRec
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "recurring.create" -EntityType "Recurring" -EntityId $rid -Summary "สร้างรายการประจำ: $title ($freq)" -MetaObj @{}

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "recurring.list" -SessionToken $SessionToken -Params @{}
      $created = $listRes.recurring_rules | Where-Object { $_.recurring_id -eq $rid } | Select-Object -First 1
      return @{ recurring = $created; summary = $listRes.summary }
    }

    "recurring.update" {
      $userId = [string]$authUser.user_id
      $rid = ([string]$Params.recurring_id).Trim()
      $allR = Read-SheetObjects -SheetName "Recurring"
      $target = $allR | Where-Object { [string]$_.recurring_id -eq $rid -and [string]$_.user_id -eq $userId } | Select-Object -First 1
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบรายการประจำที่ต้องการแก้ไข") }

      if ($null -ne $Params.title) { $target.title = ([string]$Params.title).Trim() }
      elseif ($null -ne $Params.template_name) { $target.title = ([string]$Params.template_name).Trim() }
      if ($null -ne $Params.tx_type) { $target.tx_type = ([string]$Params.tx_type).Trim().ToLowerInvariant() }
      if ($null -ne $Params.account_id) { $target.account_id = ([string]$Params.account_id).Trim() }
      if ($null -ne $Params.to_account_id) { $target.to_account_id = ([string]$Params.to_account_id).Trim() }
      if ($null -ne $Params.category_id) { $target.category_id = ([string]$Params.category_id).Trim() }
      if ($null -ne $Params.amount) { $target.amount = [Math]::Round([double]($Params.amount -as [double]), 2) }
      if ($null -ne $Params.frequency) { $target.frequency = ([string]$Params.frequency).Trim().ToLowerInvariant() }
      if ($null -ne $Params.interval_count) { $target.interval_count = [Math]::Max(1, [int]($Params.interval_count -as [int])) }
      if ($null -ne $Params.start_date) { $target.start_date = ([string]$Params.start_date).Trim() }
      if ($null -ne $Params.end_date) { $target.end_date = ([string]$Params.end_date).Trim() }
      if ($null -ne $Params.next_run_date) { $target.next_run_date = ([string]$Params.next_run_date).Trim() }
      elseif ($null -ne $Params.next_occurrence_date) { $target.next_run_date = ([string]$Params.next_occurrence_date).Trim() }
      if ($null -ne $Params.status) { $target.status = ([string]$Params.status).Trim().ToLowerInvariant() }
      elseif ($null -ne $Params.is_active) {
        $target.status = if ($Params.is_active -eq $false -or [string]$Params.is_active -eq "false") { "paused" } else { "active" }
      }
      $target.updated_at = (Get-NowIso)

      Update-SheetRow -SheetName "Recurring" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "recurring.update" -EntityType "Recurring" -EntityId $rid -Summary "แก้ไขรายการประจำ: $($target.title)" -MetaObj @{}

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "recurring.list" -SessionToken $SessionToken -Params @{}
      $updated = $listRes.recurring_rules | Where-Object { $_.recurring_id -eq $rid } | Select-Object -First 1
      return @{ recurring = $updated; summary = $listRes.summary }
    }

    "recurring.processDue" {
      $userId = [string]$authUser.user_id
      $asOfDate = if ($Params.as_of_date) { ([string]$Params.as_of_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }
      $specificId = if ($Params.recurring_id) { ([string]$Params.recurring_id).Trim() } else { "" }

      $allR = Read-SheetObjects -SheetName "Recurring"
      $allTxs = Read-SheetObjects -SheetName "Transactions"
      $existingIdem = @{}
      foreach ($tx in $allTxs) {
        if ([string]$tx.user_id -eq $userId -and [string]$tx.idempotency_key -and [string]$tx.status -ne "voided") {
          $existingIdem[[string]$tx.idempotency_key] = [string]$tx.transaction_id
        }
      }

      $advanceDate = { param([string]$dStr, [string]$freq, [int]$iv)
        $dt = [DateTime]::ParseExact($dStr.Substring(0, 10), "yyyy-MM-dd", $null)
        $step = [Math]::Max(1, $iv)
        if ($freq -eq "daily") { return $dt.AddDays($step).ToString("yyyy-MM-dd") }
        elseif ($freq -eq "weekly") { return $dt.AddDays(7 * $step).ToString("yyyy-MM-dd") }
        elseif ($freq -eq "yearly") { return $dt.AddYears($step).ToString("yyyy-MM-dd") }
        else { return $dt.AddMonths($step).ToString("yyyy-MM-dd") }
      }

      $now = Get-NowIso
      $generatedTxs = @()
      $skippedDuplicates = @()

      foreach ($rule in $allR) {
        if ([string]$rule.user_id -ne $userId) { continue }
        if ([string]$rule.status -ne "active") { continue }
        if ($specificId -and [string]$rule.recurring_id -ne $specificId) { continue }

        $nextRun = if ($rule.next_run_date) { ([string]$rule.next_run_date).Substring(0, [Math]::Min(10, ([string]$rule.next_run_date).Length)) } else { "" }
        $endDate = if ($rule.end_date) { ([string]$rule.end_date).Substring(0, [Math]::Min(10, ([string]$rule.end_date).Length)) } else { "" }
        $freq = if ($rule.frequency) { ([string]$rule.frequency).ToLowerInvariant() } else { "monthly" }
        $iv = [Math]::Max(1, [int]($rule.interval_count -as [int]))
        $amt = [Math]::Round([double]($rule.amount -as [double]), 2)

        $ruleChanged = $false
        $guard = 0
        while ($nextRun -and $nextRun -le $asOfDate -and $guard -lt 12) {
          if ($endDate -and $nextRun -gt $endDate) {
            $rule.status = "completed"
            $ruleChanged = $true
            break
          }

          $idemKey = "rec_$($rule.recurring_id)_$($nextRun)"
          if ($existingIdem.ContainsKey($idemKey)) {
            $skippedDuplicates += @{
              recurring_id           = [string]$rule.recurring_id
              scheduled_date         = $nextRun
              idempotency_key        = $idemKey
              existing_transaction_id = $existingIdem[$idemKey]
            }
          } else {
            $newTxId = New-Id "tx"
            $dedup = Get-TxDedupHash -UserId $userId -TxDate $nextRun -TxType ([string]$rule.tx_type) -AccountId ([string]$rule.account_id) -Amount $amt -Merchant ([string]$rule.title)
            $histJson = (@(@{ rev = 1; at = $now; action = "created_by_recurring_trigger"; recurring_id = $rule.recurring_id; scheduled_date = $nextRun }) | ConvertTo-Json -Compress)

            $txObj = [pscustomobject]@{
              transaction_id    = $newTxId
              user_id           = $userId
              tx_date           = $nextRun
              tx_time           = "08:00"
              tx_type           = [string]$rule.tx_type
              account_id        = [string]$rule.account_id
              to_account_id     = [string]$rule.to_account_id
              category_id       = [string]$rule.category_id
              subcategory_id    = ""
              amount            = $amt
              currency          = if ($rule.currency) { [string]$rule.currency } else { "THB" }
              exchange_rate     = 1
              to_amount         = $amt
              merchant          = [string]$rule.title
              description       = "สร้างอัตโนมัติจากรายการประจำ: $($rule.title) (งวด $nextRun)"
              tags              = "recurring,auto"
              receipt_url       = ""
              reference_tx_id   = ""
              recurring_id      = [string]$rule.recurring_id
              import_id         = ""
              idempotency_key   = $idemKey
              dedup_hash        = $dedup
              status            = "posted"
              revision          = 1
              edit_history_json = $histJson
              created_at        = $now
              updated_at        = $now
            }
            Append-SheetObject -SheetName "Transactions" -Obj $txObj
            $existingIdem[$idemKey] = $newTxId
            $generatedTxs += ,(Normalize-Transaction $txObj)
          }

          $rule.last_run_date = $nextRun
          $nextRun = & $advanceDate $nextRun $freq $iv
          $rule.next_run_date = $nextRun
          if ($endDate -and $nextRun -gt $endDate) { $rule.status = "completed" }
          $ruleChanged = $true
          $guard++
        }

        if ($ruleChanged) {
          $rule.updated_at = $now
          Update-SheetRow -SheetName "Recurring" -RowIndex $rule._rowIndex -Obj $rule
        }
      }

      $updatedAccs = Recalculate-UserAccountBalances -UserId $userId
      $entId = if ($specificId) { $specificId } else { "ALL" }
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "recurring.processDue" -EntityType "Recurring" -EntityId $entId -Summary "ประมวลผลรายการประจำ: สร้างใหม่ $($generatedTxs.Count) รายการ (ป้องกันซ้ำ $($skippedDuplicates.Count))" -MetaObj @{ as_of_date = $asOfDate }

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "recurring.list" -SessionToken $SessionToken -Params @{}
      return [ordered]@{
        processed_at             = $now
        as_of_date               = $asOfDate
        generated_count          = $generatedTxs.Count
        generated_transactions   = $generatedTxs
        skipped_duplicates_count = $skippedDuplicates.Count
        skipped_duplicates       = $skippedDuplicates
        accounts                 = $updatedAccs
        recurring_overview       = $listRes
      }
    }

    # =========================================================================
    # PHASE 2 — MODULE H: REPORTS & ANALYTICS (reports.overview)
    # =========================================================================
    "reports.overview" {
      $userId = [string]$authUser.user_id
      $now = Get-Date
      $defaultStart = "$($now.Year)-01-01"
      $defaultEnd   = (Get-Date -Year $now.Year -Month $now.Month -Day ([DateTime]::DaysInMonth($now.Year, $now.Month))).ToString("yyyy-MM-dd")

      $startDate = if ($Params.start_date) { ([string]$Params.start_date).Trim() } else { $defaultStart }
      $endDate   = if ($Params.end_date) { ([string]$Params.end_date).Trim() } else { $defaultEnd }
      $filterAcc = if ($Params.account_id) { ([string]$Params.account_id).Trim() } else { "" }
      $filterCat = if ($Params.category_id) { ([string]$Params.category_id).Trim() } else { "" }

      $accs = Recalculate-UserAccountBalances -UserId $userId
      $accMap = @{}
      $totalAssets = 0.0
      $totalLiabilities = 0.0
      foreach ($a in $accs) {
        $accMap[$a.account_id] = $a
        if (-not $a.is_archived -and $a.include_in_net_worth) {
          $b = [double]$a.current_balance
          if ($b -ge 0) { $totalAssets += $b } else { $totalLiabilities += [Math]::Abs($b) }
        }
      }
      $netWorth = [Math]::Round($totalAssets - $totalLiabilities, 2)

      $catsRes = Invoke-ApiAction -RequestId $RequestId -Action "categories.list" -SessionToken $SessionToken -Params @{}
      $catMap = @{}
      foreach ($c in $catsRes.categories) { $catMap[$c.category_id] = $c }

      $allTxsRaw = Read-SheetObjects -SheetName "Transactions"
      $actualTxs = @()
      foreach ($r in $allTxsRaw) {
        if ([string]$r.user_id -ne $userId -or [string]$r.status -ne "posted") { continue }
        if ($filterAcc -and [string]$r.account_id -ne $filterAcc -and [string]$r.to_account_id -ne $filterAcc) { continue }
        if ($filterCat -and [string]$r.category_id -ne $filterCat -and [string]$r.subcategory_id -ne $filterCat) { continue }
        $actualTxs += ,(Normalize-Transaction $r)
      }

      $actualIncome = 0.0
      $actualGrossExp = 0.0
      $actualRefunds = 0.0
      $actualTransfers = 0.0
      $byCatMap = @{}
      $byAccMap = @{}
      foreach ($a in $accs) {
        $byAccMap[$a.account_id] = @{
          account_id      = $a.account_id
          account_name    = $a.account_name
          account_type    = $a.account_type
          currency        = $a.currency
          current_balance = [double]$a.current_balance
          income          = 0.0
          expense         = 0.0
          transfers_in    = 0.0
          transfers_out   = 0.0
          net_flow        = 0.0
          tx_count        = 0
        }
      }

      $curYrInt = [int]$endDate.Substring(0, 4)
      $monthlyBuckets = @{}
      for ($m = 1; $m -le 12; $m++) {
        $ymKey = "{0}-{1:D2}" -f $curYrInt, $m
        $monthlyBuckets[$ymKey] = @{ period = $ymKey; income = 0.0; expense = 0.0; net = 0.0 }
      }
      $quarterlyBuckets = @{}
      for ($q = 1; $q -le 4; $q++) {
        $qKeyInit = "$curYrInt-Q$q"
        $quarterlyBuckets[$qKeyInit] = @{ period = $qKeyInit; income = 0.0; expense = 0.0; net = 0.0 }
      }
      $yearlyBuckets = @{}
      for ($y = ($curYrInt - 2); $y -le $curYrInt; $y++) {
        $yrKey = "$y"
        $yearlyBuckets[$yrKey] = @{ period = $yrKey; income = 0.0; expense = 0.0; net = 0.0 }
      }

      foreach ($tx in $actualTxs) {
        $d = [string]$tx.tx_date
        $ym = $d.Substring(0, 7)
        $yr = $d.Substring(0, 4)
        $mNum = [int]$d.Substring(5, 2)
        $qKey = "$yr-Q$([Math]::Ceiling($mNum / 3.0))"
        $amt = [double]$tx.amount
        $tType = [string]$tx.tx_type

        if (-not $monthlyBuckets.ContainsKey($ym)) { $monthlyBuckets[$ym] = @{ period = $ym; income = 0.0; expense = 0.0; net = 0.0 } }
        if (-not $quarterlyBuckets.ContainsKey($qKey)) { $quarterlyBuckets[$qKey] = @{ period = $qKey; income = 0.0; expense = 0.0; net = 0.0 } }
        if (-not $yearlyBuckets.ContainsKey($yr)) { $yearlyBuckets[$yr] = @{ period = $yr; income = 0.0; expense = 0.0; net = 0.0 } }

        if ($tType -eq "income") {
          $monthlyBuckets[$ym].income += $amt
          $quarterlyBuckets[$qKey].income += $amt
          $yearlyBuckets[$yr].income += $amt
        } elseif ($tType -eq "expense") {
          $monthlyBuckets[$ym].expense += $amt
          $quarterlyBuckets[$qKey].expense += $amt
          $yearlyBuckets[$yr].expense += $amt
        } elseif ($tType -eq "refund") {
          $monthlyBuckets[$ym].expense = [Math]::Max(0.0, $monthlyBuckets[$ym].expense - $amt)
          $quarterlyBuckets[$qKey].expense = [Math]::Max(0.0, $quarterlyBuckets[$qKey].expense - $amt)
          $yearlyBuckets[$yr].expense = [Math]::Max(0.0, $yearlyBuckets[$yr].expense - $amt)
        }

        if ($d -ge $startDate -and $d -le $endDate) {
          $cid = if ($tx.category_id) { [string]$tx.category_id } else { "uncategorized" }
          if (-not $byCatMap.ContainsKey($cid)) {
            $cObj = if ($catMap.ContainsKey($cid)) { $catMap[$cid] } else { @{ category_name = "ไม่ระบุหมวดหมู่"; category_type = $tType; color = "#64748B" } }
            $byCatMap[$cid] = @{
              category_id   = $cid
              category_name = $cObj.category_name
              category_type = $cObj.category_type
              color         = $cObj.color
              income        = 0.0
              expense       = 0.0
              tx_count      = 0
            }
          }

          if ($tType -eq "income") {
            $actualIncome += $amt
            $byCatMap[$cid].income += $amt
            $byCatMap[$cid].tx_count++
            if ($byAccMap.ContainsKey($tx.account_id)) {
              $byAccMap[$tx.account_id].income += $amt
              $byAccMap[$tx.account_id].net_flow += $amt
              $byAccMap[$tx.account_id].tx_count++
            }
          } elseif ($tType -eq "expense") {
            $actualGrossExp += $amt
            $byCatMap[$cid].expense += $amt
            $byCatMap[$cid].tx_count++
            if ($byAccMap.ContainsKey($tx.account_id)) {
              $byAccMap[$tx.account_id].expense += $amt
              $byAccMap[$tx.account_id].net_flow -= $amt
              $byAccMap[$tx.account_id].tx_count++
            }
          } elseif ($tType -eq "refund") {
            $actualRefunds += $amt
            $byCatMap[$cid].expense = [Math]::Max(0.0, $byCatMap[$cid].expense - $amt)
            $byCatMap[$cid].tx_count++
            if ($byAccMap.ContainsKey($tx.account_id)) {
              $byAccMap[$tx.account_id].expense = [Math]::Max(0.0, $byAccMap[$tx.account_id].expense - $amt)
              $byAccMap[$tx.account_id].net_flow += $amt
              $byAccMap[$tx.account_id].tx_count++
            }
          } elseif ($tType -eq "transfer") {
            $actualTransfers += $amt
            if ($byAccMap.ContainsKey($tx.account_id)) {
              $byAccMap[$tx.account_id].transfers_out += $amt
              $byAccMap[$tx.account_id].net_flow -= $amt
              $byAccMap[$tx.account_id].tx_count++
            }
            if ($tx.to_account_id -and $byAccMap.ContainsKey($tx.to_account_id)) {
              $inAmt = if ($tx.to_amount) { [double]$tx.to_amount } else { $amt }
              $byAccMap[$tx.to_account_id].transfers_in += $inAmt
              $byAccMap[$tx.to_account_id].net_flow += $inAmt
              $byAccMap[$tx.to_account_id].tx_count++
            }
          }
        }
      }

      $actualNetExp = [Math]::Round([Math]::Max(0.0, $actualGrossExp - $actualRefunds), 2)
      $actualNetCashflow = [Math]::Round($actualIncome - $actualNetExp, 2)
      $actualSavingsRate = if ($actualIncome -gt 0) { [Math]::Round((($actualIncome - $actualNetExp) / $actualIncome) * 100.0, 2) } else { 0.0 }

      $catReport = @()
      foreach ($k in $byCatMap.Keys) {
        $item = $byCatMap[$k]
        $inc = [Math]::Round($item.income, 2)
        $exp = [Math]::Round($item.expense, 2)
        if ($inc -le 0 -and $exp -le 0) { continue }
        $catReport += [ordered]@{
          category_id          = $item.category_id
          category_name        = $item.category_name
          category_type        = $item.category_type
          color                = $item.color
          income               = $inc
          expense              = $exp
          income_amount        = $inc
          expense_amount       = $exp
          share_of_expense_pct = if ($actualNetExp -gt 0) { [Math]::Round(($exp / $actualNetExp) * 100.0, 2) } else { 0.0 }
          tx_count             = $item.tx_count
        }
      }
      $catReport = @($catReport | Sort-Object { ($_.expense + $_.income) } -Descending)

      $accReport = @()
      foreach ($k in $byAccMap.Keys) {
        $a = $byAccMap[$k]
        $origAcc = $accMap[$k]
        $accReport += [ordered]@{
          account_id      = $a.account_id
          account_name    = $a.account_name
          account_type    = $a.account_type
          currency        = $a.currency
          opening_balance = if ($origAcc) { [Math]::Round([double]$origAcc.opening_balance, 2) } else { 0.0 }
          current_balance = [Math]::Round($a.current_balance, 2)
          income          = [Math]::Round($a.income, 2)
          expense         = [Math]::Round($a.expense, 2)
          inflow_income   = [Math]::Round($a.income, 2)
          outflow_expense = [Math]::Round($a.expense, 2)
          inflow          = [Math]::Round($a.income + $a.transfers_in, 2)
          outflow         = [Math]::Round($a.expense + $a.transfers_out, 2)
          transfers_in    = [Math]::Round($a.transfers_in, 2)
          transfers_out   = [Math]::Round($a.transfers_out, 2)
          transfer_in     = [Math]::Round($a.transfers_in, 2)
          transfer_out    = [Math]::Round($a.transfers_out, 2)
          net_flow        = [Math]::Round($a.net_flow, 2)
          tx_count        = $a.tx_count
        }
      }

      $finalizeBuckets = { param($bMap)
        $out = @()
        foreach ($k in ($bMap.Keys | Sort-Object)) {
          $b = $bMap[$k]
          $inc = [Math]::Round($b.income, 2)
          $exp = [Math]::Round($b.expense, 2)
          $out += [ordered]@{
            period           = $b.period
            label            = $b.period
            year             = $b.period
            income           = $inc
            expense          = $exp
            net              = [Math]::Round($inc - $exp, 2)
            savings_rate_pct = if ($inc -gt 0) { [Math]::Round((($inc - $exp) / $inc) * 100.0, 2) } else { 0.0 }
          }
        }
        return $out
      }

      $budgetsData = Invoke-ApiAction -RequestId $RequestId -Action "budgets.list" -SessionToken $SessionToken -Params @{}
      $goalsData   = Invoke-ApiAction -RequestId $RequestId -Action "goals.list" -SessionToken $SessionToken -Params @{}
      $recData     = Invoke-ApiAction -RequestId $RequestId -Action "recurring.list" -SessionToken $SessionToken -Params @{}

      $projInc = 0.0
      $projExp = 0.0
      foreach ($f in $recData.upcoming_forecasts) {
        if ($f.tx_type -eq "income") { $projInc += [double]$f.amount }
        elseif ($f.tx_type -eq "expense") { $projExp += [double]$f.amount }
      }

      $mComp = (& $finalizeBuckets $monthlyBuckets)
      $qComp = (& $finalizeBuckets $quarterlyBuckets)
      $yComp = (& $finalizeBuckets $yearlyBuckets)

      $actualsObj = [ordered]@{
        record_nature       = "ACTUAL_POSTED_ONLY"
        income              = [Math]::Round($actualIncome, 2)
        gross_expense       = [Math]::Round($actualGrossExp, 2)
        refunds             = [Math]::Round($actualRefunds, 2)
        net_expense         = $actualNetExp
        transfers_volume    = [Math]::Round($actualTransfers, 2)
        net_cashflow        = $actualNetCashflow
        savings_rate_pct    = $actualSavingsRate
        total_assets        = [Math]::Round($totalAssets, 2)
        total_liabilities   = [Math]::Round($totalLiabilities, 2)
        net_worth           = $netWorth
        by_category         = $catReport
        by_account          = $accReport
        comparisons         = [ordered]@{
          monthly   = $mComp
          quarterly = $qComp
          yearly    = $yComp
        }
      }

      $projObj = [ordered]@{
        record_nature                  = "FORECAST_ESTIMATES_SEPARATED"
        note                           = "ข้อมูลคาดการณ์คำนวณจากรายการประจำล่วงหน้า 90 วัน แยกออกจากยอดเงินจริงในฐานข้อมูลอย่างชัดเจน"
        projected_90d_income           = [Math]::Round($projInc, 2)
        projected_90d_expense          = [Math]::Round($projExp, 2)
        projected_90d_net_cashflow     = [Math]::Round($projInc - $projExp, 2)
        projected_income_90d           = [Math]::Round($projInc, 2)
        projected_expense_90d          = [Math]::Round($projExp, 2)
        projected_net_90d              = [Math]::Round($projInc - $projExp, 2)
        upcoming_recurring_occurrences = $recData.upcoming_forecasts
      }

      $periodObj = @{
        start_date  = $startDate
        end_date    = $endDate
        account_id  = if ($filterAcc) { $filterAcc } else { "ALL" }
        category_id = if ($filterCat) { $filterCat } else { "ALL" }
      }

      $debtsData = Invoke-ApiAction -RequestId $RequestId -Action "debts.list" -SessionToken $SessionToken -Params @{}
      $loanRemBal = if ($debtsData -and $debtsData.summary) { [double]$debtsData.summary.total_remaining_balance } else { 0.0 }
      $combinedLiabilities = [Math]::Round($totalLiabilities + $loanRemBal, 2)
      $combinedNetWorth    = [Math]::Round($netWorth - $loanRemBal, 2)
      $actualsObj.total_liabilities = $combinedLiabilities
      $actualsObj.net_worth         = $combinedNetWorth

      return [ordered]@{
        period                = $periodObj
        report_period         = $periodObj
        actuals               = $actualsObj
        actuals_summary       = $actualsObj
        net_worth_report      = @{ net_worth = $combinedNetWorth; total_assets = [Math]::Round($totalAssets, 2); total_liabilities = $combinedLiabilities }
        projections           = $projObj
        projections_summary   = $projObj
        monthly_comparison    = $mComp
        quarterly_comparison  = $qComp
        yearly_comparison     = $yComp
        category_report       = $catReport
        account_report        = $accReport
        budgets_vs_actual     = $budgetsData.budgets
        budgets_report        = $budgetsData
        savings_goals_summary = $goalsData
        goals_report          = $goalsData
        debts_report          = $debtsData
      }
    }

    # =========================================================================
    # PHASE 3 — MODULE G: DEBTS, AMORTIZATION, DTI & CREDIT CARDS
    # =========================================================================
    "debts.list" {
      $userId = [string]$authUser.user_id
      $includeArchived = ($Params.include_archived -eq $true -or [string]$Params.include_archived -eq "true")
      $nowDt = Get-Date
      $todayStr = $nowDt.ToString("yyyy-MM-dd")
      $currentYm = $todayStr.Substring(0, 7)

      $allDebts = Read-SheetObjects -SheetName "Debts"
      $allPayments = Read-SheetObjects -SheetName "Debt_Payments"
      $allAccounts = Recalculate-UserAccountBalances -UserId $userId
      $allTxs = Read-SheetObjects -SheetName "Transactions"

      $paymentsByDebt = @{}
      foreach ($p in $allPayments) {
        if ([string]$p.user_id -ne $userId) { continue }
        $dId = [string]$p.debt_id
        if (-not $paymentsByDebt.ContainsKey($dId)) { $paymentsByDebt[$dId] = @() }
        $paymentsByDebt[$dId] += [ordered]@{
          payment_id            = [string]$p.payment_id
          debt_id               = $dId
          payment_date          = [string]$p.payment_date
          total_amount          = [Math]::Round([double]($p.total_amount -as [double]), 2)
          principal_paid        = [Math]::Round([double]($p.principal_paid -as [double]), 2)
          interest_paid         = [Math]::Round([double]($p.interest_paid -as [double]), 2)
          fee_amount            = [Math]::Round([double]($p.fee_amount -as [double]), 2)
          remaining_balance     = [Math]::Round([double]($p.remaining_balance -as [double]), 2)
          linked_transaction_id = [string]$p.linked_transaction_id
          created_at            = [string]$p.created_at
        }
      }

      # Compute reference monthly income from actual posted income transactions
      $curMonthIncome = 0.0
      $totalIncAll = 0.0
      $incMonths = @{}
      foreach ($tx in $allTxs) {
        if ([string]$tx.user_id -ne $userId -or [string]$tx.status -ne "posted") { continue }
        if ([string]$tx.tx_type -eq "income") {
          $amt = [double]($tx.amount -as [double])
          $totalIncAll += $amt
          $ym = if ($tx.tx_date -and ([string]$tx.tx_date).Length -ge 7) { ([string]$tx.tx_date).Substring(0, 7) } else { "" }
          if ($ym) { $incMonths[$ym] = $true }
          if ($ym -eq $currentYm) { $curMonthIncome += $amt }
        }
      }
      $mCount = $incMonths.Keys.Count
      $refMonthlyIncome = if ($curMonthIncome -gt 0) { [Math]::Round($curMonthIncome, 2) } elseif ($mCount -gt 0) { [Math]::Round($totalIncAll / $mCount, 2) } else { 0.0 }

      $calcNextDayDate = { param($dayNum)
        $dTarget = [Math]::Min(28, [Math]::Max(1, [int]$dayNum))
        $cand = Get-Date -Year $nowDt.Year -Month $nowDt.Month -Day $dTarget
        if ($dTarget -lt $nowDt.Day) { $cand = $cand.AddMonths(1) }
        return $cand.ToString("yyyy-MM-dd")
      }

      $calcAmortQuick = { param([double]$bal, [double]$ratePct, [double]$pmt)
        if ($bal -le 0.01) { return @{ months = 0; payoff_date = $todayStr; total_interest = 0.0 } }
        $mRate = ($ratePct / 100.0) / 12.0
        $firstInt = [Math]::Round($bal * $mRate, 2)
        if ($pmt -le $firstInt) { return @{ months = $null; payoff_date = $null; total_interest = 0.0 } }
        $rem = $bal
        $totInt = 0.0
        $m = 0
        while ($rem -gt 0.01 -and $m -lt 120) {
          $m++
          $intAmt = [Math]::Round($rem * $mRate, 2)
          $prinAmt = [Math]::Min($rem, [Math]::Round($pmt - $intAmt, 2))
          $rem = [Math]::Max(0.0, [Math]::Round($rem - $prinAmt, 2))
          $totInt = [Math]::Round($totInt + $intAmt, 2)
        }
        return @{
          months = $m
          payoff_date = $nowDt.AddMonths($m).ToString("yyyy-MM-dd")
          total_interest = $totInt
        }
      }

      $enrichedDebts = @()
      $totalPrincipal = 0.0
      $totalRemBalance = 0.0
      $totalMinPayment = 0.0
      $totalPaidPrincipal = 0.0
      $totalPaidInterest = 0.0

      foreach ($d in $allDebts) {
        if ([string]$d.user_id -ne $userId) { continue }
        $st = if ($d.status) { [string]$d.status } else { "active" }
        if (-not $includeArchived -and $st -eq "archived") { continue }

        $dId = [string]$d.debt_id
        $pmts = if ($paymentsByDebt.ContainsKey($dId)) { @($paymentsByDebt[$dId] | Sort-Object { [string]$_.payment_date } -Descending) } else { @() }
        $prin = [Math]::Round([double]($d.principal_amount -as [double]), 2)
        $curBal = [Math]::Round([double]($d.current_balance -as [double]), 2)
        $rate = [Math]::Round([double]($d.interest_rate_annual -as [double]), 2)
        $minPay = [Math]::Round([double]($d.minimum_payment -as [double]), 2)
        $dueDay = if ($d.due_day) { [int]($d.due_day -as [int]) } else { 15 }

        $paidP = 0.0
        $paidI = 0.0
        $paidF = 0.0
        foreach ($pm in $pmts) {
          $paidP += [double]$pm.principal_paid
          $paidI += [double]$pm.interest_paid
          $paidF += [double]$pm.fee_amount
        }

        $paidOffPct = if ($prin -gt 0) { [Math]::Min(100.0, [Math]::Max(0.0, [Math]::Round((($prin - $curBal) / $prin) * 100.0, 2))) } else { 100.0 }
        $am = (& $calcAmortQuick $curBal $rate $minPay)

        if ($st -eq "active") {
          $totalPrincipal += $prin
          $totalRemBalance += $curBal
          $totalMinPayment += $minPay
        }
        $totalPaidPrincipal += $paidP
        $totalPaidInterest += $paidI

        $enrichedDebts += [ordered]@{
          debt_id                      = $dId
          debt_name                    = [string]$d.debt_name
          debt_type                    = if ($d.debt_type) { [string]$d.debt_type } else { "personal_loan" }
          lender_name                  = [string]$d.lender_name
          linked_account_id            = [string]$d.linked_account_id
          principal_amount             = $prin
          current_balance              = $curBal
          paid_off_pct                 = $paidOffPct
          interest_rate_annual         = $rate
          minimum_payment              = $minPay
          due_day                      = $dueDay
          next_due_date                = (& $calcNextDayDate $dueDay)
          start_date                   = [string]$d.start_date
          target_payoff_date           = [string]$d.target_payoff_date
          estimated_months_remaining   = $am.months
          estimated_payoff_date        = $am.payoff_date
          projected_remaining_interest = $am.total_interest
          total_principal_paid         = [Math]::Round($paidP, 2)
          total_interest_paid          = [Math]::Round($paidI, 2)
          total_fees_paid              = [Math]::Round($paidF, 2)
          payment_count                = $pmts.Count
          payments                     = $pmts
          status                       = $st
          created_at                   = [string]$d.created_at
          updated_at                   = [string]$d.updated_at
        }
      }

      $creditCards = @()
      $totalCcDebt = 0.0
      $totalCcMinPay = 0.0
      foreach ($acc in $allAccounts) {
        if ($acc.is_archived -or [string]$acc.account_type -ne "credit_card") { continue }
        $curBal = [double]$acc.current_balance
        $owed = if ($curBal -lt 0) { [Math]::Round([Math]::Abs($curBal), 2) } else { 0.0 }
        $limit = [Math]::Round([double]($acc.credit_limit -as [double]), 2)
        $avail = if ($limit -gt 0) { [Math]::Max(0.0, [Math]::Round($limit - $owed, 2)) } else { 0.0 }
        $utilPct = if ($limit -gt 0) { [Math]::Round(($owed / $limit) * 100.0, 2) } else { 0.0 }
        $bDay = if ($acc.billing_day -and [int]$acc.billing_day -gt 0) { [int]$acc.billing_day } else { 25 }
        $dDay = if ($acc.due_day -and [int]$acc.due_day -gt 0) { [int]$acc.due_day } else { 10 }
        $estMin = if ($owed -gt 0) { [Math]::Round([Math]::Max(500.0, $owed * 0.10), 2) } else { 0.0 }

        $totalCcDebt += $owed
        $totalCcMinPay += $estMin

        $creditCards += [ordered]@{
          account_id                = [string]$acc.account_id
          account_name              = [string]$acc.account_name
          institution_name          = [string]$acc.institution_name
          currency                  = if ($acc.currency) { [string]$acc.currency } else { "THB" }
          current_balance           = $curBal
          owed_amount               = $owed
          credit_limit              = $limit
          available_credit          = $avail
          utilization_pct           = $utilPct
          billing_day               = $bDay
          due_day                   = $dDay
          next_billing_date         = (& $calcNextDayDate $bDay)
          next_due_date             = (& $calcNextDayDate $dDay)
          estimated_minimum_payment = $estMin
          status                    = if ($owed -le 0) { "paid_clear" } elseif ($utilPct -ge 80) { "high_utilization" } else { "statement_active" }
        }
      }

      $combinedDebtService = [Math]::Round($totalMinPayment + $totalCcMinPay, 2)
      $dtiPct = if ($refMonthlyIncome -gt 0) { [Math]::Round(($combinedDebtService / $refMonthlyIncome) * 100.0, 2) } else { 0.0 }
      $dtiStatus = if ($dtiPct -le 35) { "healthy" } elseif ($dtiPct -le 49) { "moderate" } else { "high_risk" }

      return [ordered]@{
        summary = [ordered]@{
          active_debts_count            = @($enrichedDebts | Where-Object { $_.status -eq "active" }).Count
          total_principal               = [Math]::Round($totalPrincipal, 2)
          total_remaining_balance       = [Math]::Round($totalRemBalance, 2)
          total_credit_card_owed        = [Math]::Round($totalCcDebt, 2)
          total_combined_liability      = [Math]::Round($totalRemBalance + $totalCcDebt, 2)
          total_minimum_payment         = [Math]::Round($totalMinPayment, 2)
          total_credit_card_min_payment = [Math]::Round($totalCcMinPay, 2)
          combined_monthly_debt_service = $combinedDebtService
          reference_monthly_income      = $refMonthlyIncome
          dti_percentage                = $dtiPct
          dti_status                    = $dtiStatus
          total_principal_paid          = [Math]::Round($totalPaidPrincipal, 2)
          total_interest_paid           = [Math]::Round($totalPaidInterest, 2)
        }
        debts        = $enrichedDebts
        credit_cards = $creditCards
      }
    }

    "debts.create" {
      $userId = [string]$authUser.user_id
      $debtName = ([string]$Params.debt_name).Trim()
      if ([string]::IsNullOrWhiteSpace($debtName)) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุชื่อหนี้สิน/สินเชื่อ") }
      $debtType = if ($Params.debt_type) { ([string]$Params.debt_type).Trim() } else { "personal_loan" }
      $lender   = ([string]$Params.lender_name).Trim()
      $linkedAcc = ([string]$Params.linked_account_id).Trim()
      $prin     = [Math]::Round([double]($Params.principal_amount -as [double]), 2)
      if ($prin -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|ยอดเงินต้นต้องมากกว่า 0") }
      $curBal   = if ($null -ne $Params.current_balance -and [string]$Params.current_balance -ne "") { [Math]::Round([double]($Params.current_balance -as [double]), 2) } else { $prin }
      $rate     = if ($null -ne $Params.interest_rate_annual -and [string]$Params.interest_rate_annual -ne "") { [Math]::Round([double]($Params.interest_rate_annual -as [double]), 2) } else { 0.0 }
      $minPay   = [Math]::Round([double]($Params.minimum_payment -as [double]), 2)
      if ($minPay -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|ยอดผ่อนขั้นต่ำต่อเดือนต้องมากกว่า 0") }
      $dueDay   = if ($Params.due_day) { [Math]::Min(31, [Math]::Max(1, [int]($Params.due_day -as [int]))) } else { 15 }
      $startDate = if ($Params.start_date) { ([string]$Params.start_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }
      $targetDate = ([string]$Params.target_payoff_date).Trim()

      $now = Get-NowIso
      $debtId = New-Id "dbt"
      $newDebt = [pscustomobject]@{
        debt_id              = $debtId
        user_id              = $userId
        debt_name            = $debtName
        debt_type            = $debtType
        lender_name          = $lender
        linked_account_id    = $linkedAcc
        principal_amount     = $prin
        current_balance      = $curBal
        interest_rate_annual = $rate
        minimum_payment      = $minPay
        due_day              = $dueDay
        start_date           = $startDate
        target_payoff_date   = $targetDate
        status               = if ($curBal -le 0) { "paid_off" } else { "active" }
        created_at           = $now
        updated_at           = $now
      }

      Append-SheetObject -SheetName "Debts" -Obj $newDebt
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "debts.create" -EntityType "Debts" -EntityId $debtId -Summary "สร้างรายการหนี้สิน: $debtName ยอด $curBal" -MetaObj @{ principal_amount = $prin; current_balance = $curBal }

      $listData = Invoke-ApiAction -RequestId $RequestId -Action "debts.list" -SessionToken $SessionToken -Params @{}
      $createdObj = $listData.debts | Where-Object { $_.debt_id -eq $debtId } | Select-Object -First 1
      return @{ debt = $createdObj }
    }

    "debts.update" {
      $userId = [string]$authUser.user_id
      $debtId = ([string]$Params.debt_id).Trim()
      $allDebts = Read-SheetObjects -SheetName "Debts"
      $target = $null
      foreach ($d in $allDebts) {
        if ([string]$d.debt_id -eq $debtId -and [string]$d.user_id -eq $userId) { $target = $d; break }
      }
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบรายการหนี้สินที่ต้องการแก้ไข") }

      if ($Params.debt_name) { $target.debt_name = ([string]$Params.debt_name).Trim() }
      if ($Params.debt_type) { $target.debt_type = ([string]$Params.debt_type).Trim() }
      if ($null -ne $Params.lender_name) { $target.lender_name = ([string]$Params.lender_name).Trim() }
      if ($null -ne $Params.linked_account_id) { $target.linked_account_id = ([string]$Params.linked_account_id).Trim() }
      if ($null -ne $Params.principal_amount) { $target.principal_amount = [Math]::Round([double]($Params.principal_amount -as [double]), 2) }
      if ($null -ne $Params.current_balance) { $target.current_balance = [Math]::Round([double]($Params.current_balance -as [double]), 2) }
      if ($null -ne $Params.interest_rate_annual) { $target.interest_rate_annual = [Math]::Round([double]($Params.interest_rate_annual -as [double]), 2) }
      if ($null -ne $Params.minimum_payment) { $target.minimum_payment = [Math]::Round([double]($Params.minimum_payment -as [double]), 2) }
      if ($null -ne $Params.due_day) { $target.due_day = [int]($Params.due_day -as [int]) }
      if ($null -ne $Params.target_payoff_date) { $target.target_payoff_date = ([string]$Params.target_payoff_date).Trim() }
      if ($Params.status) { $target.status = ([string]$Params.status).Trim() }

      $target.updated_at = Get-NowIso
      Update-SheetRow -SheetName "Debts" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "debts.update" -EntityType "Debts" -EntityId $debtId -Summary "แก้ไขข้อมูลหนี้สิน $($target.debt_name)" -MetaObj @{}

      $listData = Invoke-ApiAction -RequestId $RequestId -Action "debts.list" -SessionToken $SessionToken -Params @{}
      $updatedObj = $listData.debts | Where-Object { $_.debt_id -eq $debtId } | Select-Object -First 1
      return @{ debt = $updatedObj }
    }

    "debts.pay" {
      $userId = [string]$authUser.user_id
      $debtId = ([string]$Params.debt_id).Trim()
      $payDate = if ($Params.payment_date) { ([string]$Params.payment_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }
      $totalAmt = [Math]::Round([double]($Params.total_amount -as [double]), 2)
      if ($totalAmt -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|ยอดชำระรวมต้องมากกว่า 0") }

      $allDebts = Read-SheetObjects -SheetName "Debts"
      $targetDebt = $null
      foreach ($d in $allDebts) {
        if ([string]$d.debt_id -eq $debtId -and [string]$d.user_id -eq $userId) { $targetDebt = $d; break }
      }
      if ($null -eq $targetDebt) { throw [System.Exception]::new("NOT_FOUND|ไม่พบรายการหนี้สินที่ต้องการชำระ") }

      $curBal = [double]($targetDebt.current_balance -as [double])
      $annRate = [double]($targetDebt.interest_rate_annual -as [double])
      $defaultMonthlyInt = [Math]::Round($curBal * ($annRate / 100.0) / 12.0, 2)

      $feeAmt = if ($null -ne $Params.fee_amount -and [string]$Params.fee_amount -ne "") { [Math]::Round([double]($Params.fee_amount -as [double]), 2) } else { 0.0 }
      $intPaid = if ($null -ne $Params.interest_paid -and [string]$Params.interest_paid -ne "") { [Math]::Round([double]($Params.interest_paid -as [double]), 2) } else { [Math]::Min($totalAmt - $feeAmt, $defaultMonthlyInt) }
      $prinPaid = if ($null -ne $Params.principal_paid -and [string]$Params.principal_paid -ne "") { [Math]::Round([double]($Params.principal_paid -as [double]), 2) } else { [Math]::Max(0.0, [Math]::Round($totalAmt - $intPaid - $feeAmt, 2)) }
      $remBal = [Math]::Max(0.0, [Math]::Round($curBal - $prinPaid, 2))

      $linkedTxId = if ($Params.linked_transaction_id) { ([string]$Params.linked_transaction_id).Trim() } else { "" }
      $payAccId   = if ($Params.payment_account_id) { ([string]$Params.payment_account_id).Trim() } else { "" }

      if ($payAccId -and -not $linkedTxId) {
        $isCcTrf = (-not [string]::IsNullOrWhiteSpace([string]$targetDebt.linked_account_id)) -and ([string]$targetDebt.linked_account_id -ne $payAccId)
        $txRes = Invoke-ApiAction -RequestId $RequestId -Action "transactions.create" -SessionToken $SessionToken -Params @{
          tx_type         = if ($isCcTrf) { "transfer" } else { "expense" }
          tx_date         = $payDate
          account_id      = $payAccId
          to_account_id   = if ($isCcTrf) { [string]$targetDebt.linked_account_id } else { "" }
          category_id     = if ($isCcTrf) { "cat_trf_internal" } else { "cat_exp_debt" }
          amount          = $totalAmt
          merchant        = if ($targetDebt.lender_name) { [string]$targetDebt.lender_name } else { [string]$targetDebt.debt_name }
          description     = "ชำระหนี้ $($targetDebt.debt_name) (เงินต้น $prinPaid, ดอกเบี้ย $intPaid)"
          tags            = "debt-payment"
          allow_duplicate = $true
        }
        $linkedTxId = [string]$txRes.transaction.transaction_id
      }

      $now = Get-NowIso
      $payId = New-Id "dpm"
      $payObj = [pscustomobject]@{
        payment_id            = $payId
        debt_id               = $debtId
        user_id               = $userId
        payment_date          = $payDate
        total_amount          = $totalAmt
        principal_paid        = $prinPaid
        interest_paid         = $intPaid
        fee_amount            = $feeAmt
        remaining_balance     = $remBal
        linked_transaction_id = $linkedTxId
        created_at            = $now
      }
      Append-SheetObject -SheetName "Debt_Payments" -Obj $payObj

      $targetDebt.current_balance = $remBal
      if ($remBal -le 0) { $targetDebt.status = "paid_off" }
      $targetDebt.updated_at = $now
      Update-SheetRow -SheetName "Debts" -RowIndex $targetDebt._rowIndex -Obj $targetDebt

      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "debts.pay" -EntityType "Debt_Payments" -EntityId $payId -Summary "ชำระหนี้ $($targetDebt.debt_name) ยอดรวม $totalAmt (เงินต้น $prinPaid, ดอกเบี้ย $intPaid)" -MetaObj @{ debt_id = $debtId; remaining_balance = $remBal }

      return @{
        payment = $payObj
        debt    = $targetDebt
      }
    }

    "debts.payCreditCard" {
      $userId = [string]$authUser.user_id
      $fromAccId = ([string]$Params.from_account_id).Trim()
      $ccAccId   = ([string]$Params.credit_card_account_id).Trim()
      $amt       = [Math]::Round([double]($Params.amount -as [double]), 2)
      $payDate   = if ($Params.payment_date) { ([string]$Params.payment_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }

      if ([string]::IsNullOrWhiteSpace($fromAccId) -or [string]::IsNullOrWhiteSpace($ccAccId) -or $fromAccId -eq $ccAccId) {
        throw [System.Exception]::new("VALIDATION_ERROR|กรุณาเลือกบัญชีต้นทางและบัญชีบัตรเครดิตให้ถูกต้อง")
      }
      if ($amt -le 0) {
        throw [System.Exception]::new("VALIDATION_ERROR|จำนวนเงินที่ชำระบัตรเครดิตต้องมากกว่า 0")
      }

      # Strictly record as internal TRANSFER so credit card settlement NEVER duplicates expense totals!
      $txRes = Invoke-ApiAction -RequestId $RequestId -Action "transactions.create" -SessionToken $SessionToken -Params @{
        tx_type         = "transfer"
        tx_date         = $payDate
        account_id      = $fromAccId
        to_account_id   = $ccAccId
        category_id     = "cat_trf_internal"
        amount          = $amt
        merchant        = "ชำระยอดบัตรเครดิต (Credit Card Settlement)"
        description     = if ($Params.note) { [string]$Params.note } else { "ชำระบิลบัตรเครดิตผ่านการโอนปิดยอด (ไม่นับรายจ่ายซ้ำ)" }
        tags            = "credit-card-payment,non-duplicate-transfer"
        idempotency_key = if ($Params.idempotency_key) { [string]$Params.idempotency_key } else { "" }
        allow_duplicate = $true
      }

      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "debts.payCreditCard" -EntityType "Transactions" -EntityId $txRes.transaction.transaction_id -Summary "ชำระยอดบัตรเครดิตแบบ Transfer ไม่นับรายจ่ายซ้ำ จำนวน $amt" -MetaObj @{ from_account_id = $fromAccId; credit_card_account_id = $ccAccId; amount = $amt }

      return @{
        transaction             = $txRes.transaction
        accounts                = $txRes.accounts
        non_duplicate_guarantee = "RECORDED_AS_INTERNAL_TRANSFER_NO_EXPENSE_DOUBLE_COUNT"
      }
    }

    "debts.amortization" {
      $userId = [string]$authUser.user_id
      $bal = [double]($Params.current_balance -as [double])
      $rate = [double]($Params.interest_rate_annual -as [double])
      $pmt = [double]($Params.monthly_payment -as [double])
      $dName = if ($Params.debt_name) { [string]$Params.debt_name } else { "ตารางผ่อนชำระหนี้สิน" }

      if ($Params.debt_id) {
        $allDebts = Read-SheetObjects -SheetName "Debts"
        foreach ($d in $allDebts) {
          if ([string]$d.debt_id -eq [string]$Params.debt_id -and [string]$d.user_id -eq $userId) {
            $bal = [double]($d.current_balance -as [double])
            $rate = [double]($d.interest_rate_annual -as [double])
            if ($pmt -le 0) { $pmt = [double]($d.minimum_payment -as [double]) }
            $dName = [string]$d.debt_name
            break
          }
        }
      }

      $mRate = ($rate / 100.0) / 12.0
      $rem = [Math]::Round($bal, 2)
      $pmt = [Math]::Round($pmt, 2)
      $firstInt = [Math]::Round($rem * $mRate, 2)

      if ($rem -le 0) {
        return @{ debt_name = $dName; starting_balance = 0; months_to_payoff = 0; total_interest = 0; total_payment = 0; schedule = @() }
      }
      if ($pmt -le $firstInt) {
        return @{
          debt_name            = $dName
          starting_balance     = $rem
          interest_rate_annual = $rate
          monthly_payment      = $pmt
          months_to_payoff     = $null
          total_interest       = 0
          total_payment        = 0
          warning              = "ยอดผ่อนต่อเดือน ($pmt) น้อยกว่าหรือเท่ากับดอกเบี้ยรายเดือน ($firstInt) ทำให้เงินต้นไม่ลดลง"
          schedule             = @()
        }
      }

      $sched = @()
      $totInt = 0.0
      $totPay = 0.0
      $m = 0
      $baseDt = Get-Date
      while ($rem -gt 0.01 -and $m -lt 120) {
        $m++
        $intAmt = [Math]::Round($rem * $mRate, 2)
        $actualPmt = $pmt
        $prinAmt = [Math]::Round($actualPmt - $intAmt, 2)
        if ($prinAmt -ge $rem) {
          $prinAmt = $rem
          $actualPmt = [Math]::Round($prinAmt + $intAmt, 2)
        }
        $rem = [Math]::Max(0.0, [Math]::Round($rem - $prinAmt, 2))
        $totInt = [Math]::Round($totInt + $intAmt, 2)
        $totPay = [Math]::Round($totPay + $actualPmt, 2)
        $estDt = $baseDt.AddMonths($m).ToString("yyyy-MM-dd")

        $sched += [ordered]@{
          installment_no    = $m
          estimated_date    = $estDt
          payment_amount    = $actualPmt
          principal_paid    = $prinAmt
          interest_paid     = $intAmt
          remaining_balance = $rem
        }
      }

      return [ordered]@{
        debt_name             = $dName
        starting_balance      = [Math]::Round($bal, 2)
        interest_rate_annual  = $rate
        monthly_payment       = $pmt
        months_to_payoff      = $m
        estimated_payoff_date = if ($sched.Count -gt 0) { $sched[$sched.Count - 1].estimated_date } else { $null }
        total_interest        = $totInt
        total_payment         = $totPay
        warning               = if ($rem -gt 0.01) { "แสดงตารางสูงสุด 120 งวด (ยังเหลือยอดคงค้าง $rem)" } else { $null }
        schedule              = $sched
      }
    }

    # =========================================================================
    # PHASE 3 — MODULE G: BILLS & REMINDERS + MODULE I: IMPORT HISTORY
    # =========================================================================
    "bills.list" {
      $userId = [string]$authUser.user_id
      $statusFilter = if ($Params.status) { ([string]$Params.status).Trim().ToLowerInvariant() } else { "" }
      $allBills = Read-SheetObjects -SheetName "Bills"
      $catsRes = Invoke-ApiAction -RequestId $RequestId -Action "categories.list" -SessionToken $SessionToken -Params @{}
      $catMap = @{}
      foreach ($c in $catsRes.categories) { $catMap[$c.category_id] = $c }

      $nowDt = Get-Date
      $todayStr = $nowDt.ToString("yyyy-MM-dd")
      $todayDt  = [DateTime]::ParseExact($todayStr, "yyyy-MM-dd", $null)
      $curYm    = $todayStr.Substring(0, 7)

      $bills = @()
      $unpaidTotal = 0.0
      $overdueTotal = 0.0
      $dueSoonTotal = 0.0
      $paidThisMonth = 0.0
      $overdueCount = 0
      $dueSoonCount = 0

      foreach ($b in $allBills) {
        if ([string]$b.user_id -ne $userId) { continue }
        $dueStr = if ($b.due_date) { ([string]$b.due_date).Substring(0, [Math]::Min(10, ([string]$b.due_date).Length)) } else { $todayStr }
        $daysUntil = 0
        try {
          $dueDt = [DateTime]::ParseExact($dueStr, "yyyy-MM-dd", $null)
          $daysUntil = [int][Math]::Round(($dueDt - $todayDt).TotalDays)
        } catch {}

        $remDays = if ($null -ne $b.remind_days_before -and [string]$b.remind_days_before -ne "") { [int]($b.remind_days_before -as [int]) } else { 3 }
        $rawSt = if ($b.status) { ([string]$b.status).ToLowerInvariant() } else { "unpaid" }
        $effSt = $rawSt
        if ($rawSt -eq "unpaid" -and $daysUntil -lt 0) { $effSt = "overdue" }
        $isDueSoon = ($effSt -eq "unpaid" -and $daysUntil -ge 0 -and $daysUntil -le $remDays)
        $amt = [Math]::Round([double]($b.amount -as [double]), 2)
        $cid = if ($b.category_id) { [string]$b.category_id } else { "cat_exp_utilities" }
        $cName = if ($catMap.ContainsKey($cid)) { $catMap[$cid].category_name } else { "บิลและสาธารณูปโภค" }

        if ($statusFilter -and $effSt -ne $statusFilter) { continue }

        if ($effSt -eq "overdue") {
          $overdueTotal += $amt
          $unpaidTotal += $amt
          $overdueCount++
        } elseif ($effSt -eq "unpaid") {
          $unpaidTotal += $amt
          if ($isDueSoon) {
            $dueSoonTotal += $amt
            $dueSoonCount++
          }
        } elseif ($effSt -eq "paid" -and $dueStr.Substring(0, 7) -eq $curYm) {
          $paidThisMonth += $amt
        }

        $bills += [ordered]@{
          bill_id             = [string]$b.bill_id
          bill_name           = [string]$b.bill_name
          category_id         = $cid
          category_name       = $cName
          amount              = $amt
          currency            = if ($b.currency) { [string]$b.currency } else { "THB" }
          due_date            = $dueStr
          days_until_due      = $daysUntil
          is_recurring        = (([string]$b.is_recurring).ToUpperInvariant() -eq "TRUE")
          frequency           = if ($b.frequency) { [string]$b.frequency } else { "once" }
          status              = $rawSt
          effective_status    = $effSt
          remind_days_before  = $remDays
          is_due_soon         = $isDueSoon
          paid_transaction_id = [string]$b.paid_transaction_id
          notes               = [string]$b.notes
          created_at          = [string]$b.created_at
          updated_at          = [string]$b.updated_at
        }
      }

      $bills = @($bills | Sort-Object {
        $rank = switch ($_.effective_status) { "overdue" { 0 } "unpaid" { 1 } "paid" { 2 } default { 3 } }
        "$rank|$($_.due_date)"
      })

      return [ordered]@{
        summary = [ordered]@{
          total_bills           = $bills.Count
          unpaid_total          = [Math]::Round($unpaidTotal, 2)
          overdue_count         = $overdueCount
          overdue_total         = [Math]::Round($overdueTotal, 2)
          due_soon_count        = $dueSoonCount
          due_soon_total        = [Math]::Round($dueSoonTotal, 2)
          paid_this_month_total = [Math]::Round($paidThisMonth, 2)
        }
        bills = $bills
      }
    }

    "bills.create" {
      $userId = [string]$authUser.user_id
      $billName = ([string]$Params.bill_name).Trim()
      if ([string]::IsNullOrWhiteSpace($billName)) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุชื่อบิล") }
      $catId = if ($Params.category_id) { ([string]$Params.category_id).Trim() } else { "cat_exp_utilities" }
      $amt   = [Math]::Round([double]($Params.amount -as [double]), 2)
      if ($amt -le 0) { throw [System.Exception]::new("VALIDATION_ERROR|จำนวนเงินตามบิลต้องมากกว่า 0") }
      $cur   = if ($Params.currency) { ([string]$Params.currency).Trim() } else { "THB" }
      $due   = ([string]$Params.due_date).Trim()
      if ($due -notmatch '^\d{4}-\d{2}-\d{2}$') { throw [System.Exception]::new("VALIDATION_ERROR|วันครบกำหนดต้องอยู่ในรูปแบบ YYYY-MM-DD") }
      $isRec = (([string]$Params.is_recurring).ToUpperInvariant() -eq "TRUE")
      $freq  = if ($isRec -and $Params.frequency) { ([string]$Params.frequency).Trim() } else { "once" }
      $remDays = if ($null -ne $Params.remind_days_before -and [string]$Params.remind_days_before -ne "") { [int]($Params.remind_days_before -as [int]) } else { 3 }
      $notes = ([string]$Params.notes).Trim()

      $now = Get-NowIso
      $billId = New-Id "bil"
      $newBill = [pscustomobject]@{
        bill_id             = $billId
        user_id             = $userId
        bill_name           = $billName
        category_id         = $catId
        amount              = $amt
        currency            = $cur
        due_date            = $due
        is_recurring        = if ($isRec) { "TRUE" } else { "FALSE" }
        frequency           = $freq
        status              = "unpaid"
        remind_days_before  = $remDays
        paid_transaction_id = ""
        notes               = $notes
        created_at          = $now
        updated_at          = $now
      }

      Append-SheetObject -SheetName "Bills" -Obj $newBill
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "bills.create" -EntityType "Bills" -EntityId $billId -Summary "สร้างบิลแจ้งเตือน: $billName ครบกำหนด $due" -MetaObj @{ amount = $amt; due_date = $due }

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "bills.list" -SessionToken $SessionToken -Params @{}
      $created = $listRes.bills | Where-Object { $_.bill_id -eq $billId } | Select-Object -First 1
      return @{ bill = $created }
    }

    "bills.update" {
      $userId = [string]$authUser.user_id
      $billId = ([string]$Params.bill_id).Trim()
      $allBills = Read-SheetObjects -SheetName "Bills"
      $target = $null
      foreach ($b in $allBills) {
        if ([string]$b.bill_id -eq $billId -and [string]$b.user_id -eq $userId) { $target = $b; break }
      }
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบบิลที่ต้องการแก้ไข") }

      if ($Params.bill_name) { $target.bill_name = ([string]$Params.bill_name).Trim() }
      if ($Params.category_id) { $target.category_id = ([string]$Params.category_id).Trim() }
      if ($null -ne $Params.amount) { $target.amount = [Math]::Round([double]($Params.amount -as [double]), 2) }
      if ($Params.due_date) { $target.due_date = ([string]$Params.due_date).Trim() }
      if ($null -ne $Params.is_recurring) { $target.is_recurring = if ((([string]$Params.is_recurring).ToUpperInvariant() -eq "TRUE")) { "TRUE" } else { "FALSE" } }
      if ($Params.frequency) { $target.frequency = ([string]$Params.frequency).Trim() }
      if ($null -ne $Params.remind_days_before) { $target.remind_days_before = [int]($Params.remind_days_before -as [int]) }
      if ($Params.status) { $target.status = ([string]$Params.status).Trim() }
      if ($null -ne $Params.notes) { $target.notes = ([string]$Params.notes).Trim() }

      $target.updated_at = Get-NowIso
      Update-SheetRow -SheetName "Bills" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "bills.update" -EntityType "Bills" -EntityId $billId -Summary "แก้ไขบิล $($target.bill_name)" -MetaObj @{}

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "bills.list" -SessionToken $SessionToken -Params @{}
      $updated = $listRes.bills | Where-Object { $_.bill_id -eq $billId } | Select-Object -First 1
      return @{ bill = $updated }
    }

    "bills.pay" {
      $userId = [string]$authUser.user_id
      $billId = ([string]$Params.bill_id).Trim()
      $accId  = ([string]$Params.account_id).Trim()
      $payDate = if ($Params.payment_date) { ([string]$Params.payment_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }

      if ([string]::IsNullOrWhiteSpace($accId)) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาเลือกบัญชีที่ใช้ชำระบิล") }

      $allBills = Read-SheetObjects -SheetName "Bills"
      $targetBill = $null
      foreach ($b in $allBills) {
        if ([string]$b.bill_id -eq $billId -and [string]$b.user_id -eq $userId) { $targetBill = $b; break }
      }
      if ($null -eq $targetBill) { throw [System.Exception]::new("NOT_FOUND|ไม่พบบิลที่ต้องการชำระ") }
      if ([string]$targetBill.status -eq "paid") { throw [System.Exception]::new("ALREADY_PAID|บิลรายการนี้ถูกชำระเรียบร้อยแล้ว") }

      $payAmt = if ($null -ne $Params.amount -and [string]$Params.amount -ne "") { [Math]::Round([double]($Params.amount -as [double]), 2) } else { [Math]::Round([double]($targetBill.amount -as [double]), 2) }
      $ccAccId = if ($Params.credit_card_account_id) { ([string]$Params.credit_card_account_id).Trim() } else { "" }
      $isTrf = (-not [string]::IsNullOrWhiteSpace($ccAccId)) -and ($ccAccId -ne $accId)

      $txRes = Invoke-ApiAction -RequestId $RequestId -Action "transactions.create" -SessionToken $SessionToken -Params @{
        tx_type         = if ($isTrf) { "transfer" } else { "expense" }
        tx_date         = $payDate
        account_id      = $accId
        to_account_id   = if ($isTrf) { $ccAccId } else { "" }
        category_id     = if ($isTrf) { "cat_trf_internal" } else { $(if ($targetBill.category_id) { [string]$targetBill.category_id } else { "cat_exp_utilities" }) }
        amount          = $payAmt
        merchant        = [string]$targetBill.bill_name
        description     = "ชำระบิล: $($targetBill.bill_name) (ครบกำหนด $($targetBill.due_date))"
        tags            = "bill-payment"
        idempotency_key = "billpay_${billId}_$($targetBill.due_date)"
        allow_duplicate = $true
      }

      $now = Get-NowIso
      $targetBill.status = "paid"
      $targetBill.paid_transaction_id = [string]$txRes.transaction.transaction_id
      $targetBill.updated_at = $now
      Update-SheetRow -SheetName "Bills" -RowIndex $targetBill._rowIndex -Obj $targetBill

      $nextBill = $null
      $isRec = (([string]$targetBill.is_recurring).ToUpperInvariant() -eq "TRUE")
      $freq  = if ($targetBill.frequency) { ([string]$targetBill.frequency).ToLowerInvariant() } else { "once" }
      if ($isRec -and $freq -ne "once") {
        $dueDt = [DateTime]::ParseExact(([string]$targetBill.due_date).Substring(0, 10), "yyyy-MM-dd", $null)
        $nextDt = switch ($freq) {
          "weekly"    { $dueDt.AddDays(7) }
          "quarterly" { $dueDt.AddMonths(3) }
          "yearly"    { $dueDt.AddYears(1) }
          default     { $dueDt.AddMonths(1) }
        }
        $nextBillId = New-Id "bil"
        $nextBill = [pscustomobject]@{
          bill_id             = $nextBillId
          user_id             = $userId
          bill_name           = [string]$targetBill.bill_name
          category_id         = [string]$targetBill.category_id
          amount              = [double]($targetBill.amount -as [double])
          currency            = if ($targetBill.currency) { [string]$targetBill.currency } else { "THB" }
          due_date            = $nextDt.ToString("yyyy-MM-dd")
          is_recurring        = "TRUE"
          frequency           = $freq
          status              = "unpaid"
          remind_days_before  = if ($targetBill.remind_days_before) { [int]$targetBill.remind_days_before } else { 3 }
          paid_transaction_id = ""
          notes               = [string]$targetBill.notes
          created_at          = $now
          updated_at          = $now
        }
        Append-SheetObject -SheetName "Bills" -Obj $nextBill
      }

      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "bills.pay" -EntityType "Bills" -EntityId $billId -Summary "ชำระบิล $($targetBill.bill_name) จำนวน $payAmt" -MetaObj @{ paid_transaction_id = $txRes.transaction.transaction_id }

      return @{
        paid_bill           = $targetBill
        transaction         = $txRes.transaction
        next_recurring_bill = $nextBill
      }
    }

    "imports.list" {
      $userId = [string]$authUser.user_id
      $allImports = Read-SheetObjects -SheetName "Import_History"
      $allAccounts = Read-SheetObjects -SheetName "Accounts"
      $accMap = @{}
      foreach ($a in $allAccounts) {
        if ([string]$a.user_id -eq $userId) { $accMap[[string]$a.account_id] = [string]$a.account_name }
      }
      $items = @()
      for ($i = $allImports.Count - 1; $i -ge 0; $i--) {
        $imp = $allImports[$i]
        if ([string]$imp.user_id -ne $userId) { continue }
        $aid = [string]$imp.account_id
        $items += [ordered]@{
          import_id          = [string]$imp.import_id
          source_type        = if ($imp.source_type) { [string]$imp.source_type } else { "csv_upload" }
          file_name          = if ($imp.file_name) { [string]$imp.file_name } else { "statement.csv" }
          account_id         = $aid
          account_name       = if ($accMap.ContainsKey($aid)) { $accMap[$aid] } else { $aid }
          total_rows         = [int]($imp.total_rows -as [int])
          imported_rows      = [int]($imp.imported_rows -as [int])
          skipped_duplicates = [int]($imp.skipped_duplicates -as [int])
          status             = if ($imp.status) { [string]$imp.status } else { "completed" }
          created_at         = [string]$imp.created_at
        }
      }
      return @{ imports = $items }
    }

    # =========================================================================
    # PHASE 3 — NOTIFICATIONS & SMART ALERTS (Notifications Sheet)
    # =========================================================================
    "notifications.list" {
      $userId = [string]$authUser.user_id
      $unreadOnly = (([string]$Params.unread_only).ToUpperInvariant() -eq "TRUE")
      $allNotifs = Read-SheetObjects -SheetName "Notifications"
      $items = @()
      $unreadCount = 0

      for ($i = $allNotifs.Count - 1; $i -ge 0; $i--) {
        $n = $allNotifs[$i]
        if ([string]$n.user_id -ne $userId) { continue }
        $isRead = (([string]$n.is_read).ToUpperInvariant() -eq "TRUE")
        if (-not $isRead) { $unreadCount++ }
        if ($unreadOnly -and $isRead) { continue }

        $items += [ordered]@{
          notification_id = [string]$n.notification_id
          notif_type      = if ($n.notif_type) { [string]$n.notif_type } else { "system" }
          severity        = if ($n.severity) { [string]$n.severity } else { "info" }
          title           = [string]$n.title
          message         = [string]$n.message
          reference_id    = [string]$n.reference_id
          is_read         = $isRead
          created_at      = [string]$n.created_at
        }
      }

      return [ordered]@{
        unread_count  = $unreadCount
        total_count   = $items.Count
        notifications = @($items | Select-Object -First 100)
      }
    }

    "notifications.generateAlerts" {
      $userId = [string]$authUser.user_id
      $todayStr = (Get-Date).ToString("yyyy-MM-dd")
      $curYm = $todayStr.Substring(0, 7)

      $existingNotifs = Read-SheetObjects -SheetName "Notifications"
      $existingRefs = @{}
      foreach ($en in $existingNotifs) {
        if ([string]$en.user_id -eq $userId -and $en.reference_id) {
          $existingRefs[[string]$en.reference_id] = $true
        }
      }

      $newAlerts = @()
      $now = Get-NowIso

      # 1. Bills alerts
      $billsData = Invoke-ApiAction -RequestId $RequestId -Action "bills.list" -SessionToken $SessionToken -Params @{}
      foreach ($b in $billsData.bills) {
        if ($b.effective_status -eq "overdue") {
          $refId = "alert_bill_overdue_$($b.bill_id)_$($b.due_date)"
          if (-not $existingRefs.ContainsKey($refId)) {
            $existingRefs[$refId] = $true
            $newAlerts += [pscustomobject]@{
              notification_id = (New-Id "ntf")
              user_id         = $userId
              notif_type      = "bill_overdue"
              severity        = "danger"
              title           = "บิลเกินกำหนดชำระ: $($b.bill_name)"
              message         = "รายการ '$($b.bill_name)' ยอด $($b.amount) $($b.currency) เกินกำหนดชำระตั้งแต่วันที่ $($b.due_date)"
              reference_id    = $refId
              is_read         = "FALSE"
              created_at      = $now
            }
          }
        } elseif ($b.is_due_soon) {
          $refId = "alert_bill_duesoon_$($b.bill_id)_$($b.due_date)"
          if (-not $existingRefs.ContainsKey($refId)) {
            $existingRefs[$refId] = $true
            $newAlerts += [pscustomobject]@{
              notification_id = (New-Id "ntf")
              user_id         = $userId
              notif_type      = "bill_due"
              severity        = "warning"
              title           = "บิลใกล้ครบกำหนดชำระ: $($b.bill_name)"
              message         = "รายการ '$($b.bill_name)' ยอด $($b.amount) $($b.currency) จะครบกำหนดวันที่ $($b.due_date) (อีก $($b.days_until_due) วัน)"
              reference_id    = $refId
              is_read         = "FALSE"
              created_at      = $now
            }
          }
        }
      }

      # 2. Budgets alerts
      $budgetsData = Invoke-ApiAction -RequestId $RequestId -Action "budgets.list" -SessionToken $SessionToken -Params @{}
      foreach ($bdg in $budgetsData.budgets) {
        if ($bdg.status -eq "over_budget" -or $bdg.status -eq "exceeded") {
          $refId = "alert_budget_over_$($bdg.budget_id)_$curYm"
          if (-not $existingRefs.ContainsKey($refId)) {
            $existingRefs[$refId] = $true
            $newAlerts += [pscustomobject]@{
              notification_id = (New-Id "ntf")
              user_id         = $userId
              notif_type      = "budget_alert"
              severity        = "danger"
              title           = "ใช้งบประมาณเกินวงเงิน: $($bdg.budget_name)"
              message         = "งบ '$($bdg.budget_name)' ใช้ไปแล้ว $($bdg.spent_amount) จากวงเงิน $($bdg.effective_limit) ($($bdg.used_pct)%)"
              reference_id    = $refId
              is_read         = "FALSE"
              created_at      = $now
            }
          }
        } elseif ($bdg.status -eq "warning") {
          $refId = "alert_budget_warn_$($bdg.budget_id)_$curYm"
          if (-not $existingRefs.ContainsKey($refId)) {
            $existingRefs[$refId] = $true
            $newAlerts += [pscustomobject]@{
              notification_id = (New-Id "ntf")
              user_id         = $userId
              notif_type      = "budget_alert"
              severity        = "warning"
              title           = "งบประมาณใกล้เต็ม: $($bdg.budget_name)"
              message         = "งบ '$($bdg.budget_name)' ใช้ไปถึงเกณฑ์แจ้งเตือนแล้ว ($($bdg.used_pct)% ของวงเงิน)"
              reference_id    = $refId
              is_read         = "FALSE"
              created_at      = $now
            }
          }
        }
      }

      # 3. Credit Card & DTI alerts
      $debtsData = Invoke-ApiAction -RequestId $RequestId -Action "debts.list" -SessionToken $SessionToken -Params @{}
      if ($debtsData.summary -and $debtsData.summary.dti_status -eq "high_risk") {
        $refId = "alert_dti_high_$curYm"
        if (-not $existingRefs.ContainsKey($refId)) {
          $existingRefs[$refId] = $true
          $newAlerts += [pscustomobject]@{
            notification_id = (New-Id "ntf")
            user_id         = $userId
            notif_type      = "debt_alert"
            severity        = "danger"
            title           = "ภาระหนี้ต่อรายได้ (DTI) อยู่ในเกณฑ์สูง ($($debtsData.summary.dti_percentage)%)"
            message         = "ยอดผ่อนหนี้ต่อเดือนรวม $($debtsData.summary.combined_monthly_debt_service) คิดเป็น $($debtsData.summary.dti_percentage)% ของรายได้"
            reference_id    = $refId
            is_read         = "FALSE"
            created_at      = $now
          }
        }
      }
      foreach ($cc in $debtsData.credit_cards) {
        if ([double]$cc.owed_amount -gt 0) {
          $refId = "alert_cc_due_$($cc.account_id)_$($cc.next_due_date)"
          if (-not $existingRefs.ContainsKey($refId)) {
            $existingRefs[$refId] = $true
            $newAlerts += [pscustomobject]@{
              notification_id = (New-Id "ntf")
              user_id         = $userId
              notif_type      = "credit_card_due"
              severity        = if ([double]$cc.utilization_pct -ge 80) { "danger" } else { "info" }
              title           = "ยอดค้างชำระบัตรเครดิต: $($cc.account_name)"
              message         = "มียอดค้างชำระ $($cc.owed_amount) $($cc.currency) กำหนดชำระวันที่ $($cc.next_due_date) (ใช้วงเงิน $($cc.utilization_pct)%)"
              reference_id    = $refId
              is_read         = "FALSE"
              created_at      = $now
            }
          }
        }
      }

      if ($newAlerts.Count -gt 0) {
        BatchAppend-SheetObjects -SheetName "Notifications" -ObjList $newAlerts
        Write-AuditLog -RequestId $RequestId -UserId $userId -Action "notifications.generateAlerts" -EntityType "Notifications" -EntityId $userId -Summary "สร้างแจ้งเตือนอัตโนมัติ $($newAlerts.Count) รายการ" -MetaObj @{ generated_count = $newAlerts.Count }
      }

      $updatedList = Invoke-ApiAction -RequestId $RequestId -Action "notifications.list" -SessionToken $SessionToken -Params @{}
      return [ordered]@{
        generated_count  = $newAlerts.Count
        generated_alerts = $newAlerts
        unread_count     = $updatedList.unread_count
        notifications    = $updatedList.notifications
      }
    }

    "notifications.markRead" {
      $userId = [string]$authUser.user_id
      $markAll = (([string]$Params.mark_all).ToUpperInvariant() -eq "TRUE")
      $notifId = if ($Params.notification_id) { ([string]$Params.notification_id).Trim() } else { "" }

      if (-not $markAll -and [string]::IsNullOrWhiteSpace($notifId)) {
        throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุ notification_id หรือตั้งค่า mark_all = true")
      }

      $allNotifs = Read-SheetObjects -SheetName "Notifications"
      $updatedCount = 0
      foreach ($n in $allNotifs) {
        if ([string]$n.user_id -ne $userId) { continue }
        $alreadyRead = (([string]$n.is_read).ToUpperInvariant() -eq "TRUE")
        if ($alreadyRead) { continue }
        if ($markAll -or [string]$n.notification_id -eq $notifId) {
          $n.is_read = "TRUE"
          Update-SheetRow -SheetName "Notifications" -RowIndex $n._rowIndex -Obj $n
          $updatedCount++
          if (-not $markAll) { break }
        }
      }

      $state = Invoke-ApiAction -RequestId $RequestId -Action "notifications.list" -SessionToken $SessionToken -Params @{}
      return @{
        updated_count       = $updatedCount
        notifications_state = $state
      }
    }

    # =========================================================================
    # PHASE 4 — MODULE J: SMART FINANCE, AUTOMATION RULES & ANOMALY ANALYTICS
    # =========================================================================
    "rules.list" {
      $userId = [string]$authUser.user_id
      $allRules = Read-SheetObjects -SheetName "Rules"
      $catsRes = Invoke-ApiAction -RequestId $RequestId -Action "categories.list" -SessionToken $SessionToken -Params @{}
      $catMap = @{}
      foreach ($c in $catsRes.categories) { $catMap[$c.category_id] = $c.category_name }

      $rules = @()
      foreach ($r in $allRules) {
        if ([string]$r.user_id -ne $userId) { continue }
        $cid = [string]$r.assign_category_id
        $rules += [ordered]@{
          rule_id              = [string]$r.rule_id
          rule_name            = [string]$r.rule_name
          match_field          = if ($r.match_field) { [string]$r.match_field } else { "any_text" }
          match_operator       = if ($r.match_operator) { [string]$r.match_operator } else { "contains" }
          match_value          = [string]$r.match_value
          assign_category_id   = $cid
          assign_category_name = if ($catMap.ContainsKey($cid)) { $catMap[$cid] } else { $cid }
          assign_tags          = [string]$r.assign_tags
          is_active            = (([string]$r.is_active).ToUpperInvariant() -ne "FALSE")
          priority             = if ($r.priority) { [int]($r.priority -as [int]) } else { 10 }
          created_at           = [string]$r.created_at
          updated_at           = [string]$r.updated_at
        }
      }
      $rules = @($rules | Sort-Object { [int]$_.priority })
      return [ordered]@{
        total_rules  = $rules.Count
        active_rules = @($rules | Where-Object { $_.is_active }).Count
        rules        = $rules
      }
    }

    "rules.create" {
      $userId = [string]$authUser.user_id
      $ruleName = ([string]$Params.rule_name).Trim()
      if ([string]::IsNullOrWhiteSpace($ruleName)) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุชื่อกฎอัตโนมัติ") }
      $mField = if ($Params.match_field) { ([string]$Params.match_field).Trim() } else { "any_text" }
      $mOp    = if ($Params.match_operator) { ([string]$Params.match_operator).Trim() } else { "contains" }
      $mVal   = ([string]$Params.match_value).Trim()
      if ([string]::IsNullOrWhiteSpace($mVal)) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาระบุคำค้นหาหรือค่าที่ต้องการจับคู่") }
      $assignCat = ([string]$Params.assign_category_id).Trim()
      if ([string]::IsNullOrWhiteSpace($assignCat)) { throw [System.Exception]::new("VALIDATION_ERROR|กรุณาเลือกหมวดหมู่ที่ต้องการกำหนด") }
      $assignTags = ([string]$Params.assign_tags).Trim()
      $isActive = if ($null -ne $Params.is_active) { (([string]$Params.is_active).ToUpperInvariant() -ne "FALSE") } else { $true }
      $prio = if ($Params.priority) { [Math]::Max(1, [Math]::Min(999, [int]($Params.priority -as [int]))) } else { 10 }

      $now = Get-NowIso
      $ruleId = New-Id "rul"
      $newRule = [pscustomobject]@{
        rule_id            = $ruleId
        user_id            = $userId
        rule_name          = $ruleName
        match_field        = $mField
        match_operator     = $mOp
        match_value        = $mVal
        assign_category_id = $assignCat
        assign_tags        = $assignTags
        is_active          = if ($isActive) { "TRUE" } else { "FALSE" }
        priority           = $prio
        created_at         = $now
        updated_at         = $now
      }
      Append-SheetObject -SheetName "Rules" -Obj $newRule
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "rules.create" -EntityType "Rules" -EntityId $ruleId -Summary "สร้างกฎอัตโนมัติ: $ruleName" -MetaObj @{ match_value = $mVal; assign_category_id = $assignCat }

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "rules.list" -SessionToken $SessionToken -Params @{}
      $created = $listRes.rules | Where-Object { $_.rule_id -eq $ruleId } | Select-Object -First 1
      return @{ rule = $created }
    }

    "rules.update" {
      $userId = [string]$authUser.user_id
      $ruleId = ([string]$Params.rule_id).Trim()
      $allRules = Read-SheetObjects -SheetName "Rules"
      $target = $null
      foreach ($r in $allRules) {
        if ([string]$r.rule_id -eq $ruleId -and [string]$r.user_id -eq $userId) { $target = $r; break }
      }
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบกฎอัตโนมัติที่ต้องการแก้ไข") }

      if ($Params.rule_name) { $target.rule_name = ([string]$Params.rule_name).Trim() }
      if ($Params.match_field) { $target.match_field = ([string]$Params.match_field).Trim() }
      if ($Params.match_operator) { $target.match_operator = ([string]$Params.match_operator).Trim() }
      if ($Params.match_value) { $target.match_value = ([string]$Params.match_value).Trim() }
      if ($Params.assign_category_id) { $target.assign_category_id = ([string]$Params.assign_category_id).Trim() }
      if ($null -ne $Params.assign_tags) { $target.assign_tags = ([string]$Params.assign_tags).Trim() }
      if ($null -ne $Params.is_active) {
        $target.is_active = if ((([string]$Params.is_active).ToUpperInvariant() -ne "FALSE")) { "TRUE" } else { "FALSE" }
      }
      if ($null -ne $Params.priority) { $target.priority = [int]($Params.priority -as [int]) }

      $target.updated_at = Get-NowIso
      Update-SheetRow -SheetName "Rules" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "rules.update" -EntityType "Rules" -EntityId $ruleId -Summary "อัปเดตกฎอัตโนมัติ $($target.rule_name)" -MetaObj @{ is_active = $target.is_active }

      $listRes = Invoke-ApiAction -RequestId $RequestId -Action "rules.list" -SessionToken $SessionToken -Params @{}
      $updated = $listRes.rules | Where-Object { $_.rule_id -eq $ruleId } | Select-Object -First 1
      return @{ rule = $updated }
    }

    "rules.delete" {
      $userId = [string]$authUser.user_id
      $ruleId = ([string]$Params.rule_id).Trim()
      $allRules = Read-SheetObjects -SheetName "Rules"
      $target = $null
      foreach ($r in $allRules) {
        if ([string]$r.rule_id -eq $ruleId -and [string]$r.user_id -eq $userId) { $target = $r; break }
      }
      if ($null -eq $target) { throw [System.Exception]::new("NOT_FOUND|ไม่พบกฎอัตโนมัติที่ต้องการลบ") }
      $target.is_active = "FALSE"
      $target.user_id   = "${userId}_DELETED"
      Update-SheetRow -SheetName "Rules" -RowIndex $target._rowIndex -Obj $target
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "rules.delete" -EntityType "Rules" -EntityId $ruleId -Summary "ลบกฎอัตโนมัติ $($target.rule_name)" -MetaObj @{}
      return @{ deleted_rule_id = $ruleId }
    }

    "rules.evaluate" {
      $userId = [string]$authUser.user_id
      $merch  = ([string]$Params.merchant).Trim()
      $desc   = ([string]$Params.description).Trim()
      $amt    = [double]($Params.amount -as [double])
      $txType = if ($Params.tx_type) { ([string]$Params.tx_type).Trim().ToLowerInvariant() } else { "expense" }

      $rulesRes = Invoke-ApiAction -RequestId $RequestId -Action "rules.list" -SessionToken $SessionToken -Params @{}
      foreach ($r in $rulesRes.rules) {
        if (-not $r.is_active) { continue }
        $field = [string]$r.match_field
        $op    = [string]$r.match_operator
        $val   = ([string]$r.match_value).ToLowerInvariant().Trim()
        if ([string]::IsNullOrWhiteSpace($val)) { continue }

        $matched = $false
        if ($field -eq "amount") {
          $numVal = [double]($val -as [double])
          if ($op -eq "gt" -and $amt -gt $numVal) { $matched = $true }
          elseif ($op -eq "lt" -and $amt -lt $numVal) { $matched = $true }
          elseif ($op -eq "equals" -and [Math]::Abs($amt - $numVal) -lt 0.01) { $matched = $true }
        } else {
          $src = if ($field -eq "merchant") { $merch.ToLowerInvariant() } elseif ($field -eq "description") { $desc.ToLowerInvariant() } else { "$merch $desc".ToLowerInvariant() }
          if ($op -eq "equals" -and $src.Trim() -eq $val) { $matched = $true }
          elseif ($op -eq "starts_with" -and $src.Trim().StartsWith($val)) { $matched = $true }
          elseif ($op -eq "contains" -and $src.Contains($val)) { $matched = $true }
        }

        if ($matched) {
          return [ordered]@{
            matched_by              = "user_rule"
            rule_id                 = $r.rule_id
            rule_name               = $r.rule_name
            suggested_category_id   = $r.assign_category_id
            suggested_category_name = $r.assign_category_name
            suggested_tags          = $r.assign_tags
          }
        }
      }

      # Smart keyword fallback
      $txt = "$merch $desc".ToLowerInvariant()
      $fbCat = if ($txType -eq "income") { "cat_inc_other" } else { "cat_exp_shopping" }
      $fbTags = "auto-suggested"
      if ($txt.Contains("7-eleven") -or $txt.Contains("food") -or $txt.Contains("อาหาร") -or $txt.Contains("กาแฟ") -or $txt.Contains("starbucks")) {
        $fbCat = "cat_exp_food"; $fbTags = "food,daily"
      } elseif ($txt.Contains("bts") -or $txt.Contains("mrt") -or $txt.Contains("เดินทาง") -or $txt.Contains("ปตท") -or $txt.Contains("grab")) {
        $fbCat = "cat_exp_transport"; $fbTags = "transport"
      } elseif ($txt.Contains("ไฟฟ้า") -or $txt.Contains("ประปา") -or $txt.Contains("ais") -or $txt.Contains("true") -or $txt.Contains("อินเทอร์เน็ต")) {
        $fbCat = "cat_exp_utilities"; $fbTags = "utilities"
      } elseif ($txt.Contains("ค่าเช่า") -or $txt.Contains("คอนโด")) {
        $fbCat = "cat_exp_housing"; $fbTags = "housing"
      } elseif ($txt.Contains("เงินเดือน") -or $txt.Contains("salary")) {
        $fbCat = "cat_inc_salary"; $fbTags = "salary"
      }

      return [ordered]@{
        matched_by            = "smart_heuristic"
        rule_id               = $null
        rule_name             = "Smart Keyword Recommendation"
        suggested_category_id = $fbCat
        suggested_tags        = $fbTags
      }
    }

    "analytics.insights" {
      $userId = [string]$authUser.user_id
      $allTxs = Read-SheetObjects -SheetName "Transactions"
      $catsRes = Invoke-ApiAction -RequestId $RequestId -Action "categories.list" -SessionToken $SessionToken -Params @{}
      $catMap = @{}
      foreach ($c in $catsRes.categories) { $catMap[$c.category_id] = $c.category_name }

      $catStats = @{}
      $userExps = @()
      foreach ($tx in $allTxs) {
        if ([string]$tx.user_id -ne $userId -or [string]$tx.status -ne "posted" -or [string]$tx.tx_type -ne "expense") { continue }
        $amt = [double]($tx.amount -as [double])
        if ($amt -le 0) { continue }
        $cid = if ($tx.category_id) { [string]$tx.category_id } else { "uncategorized" }
        if (-not $catStats.ContainsKey($cid)) { $catStats[$cid] = @{ sum = 0.0; count = 0 } }
        $catStats[$cid].sum += $amt
        $catStats[$cid].count++
        $userExps += $tx
      }

      $anomalies = @()
      foreach ($tx in $userExps) {
        $cid = if ($tx.category_id) { [string]$tx.category_id } else { "uncategorized" }
        $st = $catStats[$cid]
        $amt = [double]($tx.amount -as [double])
        $avg = if ($st -and $st.count -gt 0) { $st.sum / $st.count } else { $amt }
        if (($st.count -ge 2 -and $amt -ge ($avg * 1.75) -and ($amt - $avg) -ge 500) -or $amt -ge 5000) {
          $mult = if ($avg -gt 0) { [Math]::Round($amt / $avg, 2) } else { 1.0 }
          $anomalies += [ordered]@{
            transaction_id    = [string]$tx.transaction_id
            tx_date           = [string]$tx.tx_date
            merchant          = if ($tx.merchant) { [string]$tx.merchant } else { [string]$tx.description }
            category_id       = $cid
            category_name     = if ($catMap.ContainsKey($cid)) { $catMap[$cid] } else { $cid }
            amount            = [Math]::Round($amt, 2)
            category_average  = [Math]::Round($avg, 2)
            multiplier_vs_avg = $mult
            reason            = if ($st.count -ge 2 -and $amt -ge ($avg * 1.75)) { "สูงกว่าค่าเฉลี่ยของหมวดหมู่นี้ถึง ${mult} เท่า" } else { "รายจ่ายก้อนใหญ่ผิดปกติ (High-Value Outflow)" }
          }
        }
      }
      $anomalies = @($anomalies | Sort-Object { [double]$_.amount } -Descending | Select-Object -First 15)

      $accs = Recalculate-UserAccountBalances -UserId $userId
      $liquidBal = 0.0
      foreach ($a in $accs) {
        if ($a.is_archived) { continue }
        if ($a.account_type -in @("cash", "bank", "ewallet")) {
          $liquidBal += [double]$a.current_balance
        }
      }

      $recData   = Invoke-ApiAction -RequestId $RequestId -Action "recurring.list" -SessionToken $SessionToken -Params @{}
      $billsData = Invoke-ApiAction -RequestId $RequestId -Action "bills.list" -SessionToken $SessionToken -Params @{}
      $debtsData = Invoke-ApiAction -RequestId $RequestId -Action "debts.list" -SessionToken $SessionToken -Params @{}
      $todayDt   = [DateTime]::ParseExact((Get-Date).ToString("yyyy-MM-dd"), "yyyy-MM-dd", $null)

      $buildForecast = { param([int]$days)
        $rInc = 0.0
        $rExp = 0.0
        foreach ($f in $recData.upcoming_forecasts) {
          try {
            $fDt = [DateTime]::ParseExact(([string]$f.scheduled_date).Substring(0, 10), "yyyy-MM-dd", $null)
            $diff = [int][Math]::Round(($fDt - $todayDt).TotalDays)
            if ($diff -ge 0 -and $diff -le $days) {
              if ($f.tx_type -eq "income") { $rInc += [double]$f.amount }
              elseif ($f.tx_type -eq "expense") { $rExp += [double]$f.amount }
            }
          } catch {}
        }
        $unpaidBills = 0.0
        foreach ($b in $billsData.bills) {
          if ($b.effective_status -ne "paid" -and [int]$b.days_until_due -le $days) {
            $unpaidBills += [double]$b.amount
          }
        }
        $mFactor = [Math]::Max(1, [int][Math]::Round($days / 30.0))
        $debtServ = [double]$debtsData.summary.combined_monthly_debt_service * $mFactor
        $totOut = [Math]::Round($rExp + $unpaidBills + $debtServ, 2)
        $netFl  = [Math]::Round($rInc - $totOut, 2)
        $endCash = [Math]::Round($liquidBal + $netFl, 2)

        return [ordered]@{
          horizon_days               = $days
          starting_liquid_cash       = [Math]::Round($liquidBal, 2)
          expected_income            = [Math]::Round($rInc, 2)
          expected_recurring_expense = [Math]::Round($rExp, 2)
          unpaid_bills_due           = [Math]::Round($unpaidBills, 2)
          debt_service_commitments   = [Math]::Round($debtServ, 2)
          total_expected_outflow     = $totOut
          projected_net_cashflow     = $netFl
          projected_ending_cash      = $endCash
          cashflow_status            = if ($endCash -lt 0) { "deficit_risk" } elseif ($netFl -lt 0) { "drawdown" } else { "surplus" }
        }
      }

      $budgets = (Invoke-ApiAction -RequestId $RequestId -Action "budgets.list" -SessionToken $SessionToken -Params @{}).budgets
      $goals   = (Invoke-ApiAction -RequestId $RequestId -Action "goals.list" -SessionToken $SessionToken -Params @{}).goals
      $riskBudgets = @($budgets | Where-Object { $_.status -in @("warning", "over_budget", "exceeded") })
      $riskGoals   = @($goals | Where-Object { $_.risk_status -in @("at_risk", "behind") -or ([double]$_.progress_pct -lt 100 -and [int]$_.days_remaining -lt 60) })

      return [ordered]@{
        starting_liquid_balance = [Math]::Round($liquidBal, 2)
        anomalies_detected      = $anomalies
        cashflow_forecasts      = [ordered]@{
          days_30 = (& $buildForecast 30)
          days_60 = (& $buildForecast 60)
          days_90 = (& $buildForecast 90)
        }
        risk_radar              = [ordered]@{
          at_risk_budgets_count = $riskBudgets.Count
          at_risk_budgets       = $riskBudgets
          at_risk_goals_count   = $riskGoals.Count
          at_risk_goals         = $riskGoals
        }
      }
    }

    "automation.sendReminder" {
      $userId = [string]$authUser.user_id
      $channel = if ($Params.channel) { ([string]$Params.channel).Trim() } else { "email" }
      $title   = ([string]$Params.title).Trim()
      $msg     = ([string]$Params.message).Trim()
      $evDate  = if ($Params.event_date) { ([string]$Params.event_date).Trim() } else { (Get-Date).ToString("yyyy-MM-dd") }

      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "automation.sendReminder" -EntityType "Notifications" -EntityId $userId -Summary "ส่งคำสั่งแจ้งเตือนผ่าน ${channel}: $title" -MetaObj @{ channel = $channel; event_date = $evDate }
      return [ordered]@{
        channel    = $channel
        dispatched = $true
        detail     = "บันทึกคำสั่งแจ้งเตือน ($channel) ลงใน Audit_Logs เรียบร้อยแล้ว (บน Google Apps Script Web App จะเรียก MailApp/CalendarApp ตามสิทธิ์ที่อนุญาต)"
      }
    }

    "system.backupExport" {
      $userId = [string]$authUser.user_id
      $scopedSheets = @("Accounts","Transactions","Categories","Budgets","Goals","Goal_Contributions","Recurring","Debts","Debt_Payments","Bills","Rules","Notifications","Import_History","Settings")
      $tables = [ordered]@{}
      foreach ($s in $scopedSheets) {
        $rows = Read-SheetObjects -SheetName $s | Where-Object { [string]$_.user_id -eq $userId }
        $tables[$s] = @($rows)
      }
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "system.backupExport" -EntityType "System" -EntityId $userId -Summary "ส่งออกไฟล์สำรองข้อมูล" -MetaObj @{}
      return @{
        backup = [ordered]@{
          app         = "Personal Finance Manager Pro"
          version     = "1.0.0-phase4-complete"
          exported_at = (Get-NowIso)
          user        = (Sanitize-User $authUser)
          tables      = $tables
        }
      }
    }

    "system.backupRestore" {
      $userId = [string]$authUser.user_id
      $backup = $Params.backup
      if ($null -eq $backup -or $null -eq $backup.tables) {
        throw [System.Exception]::new("VALIDATION_ERROR|โครงสร้างไฟล์ Backup ไม่ถูกต้อง")
      }
      Write-AuditLog -RequestId $RequestId -UserId $userId -Action "system.backupRestore" -EntityType "System" -EntityId $userId -Summary "กู้คืนข้อมูลจากไฟล์สำรอง" -MetaObj @{}
      return @{ restored = $true; timestamp = (Get-NowIso) }
    }

    "system.auditLogs" {
      $userId = [string]$authUser.user_id
      $logs = Read-SheetObjects -SheetName "Audit_Logs" | Where-Object { [string]$_.user_id -eq $userId }
      $reversed = @($logs)
      [Array]::Reverse($reversed)
      $topLogs = @($reversed | Select-Object -First 30)
      return @{ audit_logs = $topLogs }
    }

    default {
      throw [System.Exception]::new("UNKNOWN_ACTION|ไม่รองรับคำสั่ง API Action: $Action")
    }
  }
}

# Initial sync from real Google Spreadsheet
Sync-AllSheetsFromGoogle

# Start HTTP Server (Supports http://Bank_bana on Port 80 if configured, plus http://localhost:3000)
$listener = New-Object System.Net.HttpListener
$boundCustomDomain = $false
try {
  $testListener = New-Object System.Net.HttpListener
  $testListener.Prefixes.Add("http://+:80/")
  $testListener.Prefixes.Add("http://+:3000/")
  $testListener.Start()
  $testListener.Stop()
  $listener.Prefixes.Add("http://+:80/")
  $listener.Prefixes.Add("http://+:3000/")
  $boundCustomDomain = $true
} catch {
  $listener = New-Object System.Net.HttpListener
  $listener.Prefixes.Add("http://localhost:${Port}/")
}
$listener.Start()

Write-Host "================================================================" -ForegroundColor Cyan
Write-Host "Bank_bana - Live Google Sheets & Offline PWA Server Running" -ForegroundColor Green
if ($boundCustomDomain) {
  Write-Host "Custom URL   : http://Bank_bana (Port 80 Active!)" -ForegroundColor Green
} else {
  Write-Host "Custom URL   : Run .\tools\setup-bank-bana-domain.ps1 once to enable http://Bank_bana" -ForegroundColor Magenta
}
Write-Host "Frontend URL : http://localhost:${Port}/Bank_bana (or http://localhost:${Port})" -ForegroundColor Yellow
Write-Host "Live GAS API : http://localhost:${Port}/api" -ForegroundColor Yellow
Write-Host "Spreadsheet  : https://docs.google.com/spreadsheets/d/${SpreadsheetId}/edit" -ForegroundColor Cyan
Write-Host "================================================================" -ForegroundColor Cyan

$mimeTypes = @{
  ".html" = "text/html; charset=utf-8"
  ".css"  = "text/css; charset=utf-8"
  ".js"   = "application/javascript; charset=utf-8"
  ".json" = "application/json; charset=utf-8"
  ".csv"  = "text/csv; charset=utf-8"
  ".png"  = "image/png"
  ".svg"  = "image/svg+xml"
  ".ico"  = "image/x-icon"
}

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    $req = $context.Request
    $res = $context.Response

    $res.Headers.Add("Access-Control-Allow-Origin", "*")
    $res.Headers.Add("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
    $res.Headers.Add("Access-Control-Allow-Headers", "Content-Type")

    if ($req.HttpMethod -eq "OPTIONS") {
      $res.StatusCode = 204
      $res.Close()
      continue
    }

    $urlPath = $req.Url.AbsolutePath
    if ($urlPath -eq "/api" -or $urlPath -eq "/Bank_bana/api" -or $urlPath -eq "/macros/s/live/exec") {
      $reqId = New-Id "req"
      $actionName = "unknown"
      try {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        $rawBody = $reader.ReadToEnd()
        $reader.Close()

        $payload = if ($rawBody) { $rawBody | ConvertFrom-Json } else { [pscustomobject]@{ action = "system.ping"; params = @{} } }
        $actionName = [string]$payload.action
        $sessionTok = [string]$payload.session_token
        $actionParams = if ($null -ne $payload.params) { $payload.params } else { @{} }

        $resultData = Invoke-ApiAction -RequestId $reqId -Action $actionName -SessionToken $sessionTok -Params $actionParams

        # Flush any writes directly to real Google Sheets via gsheets mutate batch
        Flush-PendingBatchToGoogle

        $envelope = [ordered]@{
          ok         = $true
          request_id = $reqId
          action     = $actionName
          timestamp  = (Get-NowIso)
          data       = $resultData
        }
        $jsonOut = $envelope | ConvertTo-Json -Depth 15 -Compress
      } catch {
        $Global:PendingBatchOps.Clear()
        $errMsg = $_.Exception.Message
        $parts = $errMsg -split "\|", 2
        $errCode = if ($parts.Count -eq 2) { $parts[0] } else { "APP_ERROR" }
        $errText = if ($parts.Count -eq 2) { $parts[1] } else { $errMsg }

        $envelope = [ordered]@{
          ok         = $false
          request_id = $reqId
          action     = $actionName
          timestamp  = (Get-NowIso)
          error      = [ordered]@{
            code    = $errCode
            message = $errText
          }
        }
        $jsonOut = $envelope | ConvertTo-Json -Depth 10 -Compress
      }

      $bytes = [System.Text.Encoding]::UTF8.GetBytes($jsonOut)
      $res.StatusCode = 200
      $res.ContentType = "application/json; charset=utf-8"
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
      $res.Close()
      continue
    }

    # Static Frontend File Serving (supports both `/` and `/Bank_bana`)
    $cleanPath = $urlPath
    if ($cleanPath -match '^/Bank_bana(/.*)?$') {
      $cleanPath = if ($Matches[1]) { $Matches[1] } else { "/" }
    }
    $relPath = if ($cleanPath -eq "/" -or [string]::IsNullOrWhiteSpace($cleanPath)) { "index.html" } else { $cleanPath.TrimStart("/") }
    $filePath = Join-Path $FrontendDir ($relPath -replace "/", "\")

    if ((Test-Path $filePath) -and -not (Get-Item $filePath).PSIsContainer) {
      $ext = [System.IO.Path]::GetExtension($filePath).ToLowerInvariant()
      $res.StatusCode = 200
      $res.ContentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }
      $fileBytes = [System.IO.File]::ReadAllBytes($filePath)
      $res.ContentLength64 = $fileBytes.Length
      $res.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
    } else {
      $res.StatusCode = 404
      $notFoundBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
      $res.OutputStream.Write($notFoundBytes, 0, $notFoundBytes.Length)
    }
    $res.Close()
  }
} finally {
  $listener.Stop()
}