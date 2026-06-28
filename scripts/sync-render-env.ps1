# Dong bo bien moi truong tu backend/.env.railway len Render
# Cach 1 (tu dong): dat RENDER_API_KEY va RENDER_SERVICE_ID trong backend/.env.railway
# Cach 2 (thu cong): chay script de in danh sach bien can dan vao Render Dashboard

param(
  [switch]$Apply
)

$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$envFile = Join-Path $root 'backend\.env.railway'

if (-not (Test-Path $envFile)) {
  Write-Error "Khong tim thay $envFile"
}

$vars = @{}
Get-Content $envFile | ForEach-Object {
  if ($_ -match '^\s*#' -or $_ -notmatch '=') { return }
  $k, $v = $_ -split '=', 2
  $vars[$k.Trim()] = $v.Trim()
}

$renderVars = [ordered]@{
  PORT           = '5000'
  DB_HOST        = $vars.DB_HOST
  DB_PORT        = $vars.DB_PORT
  DB_USER        = $vars.DB_USER
  DB_PASSWORD    = $vars.DB_PASSWORD
  DB_NAME        = $vars.DB_NAME
  JWT_SECRET     = if ($vars.JWT_SECRET) { $vars.JWT_SECRET } else { 'HuynhGia_Prod_2026_SecretKey_ChangeMe' }
  JWT_EXPIRES_IN = if ($vars.JWT_EXPIRES_IN) { $vars.JWT_EXPIRES_IN } else { '7d' }
}

Write-Host "=== Bien moi truong can cap nhat tren Render (service huynhgia-api) ===" -ForegroundColor Cyan
foreach ($entry in $renderVars.GetEnumerator()) {
  $display = if ($entry.Key -eq 'DB_PASSWORD' -or $entry.Key -eq 'JWT_SECRET') { '********' } else { $entry.Value }
  Write-Host ("{0} = {1}" -f $entry.Key, $display)
}

$apiKey = $vars.RENDER_API_KEY
$serviceId = $vars.RENDER_SERVICE_ID

if (-not $Apply) {
  Write-Host ""
  Write-Host "Huong dan thu cong:" -ForegroundColor Yellow
  Write-Host "1. Vao https://dashboard.render.com -> huynhgia-api -> Environment"
  Write-Host "2. Cap nhat tung bien o tren (copy tu backend/.env.railway)"
  Write-Host "3. Save Changes -> Manual Deploy"
  Write-Host ""
  Write-Host "Hoac them RENDER_API_KEY + RENDER_SERVICE_ID vao .env.railway roi chay:" -ForegroundColor Yellow
  Write-Host "  powershell -ExecutionPolicy Bypass -File scripts/sync-render-env.ps1 -Apply"
  exit 0
}

if (-not $apiKey -or -not $serviceId) {
  Write-Error "Can RENDER_API_KEY va RENDER_SERVICE_ID trong backend/.env.railway de tu dong cap nhat"
}

$headers = @{
  Authorization = "Bearer $apiKey"
  'Content-Type' = 'application/json'
}

foreach ($entry in $renderVars.GetEnumerator()) {
  $body = @{ value = $entry.Value } | ConvertTo-Json
  $url = "https://api.render.com/v1/services/$serviceId/env-vars/$($entry.Key)"
  try {
    Invoke-RestMethod -Uri $url -Method Put -Headers $headers -Body $body | Out-Null
    Write-Host "OK $($entry.Key)" -ForegroundColor Green
  } catch {
    # Tao moi neu chua co
    $createUrl = "https://api.render.com/v1/services/$serviceId/env-vars"
    $createBody = @{ key = $entry.Key; value = $entry.Value } | ConvertTo-Json
    Invoke-RestMethod -Uri $createUrl -Method Post -Headers $headers -Body $createBody | Out-Null
    Write-Host "Created $($entry.Key)" -ForegroundColor Green
  }
}

Write-Host ""
Write-Host "Da cap nhat bien moi truong. Vao Render -> Manual Deploy de ap dung." -ForegroundColor Green
