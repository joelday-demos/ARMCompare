targetScope = 'resourceGroup'

@description('Azure region for the App Service resources.')
param location string = resourceGroup().location

@description('Name of the App Service plan.')
param appServicePlanName string = 'asp-${uniqueString(resourceGroup().id)}'

@description('Name of the Web App to deploy the built frontend.')
param webAppName string = 'armcompare-${uniqueString(resourceGroup().id)}'

@description('Pricing tier for the App Service plan.')
@allowed([
  'B1'
  'S1'
  'P1v3'
])
param skuName string = 'B1'

resource appServicePlan 'Microsoft.Web/serverfarms@2023-12-01' = {
  name: appServicePlanName
  location: location
  sku: {
    name: skuName
    tier: startsWith(skuName, 'P') ? 'PremiumV3' : (startsWith(skuName, 'S') ? 'Standard' : 'Basic')
    size: skuName
    capacity: 1
  }
  kind: 'linux'
  properties: {
    reserved: true
  }
}

resource webApp 'Microsoft.Web/sites@2023-12-01' = {
  name: webAppName
  location: location
  kind: 'app,linux'
  properties: {
    serverFarmId: appServicePlan.id
    siteConfig: {
      linuxFxVersion: 'NODE|20-lts'
      alwaysOn: false
      ftpsState: 'FtpsOnly'
      minTlsVersion: '1.2'
      appSettings: [
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'SCM_DO_BUILD_DURING_DEPLOYMENT'
          value: 'false'
        }
        {
          name: 'WEBSITES_PORT'
          value: '8080'
        }
      ]
    }
    httpsOnly: true
  }
}

output webAppName string = webApp.name
output webAppDefaultHostName string = webApp.properties.defaultHostName
