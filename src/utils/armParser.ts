import type { ArmTemplate, ArmResource, ParsedResource } from '../types/arm';

/**
 * Extract a short resource type name (last segment).
 * e.g. "Microsoft.Network/virtualNetworks" -> "virtualNetworks"
 */
function shortType(type: string): string {
  const parts = type.split('/');
  return parts[parts.length - 1];
}

/**
 * Strip ARM template expressions from a name.
 * e.g. "[parameters('vmName')]" -> "parameters('vmName')"
 */
function cleanName(name: string): string {
  if (name.startsWith('[') && name.endsWith(']')) {
    return name.slice(1, -1);
  }
  return name;
}

/**
 * Build a stable identifier for a resource: type + '/' + name
 */
function buildResourceId(type: string, name: string): string {
  return `${type}/${cleanName(name)}`;
}

/**
 * Attempt to extract a resource identifier from a dependsOn entry.
 * ARM dependsOn entries may be:
 *  - A simple name: "myNSG"
 *  - A resourceId expression: "[resourceId('Microsoft.Network/nsg', 'myNSG')]"
 *  - A full resource type/name: "Microsoft.Network/nsg/myNSG"
 */
function parseDependsOnEntry(entry: string): { type?: string; name: string; raw: string } {
  const cleaned = cleanName(entry.trim());

  // Match resourceId('Type', 'Name') or resourceId('Type', parameters('x'))
  const resourceIdMatch = cleaned.match(
    /resourceId\(\s*'([^']+)'\s*,\s*(?:'([^']+)'|([^)]+))\s*\)/
  );
  if (resourceIdMatch) {
    return {
      type: resourceIdMatch[1],
      name: resourceIdMatch[2] || resourceIdMatch[3],
      raw: entry,
    };
  }

  // Match Type/Name format (at least one slash with a provider namespace)
  if (cleaned.includes('/') && cleaned.includes('.')) {
    const lastSlash = cleaned.lastIndexOf('/');
    return {
      type: cleaned.substring(0, lastSlash),
      name: cleaned.substring(lastSlash + 1),
      raw: entry,
    };
  }

  // Simple name reference
  return { name: cleaned, raw: entry };
}

/**
 * Parse an ARM template into a flat list of ParsedResources,
 * flattening any nested (child) resources.
 */
export function parseTemplate(template: ArmTemplate): ParsedResource[] {
  const results: ParsedResource[] = [];

  function processResource(resource: ArmResource, parentType?: string, parentName?: string): void {
    const fullType = parentType
      ? `${parentType}/${resource.type}`
      : resource.type;

    const fullName = parentName
      ? `${cleanName(parentName)}/${cleanName(resource.name)}`
      : cleanName(resource.name);

    const id = buildResourceId(fullType, fullName);

    const parsed: ParsedResource = {
      id,
      type: fullType,
      name: fullName,
      shortType: shortType(fullType),
      shortName: cleanName(resource.name),
      apiVersion: resource.apiVersion,
      location: resource.location,
      dependsOn: resource.dependsOn?.map((d) => d) || [],
      properties: resource.properties,
      raw: resource,
      children: [],
      parentId: parentType ? buildResourceId(parentType, parentName || '') : undefined,
    };

    results.push(parsed);

    // Process nested child resources
    if (resource.resources) {
      for (const child of resource.resources) {
        processResource(child, fullType, fullName);
      }
    }
  }

  for (const resource of template.resources) {
    processResource(resource);
  }

  // Wire up parent-child relationships
  const byId = new Map(results.map((r) => [r.id, r]));
  for (const r of results) {
    if (r.parentId) {
      const parent = byId.get(r.parentId);
      if (parent) {
        parent.children.push(r);
      }
    }
  }

  return results;
}

/**
 * Resolve dependsOn references into edges { from, to } where both
 * from and to are resource ids from the parsed list.
 */
export function resolveDependencies(
  resources: ParsedResource[]
): { from: string; to: string }[] {
  const edges: { from: string; to: string }[] = [];
  const byType = new Map<string, ParsedResource[]>();
  const byName = new Map<string, ParsedResource[]>();

  for (const r of resources) {
    // Index by type
    const existing = byType.get(r.type) || [];
    existing.push(r);
    byType.set(r.type, existing);

    // Index by short name
    const nameList = byName.get(r.shortName) || [];
    nameList.push(r);
    byName.set(r.shortName, nameList);

    // Also index by full name
    const fullNameList = byName.get(r.name) || [];
    fullNameList.push(r);
    byName.set(r.name, fullNameList);
  }

  for (const resource of resources) {
    for (const dep of resource.dependsOn) {
      const parsed = parseDependsOnEntry(dep);
      let target: ParsedResource | undefined;

      if (parsed.type) {
        // Match by type + name
        const candidates = byType.get(parsed.type) || [];
        target = candidates.find(
          (c) => c.shortName === parsed.name || c.name === parsed.name
        );
      }

      if (!target) {
        // Fallback: match by name alone
        const candidates = byName.get(parsed.name) || [];
        if (candidates.length === 1) {
          target = candidates[0];
        }
      }

      if (target) {
        // Edge goes from dependency -> dependent (target is depended upon)
        edges.push({ from: target.id, to: resource.id });
      }
    }
  }

  return edges;
}

/**
 * Validate that the input looks like an ARM template.
 */
export function validateTemplate(obj: unknown): obj is ArmTemplate {
  if (!obj || typeof obj !== 'object') return false;
  const t = obj as Record<string, unknown>;
  return Array.isArray(t.resources);
}
