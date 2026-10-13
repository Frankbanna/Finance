# ==============================================================================
# SETUP CUSTOM LOCAL DOMAIN: http://Bank_bana (and http://bank-bana.local)
# ==============================================================================
# Adds 127.0.0.1 Bank_bana to C:\Windows\System32\drivers\etc\hosts
# Reserves HTTP Listener URL ACLs for port 80 and port 3000 so the live server
# can answer directly at http://Bank_bana without needing a port number.
# ==============================================================================

$isAdmin = ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
if (-not $isAdmin) {
  Start-Process powershell.exe -Verb RunAs -ArgumentList "-NoProfile -ExecutionPolicy Bypass -File `"$PSCommandPath`"" -Wait
  exit
}

$hostsPath = "$env:windir\System32\drivers\etc\hosts"
$hostsContent = Get-Content $hostsPath -Raw -ErrorAction SilentlyContinue
if ($hostsContent -notmatch "(?m)^\s*127\.0\.0\.1\s+Bank_bana\b") {
  Add-Content -Path $hostsPath -Value "`r`n127.0.0.1 Bank_bana bank-bana.local" -Encoding ASCII
}

# Reserve URL ACLs for current user on Port 80 and Port 3000
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
cmd /c "netsh http delete urlacl url=http://+:80/ >nul 2>&1"
cmd /c "netsh http add urlacl url=http://+:80/ user=`"$currentUser`""
cmd /c "netsh http delete urlacl url=http://+:3000/ >nul 2>&1"
cmd /c "netsh http add urlacl url=http://+:3000/ user=`"$currentUser`""

ipconfig /flushdns | Out-Null
Write-Host "Successfully configured http://Bank_bana !" -ForegroundColor Green

