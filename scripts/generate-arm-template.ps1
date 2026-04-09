param(
  [string]$OutputDirectory = "infra/arm",
  [switch]$WriteSampleParameters
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$resolvedOutputDirectory = Resolve-Path -Path (Join-Path $PSScriptRoot "..") | ForEach-Object {
  Join-Path $_ $OutputDirectory
}

if (-not (Test-Path $resolvedOutputDirectory)) {
  New-Item -ItemType Directory -Path $resolvedOutputDirectory -Force | Out-Null
}

$templatePath = Join-Path $resolvedOutputDirectory "azure-static-website.template.json"
$template = @'
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentTemplate.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "storageAccountName": {
      "type": "string",
      "minLength": 3,
      "maxLength": 24,
      "metadata": {
        "description": "Name of the storage account used for static website hosting."
      }
    },
    "location": {
      "type": "string",
      "defaultValue": "[resourceGroup().location]",
      "metadata": {
        "description": "Location for the storage account."
      }
    },
    "skuName": {
      "type": "string",
      "defaultValue": "Standard_LRS",
      "allowedValues": [
        "Standard_LRS",
        "Standard_GRS",
        "Standard_RAGRS",
        "Standard_ZRS",
        "Premium_LRS"
      ],
      "metadata": {
        "description": "Storage account SKU."
      }
    }
  },
  "resources": [
    {
      "type": "Microsoft.Storage/storageAccounts",
      "apiVersion": "2023-05-01",
      "name": "[parameters('storageAccountName')]",
      "location": "[parameters('location')]",
      "sku": {
        "name": "[parameters('skuName')]"
      },
      "kind": "StorageV2",
      "properties": {
        "minimumTlsVersion": "TLS1_2",
        "allowBlobPublicAccess": true,
        "supportsHttpsTrafficOnly": true
      },
      "resources": [
        {
          "type": "blobServices",
          "apiVersion": "2023-05-01",
          "name": "default",
          "dependsOn": [
            "[resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))]"
          ],
          "properties": {
            "staticWebsite": {
              "enabled": true,
              "indexDocument": "index.html",
              "error404Document": "index.html"
            }
          },
          "resources": [
            {
              "type": "containers",
              "apiVersion": "2023-05-01",
              "name": "$web",
              "dependsOn": [
                "[resourceId('Microsoft.Storage/storageAccounts/blobServices', parameters('storageAccountName'), 'default')]"
              ],
              "properties": {
                "publicAccess": "Blob"
              }
            }
          ]
        }
      ]
    }
  ],
  "outputs": {
    "staticWebsiteUrl": {
      "type": "string",
      "value": "[reference(resourceId('Microsoft.Storage/storageAccounts', parameters('storageAccountName'))).primaryEndpoints.web]"
    }
  }
}
'@

$template | Set-Content -Path $templatePath -Encoding UTF8
Write-Host "ARM template generated at $templatePath"

if ($WriteSampleParameters) {
  $parametersPath = Join-Path $resolvedOutputDirectory "azure-static-website.parameters.sample.json"
  $parameters = @'
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "storageAccountName": {
      "value": "changeme123"
    },
    "location": {
      "value": "eastus"
    },
    "skuName": {
      "value": "Standard_LRS"
    }
  }
}
'@

  $parameters | Set-Content -Path $parametersPath -Encoding UTF8
  Write-Host "Sample parameters generated at $parametersPath"
}
