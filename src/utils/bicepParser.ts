import type { ParsedResource, ArmResource } from '../types/arm';

interface BicepResourceIntermediate {
  symbolName: string;
  fullType: string;
  apiVersion: string;
  nameValue: string;
  dependsOnSymbols: string[];
  parentSymbol?: string;
  blockSource: string;
}

function cleanExpression(value: string): string {
  const trimmed = value.trim().replace(/,$/, '');
  const singleQuoted = trimmed.match(/^'([^']*)'$/);
  if (singleQuoted) return singleQuoted[1];
  return trimmed;
}

function findMatchingBrace(text: string, startIndex: number): number {
  let depth = 0;
  let inSingleQuote = false;
  let inDoubleQuote = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    const prev = i > 0 ? text[i - 1] : '';

    if (!inDoubleQuote && ch === "'" && prev !== '\\') {
      inSingleQuote = !inSingleQuote;
      continue;
    }

    if (!inSingleQuote && ch === '"' && prev !== '\\') {
      inDoubleQuote = !inDoubleQuote;
      continue;
    }

    if (inSingleQuote || inDoubleQuote) continue;

    if (ch === '{') depth++;
    if (ch === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }

  return -1;
}

function parseResourceBlocks(source: string): BicepResourceIntermediate[] {
  const resources: BicepResourceIntermediate[] = [];
  const resourceRegex = /resource\s+([A-Za-z_][A-Za-z0-9_]*)\s+'([^']+)'\s*=\s*\{/g;

  let match: RegExpExecArray | null;
  while ((match = resourceRegex.exec(source)) !== null) {
    const symbolName = match[1];
    const typeWithVersion = match[2];
    const blockStart = source.indexOf('{', match.index);
    if (blockStart < 0) continue;

    const blockEnd = findMatchingBrace(source, blockStart);
    if (blockEnd < 0) continue;

    const body = source.slice(blockStart + 1, blockEnd);
    const blockSource = source.slice(match.index, blockEnd + 1);

    const [fullType, apiVersion = 'unknown'] = typeWithVersion.split('@');

    const nameMatch = body.match(/\bname\s*:\s*([^\r\n]+)/);
    const nameValue = cleanExpression(nameMatch?.[1] ?? symbolName);

    const parentMatch = body.match(/\bparent\s*:\s*([A-Za-z_][A-Za-z0-9_]*)/);
    const parentSymbol = parentMatch?.[1];

    const dependsOnMatch = body.match(/\bdependsOn\s*:\s*\[([\s\S]*?)\]/);
    const dependsOnSymbols = dependsOnMatch
      ? (dependsOnMatch[1].match(/[A-Za-z_][A-Za-z0-9_]*/g) ?? [])
      : [];

    resources.push({
      symbolName,
      fullType,
      apiVersion,
      nameValue,
      dependsOnSymbols,
      parentSymbol,
      blockSource,
    });

    resourceRegex.lastIndex = blockEnd + 1;
  }

  return resources;
}

function shortType(type: string): string {
  const parts = type.split('/');
  return parts[parts.length - 1] || type;
}

export function parseBicepTemplate(source: string): {
  resources: ParsedResource[];
  edges: { from: string; to: string }[];
} {
  const parsedBlocks = parseResourceBlocks(source);
  const symbolToId = new Map<string, string>();

  const resources: ParsedResource[] = parsedBlocks.map((block) => {
    const id = `${block.fullType}/${block.nameValue}`;
    symbolToId.set(block.symbolName, id);

    const raw: ArmResource = {
      type: block.fullType,
      apiVersion: block.apiVersion,
      name: block.nameValue,
      dependsOn: block.dependsOnSymbols,
      properties: {
        bicepSymbol: block.symbolName,
        bicepSource: block.blockSource,
      },
    };

    return {
      id,
      type: block.fullType,
      name: block.nameValue,
      shortType: shortType(block.fullType),
      shortName: block.nameValue,
      apiVersion: block.apiVersion,
      dependsOn: block.dependsOnSymbols,
      properties: raw.properties,
      raw,
      children: [],
    };
  });

  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const edges: { from: string; to: string }[] = [];

  for (const block of parsedBlocks) {
    const targetId = symbolToId.get(block.symbolName);
    if (!targetId) continue;

    const uniqueDeps = new Set<string>(block.dependsOnSymbols);
    if (block.parentSymbol) uniqueDeps.add(block.parentSymbol);

    for (const depSymbol of uniqueDeps) {
      const sourceId = symbolToId.get(depSymbol);
      if (!sourceId || sourceId === targetId) continue;
      edges.push({ from: sourceId, to: targetId });

      const parentResource = resourceById.get(sourceId);
      const childResource = resourceById.get(targetId);
      if (parentResource && childResource && block.parentSymbol === depSymbol) {
        childResource.parentId = parentResource.id;
        parentResource.children.push(childResource);
      }
    }
  }

  return { resources, edges };
}
