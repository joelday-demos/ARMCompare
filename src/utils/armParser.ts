import type { ArmTemplate, ArmResource, ParsedResource } from '../types/arm';

export interface ArmParameterDefinition {
  name: string;
  type: string;
  description?: string;
  allowedValues?: unknown[];
  defaultValue?: unknown;
  minValue?: number;
  maxValue?: number;
}

interface ParseTemplateOptions {
  parameterValues?: Record<string, unknown>;
}

interface EvalContext {
  template: ArmTemplate;
  parameters: Record<string, unknown>;
  copyIndex?: number;
  copyIndices: Record<string, number>;
  variableCache: Map<string, unknown>;
}

interface ArmFunctionCall {
  name: string;
  args: string[];
}

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

function isArmExpression(value: string): boolean {
  return value.startsWith('[') && value.endsWith(']');
}

function stripExpression(value: string): string {
  return value.slice(1, -1).trim();
}

function splitTopLevelArgs(input: string): string[] {
  const result: string[] = [];
  let current = '';
  let depth = 0;
  let inString = false;

  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    const prev = i > 0 ? input[i - 1] : '';

    if (ch === '\'' && prev !== '\\') {
      inString = !inString;
      current += ch;
      continue;
    }

    if (!inString) {
      if (ch === '(') depth++;
      if (ch === ')') depth--;
      if (ch === ',' && depth === 0) {
        result.push(current.trim());
        current = '';
        continue;
      }
    }

    current += ch;
  }

  if (current.trim().length > 0) {
    result.push(current.trim());
  }

  return result;
}

function parseFunctionCall(expression: string): ArmFunctionCall | null {
  const match = expression.match(/^([A-Za-z0-9_\.]+)\((.*)\)$/s);
  if (!match) return null;
  return {
    name: match[1],
    args: splitTopLevelArgs(match[2]),
  };
}

function evaluateExpression(expression: string, ctx: EvalContext): unknown {
  const trimmed = expression.trim();

  const literalString = trimmed.match(/^'([\s\S]*)'$/);
  if (literalString) return literalString[1];

  if (/^-?\d+$/.test(trimmed)) return Number(trimmed);
  if (trimmed === 'true') return true;
  if (trimmed === 'false') return false;

  const propertyAccess = trimmed.match(/^(.+)\.([A-Za-z_][A-Za-z0-9_]*)$/);
  if (propertyAccess) {
    const base = evaluateExpression(propertyAccess[1], ctx) as Record<string, unknown> | null;
    if (base && typeof base === 'object') {
      return base[propertyAccess[2]];
    }
  }

  const parsed = parseFunctionCall(trimmed);
  if (!parsed) return trimmed;

  const evalArg = (arg: string): unknown => evaluateExpression(arg, ctx);
  const name = parsed.name.toLowerCase();

  if (name === 'parameters') {
    const key = String(evalArg(parsed.args[0] ?? "''"));
    return ctx.parameters[key];
  }

  if (name === 'variables') {
    const key = String(evalArg(parsed.args[0] ?? "''"));
    if (ctx.variableCache.has(key)) {
      return ctx.variableCache.get(key);
    }
    const variableValue = (ctx.template.variables as Record<string, unknown> | undefined)?.[key];
    const evaluated = evaluateValue(variableValue, ctx);
    ctx.variableCache.set(key, evaluated);
    return evaluated;
  }

  if (name === 'concat') {
    return parsed.args.map((arg) => String(evalArg(arg) ?? '')).join('');
  }

  if (name === 'resourceid') {
    const type = String(evalArg(parsed.args[0] ?? "''"));
    const nameParts = parsed.args.slice(1).map((arg) => String(evalArg(arg) ?? '')).filter(Boolean);
    return nameParts.length > 0 ? `${type}/${nameParts.join('/')}` : type;
  }

  if (name === 'copyindex') {
    const loopName = parsed.args[0] ? String(evalArg(parsed.args[0])) : undefined;
    const offset = parsed.args[1] ? Number(evalArg(parsed.args[1])) : 0;
    const base = loopName ? (ctx.copyIndices[loopName] ?? 0) : (ctx.copyIndex ?? 0);
    return base + offset;
  }

  if (name === 'if') {
    const condition = Boolean(evalArg(parsed.args[0] ?? 'false'));
    return condition ? evalArg(parsed.args[1] ?? 'null()') : evalArg(parsed.args[2] ?? 'null()');
  }

  if (name === 'equals') {
    return evalArg(parsed.args[0] ?? "''") === evalArg(parsed.args[1] ?? "''");
  }

  if (name === 'and') {
    return parsed.args.every((arg) => Boolean(evalArg(arg)));
  }

  if (name === 'createobject') {
    const obj: Record<string, unknown> = {};
    for (let i = 0; i < parsed.args.length; i += 2) {
      const key = String(evalArg(parsed.args[i] ?? "''"));
      obj[key] = evalArg(parsed.args[i + 1] ?? 'null()');
    }
    return obj;
  }

  if (name === 'null') {
    return null;
  }

  if (name === 'resourcegroup') {
    return {
      location: ctx.parameters.location ?? 'resource-group-location',
    };
  }

  return trimmed;
}

function evaluateValue(value: unknown, ctx: EvalContext): unknown {
  if (typeof value === 'string') {
    if (isArmExpression(value)) {
      return evaluateExpression(stripExpression(value), ctx);
    }
    return value;
  }

  if (Array.isArray(value)) {
    return value.map((v) => evaluateValue(v, ctx));
  }

  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const next: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      next[k] = evaluateValue(v, ctx);
    }
    return next;
  }

  return value;
}

function defaultForType(type: string, parameter: Record<string, unknown>): unknown {
  const normalized = type.toLowerCase();
  if (normalized === 'int') {
    return typeof parameter.minValue === 'number' ? parameter.minValue : 0;
  }
  if (normalized === 'bool' || normalized === 'boolean') {
    return false;
  }
  return '';
}

export function extractParameterDefinitions(template: ArmTemplate): ArmParameterDefinition[] {
  const parameters = template.parameters as Record<string, unknown> | undefined;
  if (!parameters) return [];

  return Object.entries(parameters).map(([name, raw]) => {
    const p = (raw ?? {}) as Record<string, unknown>;
    const metadata = (p.metadata ?? {}) as Record<string, unknown>;
    return {
      name,
      type: String(p.type ?? 'string'),
      description: typeof metadata.description === 'string' ? metadata.description : undefined,
      allowedValues: Array.isArray(p.allowedValues) ? p.allowedValues : undefined,
      defaultValue: p.defaultValue,
      minValue: typeof p.minValue === 'number' ? p.minValue : undefined,
      maxValue: typeof p.maxValue === 'number' ? p.maxValue : undefined,
    };
  });
}

export function buildEffectiveParameters(
  template: ArmTemplate,
  overrides: Record<string, unknown> = {}
): Record<string, unknown> {
  const parameters = template.parameters as Record<string, unknown> | undefined;
  if (!parameters) return { ...overrides };

  const result: Record<string, unknown> = {};

  for (const [name, raw] of Object.entries(parameters)) {
    const p = (raw ?? {}) as Record<string, unknown>;

    if (Object.prototype.hasOwnProperty.call(overrides, name)) {
      result[name] = overrides[name];
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(p, 'defaultValue')) {
      result[name] = p.defaultValue;
      continue;
    }

    if (Array.isArray(p.allowedValues) && p.allowedValues.length > 0) {
      result[name] = p.allowedValues[0];
      continue;
    }

    result[name] = defaultForType(String(p.type ?? 'string'), p);
  }

  const ctx: EvalContext = {
    template,
    parameters: result,
    copyIndices: {},
    variableCache: new Map<string, unknown>(),
  };

  for (const [name, value] of Object.entries(result)) {
    result[name] = evaluateValue(value, ctx);
  }

  return result;
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
export function parseTemplate(template: ArmTemplate, options: ParseTemplateOptions = {}): ParsedResource[] {
  const results: ParsedResource[] = [];

  const effectiveParameters = buildEffectiveParameters(template, options.parameterValues);

  const baseContext: EvalContext = {
    template,
    parameters: effectiveParameters,
    copyIndices: {},
    variableCache: new Map<string, unknown>(),
  };

  function processResource(
    resource: ArmResource,
    ctx: EvalContext,
    parentType?: string,
    parentName?: string
  ): void {
    const copyMeta = (resource.copy as Record<string, unknown> | undefined) ?? undefined;
    const copyName = typeof copyMeta?.name === 'string' ? copyMeta.name : undefined;
    const copyCountRaw = copyMeta?.count;
    const evaluatedCount = copyCountRaw !== undefined ? Number(evaluateValue(copyCountRaw, ctx)) : 1;
    const copyCount = Number.isFinite(evaluatedCount) ? Math.max(1, Math.floor(evaluatedCount)) : 1;

    for (let copyIndex = 0; copyIndex < copyCount; copyIndex++) {
      const resourceCtx: EvalContext = {
        ...ctx,
        copyIndex,
        copyIndices: {
          ...ctx.copyIndices,
          ...(copyName ? { [copyName]: copyIndex } : {}),
        },
      };

      const fullType = parentType
        ? `${parentType}/${resource.type}`
        : resource.type;

      const evaluatedName = String(evaluateValue(resource.name, resourceCtx) ?? cleanName(resource.name));
      const fullName = parentName
        ? `${cleanName(parentName)}/${evaluatedName}`
        : evaluatedName;

      const id = buildResourceId(fullType, fullName);

      const dependsOn = (resource.dependsOn ?? []).map((dep) => {
        const evaluatedDep = evaluateValue(dep, resourceCtx);
        return typeof evaluatedDep === 'string' ? cleanName(evaluatedDep) : String(evaluatedDep ?? dep);
      });

      const location = resource.location
        ? String(evaluateValue(resource.location, resourceCtx) ?? resource.location)
        : undefined;

      const parsed: ParsedResource = {
        id,
        type: fullType,
        name: fullName,
        shortType: shortType(fullType),
        shortName: evaluatedName,
        apiVersion: resource.apiVersion,
        location,
        dependsOn,
        properties: resource.properties,
        raw: resource,
        children: [],
        parentId: parentType ? buildResourceId(parentType, parentName || '') : undefined,
      };

      results.push(parsed);

      // Process nested child resources
      if (resource.resources) {
        for (const child of resource.resources) {
          processResource(child, resourceCtx, fullType, fullName);
        }
      }
    }
  }

  for (const resource of template.resources) {
    processResource(resource, baseContext);
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
  const byId = new Map<string, ParsedResource>();
  const byType = new Map<string, ParsedResource[]>();
  const byName = new Map<string, ParsedResource[]>();

  for (const r of resources) {
    byId.set(r.id, r);

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

      target = byId.get(cleanName(dep));

      if (!target && parsed.type) {
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
