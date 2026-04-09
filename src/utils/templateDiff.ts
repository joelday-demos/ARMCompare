import type { ParsedResource, DiffResult, DiffStatus, PropertyChange } from '../types/arm';

/**
 * Build a match key for a resource: type/name (lowercased).
 */
function normalizeResourceName(name: string): string {
  const value = name.trim().toLowerCase();

  const armParameters = value.match(/^parameters\('\s*([^']+)\s*'\)$/);
  if (armParameters) return armParameters[1].replace(/[^a-z0-9]/g, '');

  const armVariables = value.match(/^variables\('\s*([^']+)\s*'\)$/);
  if (armVariables) return armVariables[1].replace(/[^a-z0-9]/g, '');

  const singleQuoted = value.match(/^'([^']+)'$/);
  if (singleQuoted) return singleQuoted[1].replace(/[^a-z0-9]/g, '');

  return value.replace(/[^a-z0-9]/g, '');
}

function matchKey(resource: ParsedResource): string {
  return `${resource.type.toLowerCase()}/${normalizeResourceName(resource.name)}`;
}

/**
 * Deep-compare two values and return a list of property changes.
 */
function diffProperties(
  oldVal: unknown,
  newVal: unknown,
  path = ''
): PropertyChange[] {
  const changes: PropertyChange[] = [];

  if (oldVal === newVal) return changes;
  if (oldVal === undefined && newVal === undefined) return changes;

  if (
    oldVal === null || newVal === null ||
    typeof oldVal !== typeof newVal ||
    typeof oldVal !== 'object' ||
    Array.isArray(oldVal) !== Array.isArray(newVal)
  ) {
    changes.push({ path: path || '(root)', oldValue: oldVal, newValue: newVal });
    return changes;
  }

  if (Array.isArray(oldVal) && Array.isArray(newVal)) {
    const maxLen = Math.max(oldVal.length, newVal.length);
    for (let i = 0; i < maxLen; i++) {
      changes.push(...diffProperties(oldVal[i], newVal[i], `${path}[${i}]`));
    }
    return changes;
  }

  const oldObj = oldVal as Record<string, unknown>;
  const newObj = newVal as Record<string, unknown>;
  const allKeys = new Set([...Object.keys(oldObj), ...Object.keys(newObj)]);

  for (const key of allKeys) {
    // Skip dependsOn — we handle that separately via edges
    if (key === 'dependsOn') continue;
    const subPath = path ? `${path}.${key}` : key;
    changes.push(...diffProperties(oldObj[key], newObj[key], subPath));
  }

  return changes;
}

/**
 * Compare two sets of parsed resources and return a diff result for each unique resource.
 */
export function diffTemplates(
  leftResources: ParsedResource[],
  rightResources: ParsedResource[]
): DiffResult[] {
  const leftMap = new Map<string, ParsedResource>();
  const rightMap = new Map<string, ParsedResource>();

  for (const r of leftResources) {
    leftMap.set(matchKey(r), r);
  }
  for (const r of rightResources) {
    rightMap.set(matchKey(r), r);
  }

  const results: DiffResult[] = [];
  const seen = new Set<string>();

  // Process resources from left template
  for (const [key, leftRes] of leftMap) {
    seen.add(key);
    const rightRes = rightMap.get(key);

    if (!rightRes) {
      results.push({ resource: leftRes, status: 'removed' });
    } else {
      const changes = diffProperties(leftRes.raw, rightRes.raw);
      const status: DiffStatus = changes.length > 0 ? 'modified' : 'unchanged';
      results.push({
        resource: rightRes,
        status,
        otherResource: leftRes,
        changes: changes.length > 0 ? changes : undefined,
      });
    }
  }

  // Process resources only in right template
  for (const [key, rightRes] of rightMap) {
    if (!seen.has(key)) {
      results.push({ resource: rightRes, status: 'added' });
    }
  }

  return results;
}

/**
 * Build a map from resource id to DiffResult for quick lookup.
 */
export function buildDiffMap(diffs: DiffResult[]): Map<string, DiffResult> {
  const map = new Map<string, DiffResult>();
  for (const d of diffs) {
    map.set(d.resource.id, d);
  }
  return map;
}
