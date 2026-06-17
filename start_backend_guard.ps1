$ErrorActionPreference = "SilentlyContinue"

$BackendDir = "C:\Users\shink\Desktop\AVITOLOG-CLAUDE\backend"
$NodeExe = "C:\Users\shink\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.14.1-win-x64\node.exe"
$FallbackNodeExe = "C:\Users\shink\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$HealthUrl = "http://localhost:8787/api/health"
$LogPath = Join-Path $BackendDir "backend-autostart.log"
$CheckEverySeconds = 30

$mutex = New-Object System.Threading.Mutex($false, "Global\AVITOLOG_BACKEND_GUARD")
if (-not $mutex.WaitOne(0, $false)) {
  exit 0
}

function Write-BackendLog {
  param([string]$Message)
  $stamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
  Add-Content -LiteralPath $LogPath -Value "$stamp $Message" -Encoding UTF8
}

function Get-NodePath {
  if (Test-Path -LiteralPath $NodeExe) { return $NodeExe }
  if (Test-Path -LiteralPath $FallbackNodeExe) { return $FallbackNodeExe }
  return ""
}

function Test-BackendHealth {
  try {
    $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 4
    return [int]$res.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-AvitologBackend {
  $node = Get-NodePath
  if (-not $node) {
    Write-BackendLog "ERROR node.exe not found."
    return $false
  }
  if (-not (Test-Path -LiteralPath (Join-Path $BackendDir "server.js"))) {
    Write-BackendLog "ERROR server.js not found."
    return $false
  }
  Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $BackendDir -WindowStyle Hidden
  Start-Sleep -Seconds 5
  if (Test-BackendHealth) {
    Write-BackendLog "Backend started successfully."
    return $true
  }
  Write-BackendLog "ERROR backend did not respond after start."
  return $false
}

try {
  Start-Sleep -Seconds 8
  Write-BackendLog "Backend guard started."
  while ($true) {
    if (-not (Test-BackendHealth)) {
      Write-BackendLog "Backend health failed. Starting backend..."
      Start-AvitologBackend | Out-Null
    }
    Start-Sleep -Seconds $CheckEverySeconds
  }
} finally {
  try { $mutex.ReleaseMutex() | Out-Null } catch {}
  try { $mutex.Dispose() } catch {}
}
