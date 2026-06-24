# Huong dan day project len GitHub
# 1. Tao repo trong: https://github.com/new
#    - Ten: digital-bridge-for-you (hoac ten khac)
#    - KHONG tich "Add README" (repo trong)
# 2. Chay script nay voi ten GitHub cua ban:
#    powershell -ExecutionPolicy Bypass -File scripts/push-github.ps1 -GitHubUser YOUR_USERNAME

param(
  [Parameter(Mandatory = $true)]
  [string]$GitHubUser,
  [string]$RepoName = 'digital-bridge-for-you'
)

$safeDir = 'D:/digital_bridge_for_you'
$git = { param($args) & git -c "safe.directory=$safeDir" @args }

$remoteUrl = "https://github.com/$GitHubUser/$RepoName.git"

& git -c "safe.directory=$safeDir" -C $PSScriptRoot\.. remote remove origin 2>$null
& git -c "safe.directory=$safeDir" -C $PSScriptRoot\.. remote add origin $remoteUrl

Write-Host "Dang day len $remoteUrl ..."
& git -c "safe.directory=$safeDir" -C $PSScriptRoot\.. push -u origin main

if ($LASTEXITCODE -eq 0) {
  Write-Host "Thanh cong! Repo: https://github.com/$GitHubUser/$RepoName"
} else {
  Write-Host "Loi khi push. Kiem tra da dang nhap GitHub (Git Credential Manager) hoac dung Personal Access Token."
}
