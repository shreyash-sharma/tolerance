# Run Tolerance on this computer the way it will run in production: backend on 48410, built web app on 3000.
# Usage (PowerShell, from this folder):   .\run_local.ps1          start everything
#                                         .\run_local.ps1 -Stop    stop everything
#                                         .\run_local.ps1 -Rebuild rebuild the web app first
param([switch]$Stop, [switch]$Rebuild)
$root = $PSScriptRoot
function Stop-Tolerance {
  Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -like '*uvicorn*server.app*' -or ($_.CommandLine -like '*next*' -and $_.CommandLine -like '*Tolerance*') -or $_.CommandLine -like '*probe.agent*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}
Stop-Tolerance
if ($Stop) { Write-Host "Stopped."; return }
Start-Sleep 2
if ($Rebuild -or -not (Test-Path "$root\web\.next\BUILD_ID")) { Write-Host "Building the web app (about 2 minutes)..."; Push-Location "$root\web"; npx.cmd next build; Pop-Location }
Start-Process -FilePath "$root\.venv\Scripts\python.exe" -ArgumentList "-m","uvicorn","server.app:app","--port","48410" -WorkingDirectory $root -WindowStyle Hidden -RedirectStandardError "$root\data\uvicorn.err" -RedirectStandardOutput "$root\data\uvicorn.out"
Start-Process -FilePath "npx.cmd" -ArgumentList "next","start","-p","3000" -WorkingDirectory "$root\web" -WindowStyle Hidden -RedirectStandardOutput "$root\data\web-prod.log" -RedirectStandardError "$root\data\web-prod.err"
Write-Host "Starting. The backend needs about 30 seconds. Then open http://localhost:3000"
for ($i = 0; $i -lt 60; $i++) { Start-Sleep 2; try { if ((Invoke-WebRequest "http://localhost:3000/api/jig/agents" -UseBasicParsing -TimeoutSec 5).StatusCode -eq 200) { Write-Host "Ready: http://localhost:3000  (deck: http://localhost:3000/deck)"; return } } catch {} }
Write-Host "Not ready after 2 minutes. Check data\uvicorn.err and data\web-prod.err"
