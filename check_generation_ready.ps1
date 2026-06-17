$ErrorActionPreference = "SilentlyContinue"

$BackendDir = "C:\Users\shink\Desktop\AVITOLOG-CLAUDE\backend"
$NodeExe = "C:\Users\shink\AppData\Local\Microsoft\WinGet\Packages\OpenJS.NodeJS.LTS_Microsoft.Winget.Source_8wekyb3d8bbwe\node-v24.14.1-win-x64\node.exe"
$FallbackNodeExe = "C:\Users\shink\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe"
$HealthUrl = "http://localhost:8787/api/health"
$LlmUrl = "http://localhost:8787/api/llm/anthropic"

function Test-Health {
  try {
    $res = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 4
    return [int]$res.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Start-BackendOnce {
  $node = if (Test-Path -LiteralPath $NodeExe) { $NodeExe } elseif (Test-Path -LiteralPath $FallbackNodeExe) { $FallbackNodeExe } else { "" }
  if (-not $node) { Write-Host "FAIL node.exe not found"; return }
  Start-Process -FilePath $node -ArgumentList "server.js" -WorkingDirectory $BackendDir -WindowStyle Hidden
  Start-Sleep -Seconds 5
}

if (-not (Test-Health)) {
  Write-Host "Backend is down. Starting..."
  Start-BackendOnce
}

if (Test-Health) {
  Write-Host "OK backend health: $HealthUrl"
} else {
  Write-Host "FAIL backend health: $HealthUrl"
  exit 1
}

try {
  Invoke-WebRequest -Uri $LlmUrl -Method POST -ContentType "application/json" -Body '{"apiKey":"test","prompt":"ping","maxTokens":16,"model":"claude-3-5-sonnet-20241022"}' -UseBasicParsing -TimeoutSec 15 | Out-Null
  Write-Host "WARN llm route accepted test key unexpectedly"
} catch {
  $msg = $_.Exception.Message
  if ($msg -match "401|invalid x-api-key|Unauthorized") {
    Write-Host "OK llm route responds: $LlmUrl"
    exit 0
  }
  Write-Host "FAIL llm route: $msg"
  exit 1
}