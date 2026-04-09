param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroupName,

  [Parameter(Mandatory = $true)]
  [string]$StorageAccountName,

  [string]$Location = "eastus",
  [string]$SubscriptionId,
  [switch]$SkipBuild
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Require-Command {
  param([string]$CommandName)
  if (-not (Get-Command $CommandName -ErrorAction SilentlyContinue)) {
    throw "Required command '$CommandName' was not found on PATH."
  }
}

function Invoke-Az {
  param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$Args
  )

  $output = & az @Args
  if ($LASTEXITCODE -ne 0) {
    throw "Azure CLI command failed: az $($Args -join ' ')"
  }
  return $output
}

if ($StorageAccountName -notmatch '^[a-z0-9]{3,24}$') {
  throw "StorageAccountName must be 3-24 chars and contain only lowercase letters and numbers."
}

Require-Command -CommandName "az"
if (-not $SkipBuild) {
  Require-Command -CommandName "npm"
}

Write-Host "Checking Azure login..."
try {
  Invoke-Az account show --output none | Out-Null
} catch {
  throw "You are not logged in to Azure CLI. Run 'az login' and try again."
}

if ($SubscriptionId) {
  Write-Host "Selecting subscription $SubscriptionId..."
  Invoke-Az account set --subscription $SubscriptionId | Out-Null
}

if (-not $SkipBuild) {
  Write-Host "Building frontend..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed. Fix the build errors and retry deployment."
  }
}

$distPath = Join-Path $PSScriptRoot "..\dist"
if (-not (Test-Path $distPath)) {
  throw "Build output folder not found: $distPath"
}

Write-Host "Ensuring resource group exists..."
$rgExists = (Invoke-Az group exists --name $ResourceGroupName).Trim()
if ($rgExists -ne "true") {
  Invoke-Az group create --name $ResourceGroupName --location $Location --output none | Out-Null
}

Write-Host "Ensuring storage account exists..."
$storageExists = $true
try {
  Invoke-Az storage account show --name $StorageAccountName --resource-group $ResourceGroupName --output none | Out-Null
} catch {
  $storageExists = $false
}

if (-not $storageExists) {
  Invoke-Az storage account create --name $StorageAccountName --resource-group $ResourceGroupName --location $Location --sku Standard_LRS --kind StorageV2 --https-only true --allow-blob-public-access true --output none | Out-Null
}

Write-Host "Configuring static website hosting..."
Invoke-Az storage blob service-properties update --account-name $StorageAccountName --static-website --index-document index.html --404-document index.html --auth-mode login --output none | Out-Null

Write-Host "Getting storage key..."
$accountKey = (Invoke-Az storage account keys list --resource-group $ResourceGroupName --account-name $StorageAccountName --query "[0].value" --output tsv).Trim()

Write-Host "Cleaning previous website files..."
Invoke-Az storage blob delete-batch --account-name $StorageAccountName --account-key $accountKey --source '$web' --pattern '*' --output none | Out-Null

Write-Host "Uploading new build artifacts..."
Invoke-Az storage blob upload-batch --account-name $StorageAccountName --account-key $accountKey --destination '$web' --source $distPath --overwrite --output none | Out-Null

$websiteEndpoint = (Invoke-Az storage account show --name $StorageAccountName --resource-group $ResourceGroupName --query "primaryEndpoints.web" --output tsv).Trim()

Write-Host ""
Write-Host "Deployment complete"
Write-Host "Website URL: $websiteEndpoint"