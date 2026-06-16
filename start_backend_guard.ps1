$ErrorActionPreference = "SilentlyContinue"

$BackendDir = "C:\Users\shink\Desktop\AVITOLOG-CLAUDE\backend"
$NodeExe = "C:\Users\shink\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.14.1-win-x64\node.exe"
$FallbackNodeExe = "C:\Users\shink\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$HealthUrl = "http://localhost:8787/api/health"
$LogDir = "C:\Users\shink\Desktop\AVITOLOG-CLAUDE\backend"
$LogPath = Join-Path $LogDir "backend-autostart.log"

function Write-BackendLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogPath -Value "$stamp $Message" -Encoding UTF8
}

function Test-BackendHealth {
  try {
    $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
    return [int]$res.StatusCode -eq 200
  } catch {
    return $false
  }
}

Start-Sleep -Seconds 12

if (Test-BackendHealth) {
  Write-BackendLog "Backend already running."
  exit 0
}

$node = $NodeExe
if (-not (Test-Path -LiteralPath $node)) {
  $node = $FallbackNodeExe
}

if (-not (Test-Path -LiteralPath $node)) {
  Write-BackendLog "ERROR node.exe not found."
  exit 1
}

if (-not (Test-Path -LiteralPath (Join-Path $BackendDir "server.js"))) {
  Write-BackendLog "ERROR server.js not found."
  exit 1
}

Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $BackendDir -WindowStyle Hidden
Start-Sleep -Seconds 4

if (Test-BackendHealth) {
  Write-BackendLog "Backend started successfully."
  exit 0
}

Write-BackendLog "ERROR backend did not respond after start."
exit 1
