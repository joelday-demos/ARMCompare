param(
  [Parameter(Mandatory = $true)]
  [string]$ResourceGroupName,

  [string]$Location = "eastus",

  [ValidateSet("P0v3", "P1v3")]
  [string]$SkuName = "P0v3",

  [string]$AppServicePlanName,
  [string]$WebAppName,
  [string]$SubscriptionId,

  [switch]$CreateResourceGroup,
  [switch]$SkipWhatIf,

  # Use this switch only when you intentionally want to perform the real deployment.
  [switch]$Deploy
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

Require-Command -CommandName "az"

Write-Host "Checking Azure login..."
try {
  Invoke-Az account show --output none | Out-Null
} catch {
  throw "You are not logged in to Azure CLI. Run 'az login' and retry."
}

if ($SubscriptionId) {
  Write-Host "Selecting subscription $SubscriptionId..."
  Invoke-Az account set --subscription $SubscriptionId | Out-Null
}

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$templatePath = Resolve-Path (Join-Path $repoRoot "infra\main.bicep")

$rgExists = (Invoke-Az group exists --name $ResourceGroupName).Trim()
if ($rgExists -ne "true") {
  if ($CreateResourceGroup) {
    Write-Host "Creating resource group '$ResourceGroupName' in '$Location'..."
    Invoke-Az group create --name $ResourceGroupName --location $Location --output none | Out-Null
  } else {
    throw "Resource group '$ResourceGroupName' does not exist. Re-run with -CreateResourceGroup to create it."
  }
}

$deploymentName = "armcompare-test-$(Get-Date -Format 'yyyyMMdd-HHmmss')"
$deploymentParameters = @(
  "location=$Location"
  "skuName=$SkuName"
)

if (-not [string]::IsNullOrWhiteSpace($AppServicePlanName)) {
  $deploymentParameters += "appServicePlanName=$AppServicePlanName"
}

if (-not [string]::IsNullOrWhiteSpace($WebAppName)) {
  $deploymentParameters += "webAppName=$WebAppName"
}

Write-Host "Validating deployment template..."
$validateArgs = @(
  'deployment'
  'group'
  'validate'
  '--resource-group'
  $ResourceGroupName
  '--name'
  "$deploymentName-validate"
  '--template-file'
  $templatePath
  '--parameters'
)
$validateArgs += $deploymentParameters
$validateArgs += @(
  '--output'
  'none'
)

Invoke-Az @validateArgs | Out-Null
Write-Host "Validation passed."

if (-not $SkipWhatIf) {
  Write-Host "Running what-if preview..."
  $whatIfArgs = @(
    'deployment'
    'group'
    'what-if'
    '--resource-group'
    $ResourceGroupName
    '--name'
    "$deploymentName-whatif"
    '--template-file'
    $templatePath
    '--parameters'
  )
  $whatIfArgs += $deploymentParameters
  $whatIfArgs += @(
    '--result-format'
    'FullResourcePayloads'
    '--output'
    'table'
  )

  Invoke-Az @whatIfArgs
}

if ($Deploy) {
  Write-Host "Executing deployment..."
  $createArgs = @(
    'deployment'
    'group'
    'create'
    '--resource-group'
    $ResourceGroupName
    '--name'
    $deploymentName
    '--template-file'
    $templatePath
    '--parameters'
  )
  $createArgs += $deploymentParameters
  $createArgs += @(
    '--output'
    'json'
  )

  $resultJson = Invoke-Az @createArgs

  $result = $resultJson | ConvertFrom-Json
  $webAppNameOutput = $result.properties.outputs.webAppName.value
  $hostNameOutput = $result.properties.outputs.webAppDefaultHostName.value

  Write-Host "Deployment succeeded."
  if ($webAppNameOutput) {
    Write-Host "Web App Name: $webAppNameOutput"
  }
  if ($hostNameOutput) {
    Write-Host "Web App Host: https://$hostNameOutput"
  }
} else {
  Write-Host "Dry-run completed. No resources were created. Use -Deploy to execute deployment."
}