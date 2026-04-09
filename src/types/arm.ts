export interface ArmResource {
  type: string;
  apiVersion: string;
  name: string;
  location?: string;
  dependsOn?: string[];
  properties?: Record<string, unknown>;
  resources?: ArmResource[];
  kind?: string;
  sku?: Record<string, unknown>;
  tags?: Record<string, string>;
  [key: string]: unknown;
}

export interface ArmTemplate {
  $schema?: string;
  contentVersion?: string;
  parameters?: Record<string, unknown>;
  variables?: Record<string, unknown>;
  resources: ArmResource[];
  outputs?: Record<string, unknown>;
}

export interface ParsedResource {
  id: string;
  type: string;
  name: string;
  shortType: string;
  shortName: string;
  apiVersion: string;
  location?: string;
  dependsOn: string[];
  properties?: Record<string, unknown>;
  raw: ArmResource;
  children: ParsedResource[];
  parentId?: string;
}

export type DiffStatus = 'added' | 'removed' | 'modified' | 'unchanged';

export interface DiffResult {
  resource: ParsedResource;
  status: DiffStatus;
  otherResource?: ParsedResource;
  changes?: PropertyChange[];
}

export interface PropertyChange {
  path: string;
  oldValue: unknown;
  newValue: unknown;
}
