import { memo } from 'react';
import { Handle, Position } from '@xyflow/react';
import type { NodeProps } from '@xyflow/react';
import type { GraphNode } from '../utils/graphLayout';

const RESOURCE_ICONS: Record<string, string> = {
  'virtualNetworks': '🌐',
  'networkSecurityGroups': '🛡️',
  'publicIPAddresses': '📡',
  'networkInterfaces': '🔌',
  'virtualMachines': '🖥️',
  'storageAccounts': '💾',
  'databases': '🗄️',
  'sites': '🌍',
  'serverfarms': '⚙️',
  'vaults': '🔐',
  'components': '📊',
  'workspaces': '📁',
  'loadBalancers': '⚖️',
  'subnets': '📦',
  'disks': '💿',
  'availabilitySets': '🔄',
  'containerGroups': '🐳',
  'registries': '📋',
  'clusters': '🏗️',
  'servers': '🗄️',
  'namespaces': '📬',
  'accounts': '👤',
};

function getIcon(shortType: string): string {
  for (const [key, icon] of Object.entries(RESOURCE_ICONS)) {
    if (shortType.toLowerCase().includes(key.toLowerCase())) {
      return icon;
    }
  }
  return '📦';
}

function ResourceNode({ data, selected }: NodeProps) {
  const { resource, diff } = data as unknown as GraphNode;

  let statusClass = '';
  let statusBadge = '';
  if (diff) {
    switch (diff.status) {
      case 'added':
        statusClass = 'node-added';
        statusBadge = 'ADDED';
        break;
      case 'removed':
        statusClass = 'node-removed';
        statusBadge = 'REMOVED';
        break;
      case 'modified':
        statusClass = 'node-modified';
        statusBadge = `MODIFIED (${diff.changes?.length || 0})`;
        break;
      case 'unchanged':
        statusClass = 'node-unchanged';
        break;
    }
  }

  return (
    <div className={`resource-node ${statusClass} ${selected ? 'selected' : ''}`}>
      <Handle type="target" position={Position.Top} className="node-handle" />
      <div className="node-header">
        <span className="node-icon">{getIcon(resource.shortType)}</span>
        <span className="node-type">{resource.shortType}</span>
        {statusBadge && <span className={`node-badge ${statusClass}`}>{statusBadge}</span>}
      </div>
      <div className="node-name" title={resource.name}>{resource.shortName}</div>
      <div className="node-provider" title={resource.type}>
        {resource.type.split('/').slice(0, -1).join('/')}
      </div>
      <Handle type="source" position={Position.Bottom} className="node-handle" />
    </div>
  );
}

export default memo(ResourceNode);
