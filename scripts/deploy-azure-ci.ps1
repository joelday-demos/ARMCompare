param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroupName,

  [Parameter(Mandatory = $true)]
  [string]$StorageAccountName,

  [string]$Location = "eastus",
  [ValidateSet("arm", "bicep")]
  [string]$TemplateType = "arm",
  [string]$TemplateFile,
  [switch]$SkipBuild,
  [switch]$SkipTemplateGeneration
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

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$distPath = Join-Path $repoRoot "dist"

if ([string]::IsNullOrWhiteSpace($TemplateFile)) {
  if ($TemplateType -eq "bicep") {
    $TemplateFile = "infra/bicep/azure-static-website.bicep"
  } else {
    $TemplateFile = "infra/arm/azure-static-website.template.json"
  }
}

$templatePath = Join-Path $repoRoot $TemplateFile

Require-Command -CommandName "az"
if (-not $SkipBuild) {
  Require-Command -CommandName "npm"
}

if ($TemplateType -eq "bicep") {
  Write-Host "Ensuring Bicep CLI is available..."
  Invoke-Az bicep install --only-show-errors | Out-Null
}

if ($TemplateType -eq "arm" -and -not $SkipTemplateGeneration -and -not (Test-Path $templatePath)) {
  Write-Host "Template not found, generating ARM template..."
  & (Join-Path $PSScriptRoot "generate-arm-template.ps1")
  if ($LASTEXITCODE -ne 0) {
    throw "Failed to generate ARM template."
  }
}

if (-not (Test-Path $templatePath)) {
  throw "Template file not found: $templatePath"
}

if (-not $SkipBuild) {
  Write-Host "Building frontend..."
  npm run build
  if ($LASTEXITCODE -ne 0) {
    throw "Build failed. Fix build errors and retry deployment."
  }
}

if (-not (Test-Path $distPath)) {
  throw "Build output folder not found: $distPath"
}

Write-Host "Ensuring resource group exists..."
$rgExists = (Invoke-Az group exists --name $ResourceGroupName).Trim()
if ($rgExists -ne "true") {
  Invoke-Az group create --name $ResourceGroupName --location $Location --output none | Out-Null
}

Write-Host "Deploying $TemplateType template..."
Invoke-Az deployment group create --resource-group $ResourceGroupName --name "armcompare-static-site" --template-file $templatePath --parameters storageAccountName=$StorageAccountName location=$Location --output none | Out-Null

Write-Host "Enabling static website endpoint..."
Invoke-Az storage blob service-properties update --account-name $StorageAccountName --static-website --index-document index.html --404-document index.html --auth-mode login --output none | Out-Null

Write-Host "Getting storage key..."
$accountKey = (Invoke-Az storage account keys list --resource-group $ResourceGroupName --account-name $StorageAccountName --query "[0].value" --output tsv).Trim()

Write-Host "Uploading static web assets..."
Invoke-Az storage blob upload-batch --account-name $StorageAccountName --account-key $accountKey --destination '$web' --source $distPath --overwrite --output none | Out-Null

$websiteEndpoint = (Invoke-Az storage account show --name $StorageAccountName --resource-group $ResourceGroupName --query "primaryEndpoints.web" --output tsv).Trim()
Write-Host "Deployment complete"
Write-Host "Website URL: $websiteEndpoint"
