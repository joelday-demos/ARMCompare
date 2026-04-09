import type { ParsedResource } from '../types/arm';
import appInsightsIcon from '../assets/Icons/monitor/00012-icon-service-Application-Insights.svg';
import appServicePlansIcon from '../assets/Icons/web/00046-icon-service-App-Service-Plans.svg';
import appServicesIcon from '../assets/Icons/web/10035-icon-service-App-Services.svg';
import availabilitySetsIcon from '../assets/Icons/compute/10025-icon-service-Availability-Sets.svg';
import containerInstancesIcon from '../assets/Icons/containers/10104-icon-service-Container-Instances.svg';
import containerRegistriesIcon from '../assets/Icons/containers/10105-icon-service-Container-Registries.svg';
import defaultIcon from '../assets/Icons/general/10001-icon-service-All-Resources.svg';
import disksIcon from '../assets/Icons/compute/10032-icon-service-Disks.svg';
import eventHubsIcon from '../assets/Icons/analytics/00039-icon-service-Event-Hubs.svg';
import keyVaultIcon from '../assets/Icons/security/10245-icon-service-Key-Vaults.svg';
import kubernetesIcon from '../assets/Icons/compute/10023-icon-service-Kubernetes-Services.svg';
import loadBalancersIcon from '../assets/Icons/networking/10062-icon-service-Load-Balancers.svg';
import logAnalyticsIcon from '../assets/Icons/monitor/00009-icon-service-Log-Analytics-Workspaces.svg';
import networkInterfacesIcon from '../assets/Icons/networking/10080-icon-service-Network-Interfaces.svg';
import networkSecurityGroupsIcon from '../assets/Icons/networking/10067-icon-service-Network-Security-Groups.svg';
import publicIpAddressesIcon from '../assets/Icons/networking/10069-icon-service-Public-IP-Addresses.svg';
import sqlDatabaseIcon from '../assets/Icons/databases/10130-icon-service-SQL-Database.svg';
import sqlServerIcon from '../assets/Icons/databases/10132-icon-service-SQL-Server.svg';
import storageAccountsIcon from '../assets/Icons/storage/10086-icon-service-Storage-Accounts.svg';
import subnetIcon from '../assets/Icons/networking/02742-icon-service-Subnet.svg';
import virtualMachineIcon from '../assets/Icons/compute/10021-icon-service-Virtual-Machine.svg';
import virtualNetworksIcon from '../assets/Icons/networking/10061-icon-service-Virtual-Networks.svg';
import vmScaleSetsIcon from '../assets/Icons/compute/10034-icon-service-VM-Scale-Sets.svg';

const RESOURCE_ICON_HINTS: Array<{ patterns: string[]; icon: string }> = [
  { patterns: ['virtualnetworks'], icon: virtualNetworksIcon },
  { patterns: ['subnets'], icon: subnetIcon },
  { patterns: ['networksecuritygroups'], icon: networkSecurityGroupsIcon },
  { patterns: ['networkinterfaces'], icon: networkInterfacesIcon },
  { patterns: ['publicipaddresses'], icon: publicIpAddressesIcon },
  { patterns: ['loadbalancers'], icon: loadBalancersIcon },
  { patterns: ['applicationgateways'], icon: loadBalancersIcon },
  { patterns: ['virtualmachines'], icon: virtualMachineIcon },
  { patterns: ['virtualmachinescalesets'], icon: vmScaleSetsIcon },
  { patterns: ['availabilitysets'], icon: availabilitySetsIcon },
  { patterns: ['disks'], icon: disksIcon },
  { patterns: ['storageaccounts'], icon: storageAccountsIcon },
  { patterns: ['sites'], icon: appServicesIcon },
  { patterns: ['serverfarms'], icon: appServicePlansIcon },
  { patterns: ['vaults'], icon: keyVaultIcon },
  { patterns: ['workspaces'], icon: logAnalyticsIcon },
  { patterns: ['managedclusters'], icon: kubernetesIcon },
  { patterns: ['containerregistries'], icon: containerRegistriesIcon },
  { patterns: ['containergroups'], icon: containerInstancesIcon },
  { patterns: ['databases'], icon: sqlDatabaseIcon },
  { patterns: ['servers'], icon: sqlServerIcon },
  { patterns: ['components'], icon: appInsightsIcon },
  { patterns: ['namespaces'], icon: eventHubsIcon },
  { patterns: ['accounts'], icon: storageAccountsIcon },
];

function normalize(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

export function getAzureIconForResource(resource: ParsedResource): string {
  const normalizedType = normalize(resource.type);
  const normalizedShortType = normalize(resource.shortType);

  for (const rule of RESOURCE_ICON_HINTS) {
    if (rule.patterns.some((pattern) => normalizedType.includes(pattern) || normalizedShortType.includes(pattern))) {
      return rule.icon;
    }
  }

  return defaultIcon;
}