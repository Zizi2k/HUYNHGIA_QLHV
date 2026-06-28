param(
  [Parameter(Mandatory = $true)][string]$DbHost,
  [Parameter(Mandatory = $true)][string]$DbPort,
  [Parameter(Mandatory = $true)][string]$DbUser,
  [Parameter(Mandatory = $true)][string]$DbPassword,
  [Parameter(Mandatory = $true)][string]$DbName
)

$envPath = Join-Path $PSScriptRoot "..\backend\.env.railway"
@"
DB_HOST=$DbHost
DB_PORT=$DbPort
DB_USER=$DbUser
DB_PASSWORD=$DbPassword
DB_NAME=$DbName
"@ | Set-Content -Path $envPath -Encoding UTF8

Write-Host "Da luu $envPath"
Set-Location (Join-Path $PSScriptRoot "..\backend")
node scripts/import-schema.js --env .env.railway --fresh
