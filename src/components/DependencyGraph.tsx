import { useMemo, useState } from 'react';
import { hierarchy, tree } from 'd3-hierarchy';

import type { ParsedResource, DiffResult } from '../types/arm';
import { getAzureIconForResource } from '../utils/azureIconLookup';
import ResourceDetails from './ResourceDetails';

interface DependencyGraphProps {
  resources: ParsedResource[];
  edges: { from: string; to: string }[];
  diffMap?: Map<string, DiffResult>;
  title?: string;
}

interface TreeNodeDatum {
  id: string;
  resource?: ParsedResource;
  diff?: DiffResult;
  children?: TreeNodeDatum[];
}

interface RenderNode {
  id: string;
  x: number;
  y: number;
  resource: ParsedResource;
  diff?: DiffResult;
  iconUrl: string;
}

interface RenderLink {
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  isExtra?: boolean;
}

interface RawPositionedNode {
  id: string;
  x: number;
  y: number;
  resource: ParsedResource;
  diff?: DiffResult;
}

interface NullableRenderLink {
  sourceId: string;
  targetId: string;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
  isExtra: boolean;
}

const NODE_WIDTH = 240;
const NODE_HEIGHT = 76;
const PADDING_X = 80;
const PADDING_Y = 50;
const MIN_SCALE = 0.45;
const MAX_SCALE = 2.5;

function getStatusClass(diff?: DiffResult): string {
  if (!diff) return 'tree-node-default';
  switch (diff.status) {
    case 'added':
      return 'tree-node-added';
    case 'removed':
      return 'tree-node-removed';
    case 'modified':
      return 'tree-node-modified';
    default:
      return 'tree-node-default';
  }
}

function truncateLabel(value: string, max = 30): string {
  if (value.length <= max) return value;
  return `${value.slice(0, max - 1)}...`;
}

function linkPath(sourceX: number, sourceY: number, targetX: number, targetY: number): string {
  const midY = (sourceY + targetY) / 2;
  return `M${sourceY},${sourceX} C${midY},${sourceX} ${midY},${targetX} ${targetY},${targetX}`;
}

export default function DependencyGraph({
  resources,
  edges: rawEdges,
  diffMap,
  title,
}: DependencyGraphProps) {
  const [selectedResource, setSelectedResource] = useState<{
    resource: ParsedResource;
    diff?: DiffResult;
  } | null>(null);
  const [scale, setScale] = useState(1);
  const [translate, setTranslate] = useState({ x: 0, y: 0 });
  const [panStart, setPanStart] = useState<{
    pointerX: number;
    pointerY: number;
    originX: number;
    originY: number;
  } | null>(null);

  const layout = useMemo(() => {
    const resourceById = new Map(resources.map((resource) => [resource.id, resource]));
    const incomingByTarget = new Map<string, string[]>();
    const outgoingBySource = new Map<string, string[]>();

    for (const edge of rawEdges) {
      if (!resourceById.has(edge.from) || !resourceById.has(edge.to)) continue;
      const incoming = incomingByTarget.get(edge.to) ?? [];
      incoming.push(edge.from);
      incomingByTarget.set(edge.to, incoming);

      const outgoing = outgoingBySource.get(edge.from) ?? [];
      outgoing.push(edge.to);
      outgoingBySource.set(edge.from, outgoing);
    }

    const roots = resources
      .filter((resource) => (incomingByTarget.get(resource.id)?.length ?? 0) === 0)
      .map((resource) => resource.id);

    const effectiveRoots = roots.length > 0 ? roots : resources.slice(0, 1).map((resource) => resource.id);

    const parentById = new Map<string, string>();
    const queue = [...effectiveRoots];
    const visited = new Set<string>(effectiveRoots);

    while (queue.length > 0) {
      const current = queue.shift();
      if (!current) continue;
      const children = outgoingBySource.get(current) ?? [];
      for (const child of children) {
        if (!visited.has(child)) {
          visited.add(child);
          parentById.set(child, current);
          queue.push(child);
        }
      }
    }

    for (const resource of resources) {
      if (!visited.has(resource.id)) {
        visited.add(resource.id);
      }
      if (effectiveRoots.includes(resource.id)) continue;
      if (!parentById.has(resource.id)) {
        const incoming = incomingByTarget.get(resource.id) ?? [];
        if (incoming.length > 0) {
          parentById.set(resource.id, incoming[0]);
        }
      }
    }

    const childrenByParent = new Map<string, string[]>();
    for (const [child, parent] of parentById.entries()) {
      const children = childrenByParent.get(parent) ?? [];
      children.push(child);
      childrenByParent.set(parent, children);
    }

    const buildDatum = (id: string): TreeNodeDatum => {
      const resource = resourceById.get(id);
      return {
        id,
        resource,
        diff: resource ? diffMap?.get(resource.id) : undefined,
        children: (childrenByParent.get(id) ?? []).map(buildDatum),
      };
    };

    const rootDatum: TreeNodeDatum =
      effectiveRoots.length === 1
        ? buildDatum(effectiveRoots[0])
        : {
            id: '__virtual_root__',
            children: effectiveRoots.map(buildDatum),
          };

    const root = hierarchy<TreeNodeDatum>(rootDatum, (datum: TreeNodeDatum) => datum.children ?? []);
    const treeLayout = tree<TreeNodeDatum>().nodeSize([140, 290]);
    const laidOut = treeLayout(root);

    const nodesRaw: RawPositionedNode[] = [];
    for (const node of laidOut.descendants()) {
      if (node.data.id === '__virtual_root__' || !node.data.resource) continue;
      nodesRaw.push({
        id: node.data.id,
        x: node.x,
        y: node.y,
        resource: node.data.resource,
        diff: node.data.diff,
      });
    }

    const minX = Math.min(...nodesRaw.map((node) => node.x), 0);
    const minY = Math.min(...nodesRaw.map((node) => node.y), 0);

    const nodes: RenderNode[] = nodesRaw.map((node) => ({
      ...node,
      x: node.x - minX + PADDING_Y,
      y: node.y - minY + PADDING_X,
      iconUrl: getAzureIconForResource(node.resource),
    }));

    const positionedById = new Map(nodes.map((node) => [node.id, node]));

    const treeLinks: RenderLink[] = [];
    for (const [child, parent] of parentById.entries()) {
      const source = positionedById.get(parent);
      const target = positionedById.get(child);
      if (!source || !target) continue;
      treeLinks.push({
        sourceId: source.id,
        targetId: target.id,
        sourceX: source.x,
        sourceY: source.y + NODE_WIDTH,
        targetX: target.x,
        targetY: target.y,
      });
    }

    const treeEdgeSet = new Set(treeLinks.map((link) => `${link.sourceId}|${link.targetId}`));

    const extraLinks: RenderLink[] = rawEdges
      .filter((edge) => !treeEdgeSet.has(`${edge.from}|${edge.to}`))
      .map((edge): NullableRenderLink | null => {
        const source = positionedById.get(edge.from);
        const target = positionedById.get(edge.to);
        if (!source || !target) return null;
        return {
          sourceId: source.id,
          targetId: target.id,
          sourceX: source.x,
          sourceY: source.y + NODE_WIDTH,
          targetX: target.x,
          targetY: target.y,
          isExtra: true,
        };
      })
      .filter((link): link is NullableRenderLink => link !== null);

    const maxX = Math.max(...nodes.map((node) => node.x), 0);
    const maxY = Math.max(...nodes.map((node) => node.y), 0);

    return {
      nodes,
      links: [...treeLinks, ...extraLinks],
      width: maxY + NODE_WIDTH + PADDING_X,
      height: maxX + NODE_HEIGHT + PADDING_Y,
    };
  }, [resources, rawEdges, diffMap]);

  const setZoom = (next: number) => {
    setScale(Math.min(MAX_SCALE, Math.max(MIN_SCALE, next)));
  };

  const zoomIn = () => setZoom(scale + 0.12);
  const zoomOut = () => setZoom(scale - 0.12);
  const resetView = () => {
    setScale(1);
    setTranslate({ x: 0, y: 0 });
  };

  return (
    <div className="graph-container">
      {title && <div className="graph-title">{title}</div>}

      <div className="graph-stats">
        <span className="stat">{resources.length} resources</span>
        <span className="stat">{rawEdges.length} dependencies</span>
        {diffMap && (
          <>
            <span className="stat stat-added">
              {[...diffMap.values()].filter(d => d.status === 'added').length} added
            </span>
            <span className="stat stat-removed">
              {[...diffMap.values()].filter(d => d.status === 'removed').length} removed
            </span>
            <span className="stat stat-modified">
              {[...diffMap.values()].filter(d => d.status === 'modified').length} modified
            </span>
          </>
        )}
      </div>

      <div className="graph-flow">
        <div
          className={`tree-canvas-wrap ${panStart ? 'panning' : ''}`}
          onWheel={(event) => {
            event.preventDefault();
            const delta = event.deltaY > 0 ? -0.1 : 0.1;
            setZoom(scale + delta);
          }}
          onMouseDown={(event) => {
            if (event.button !== 0) return;
            setPanStart({
              pointerX: event.clientX,
              pointerY: event.clientY,
              originX: translate.x,
              originY: translate.y,
            });
          }}
          onMouseMove={(event) => {
            if (!panStart) return;
            setTranslate({
              x: panStart.originX + (event.clientX - panStart.pointerX),
              y: panStart.originY + (event.clientY - panStart.pointerY),
            });
          }}
          onMouseUp={() => setPanStart(null)}
          onMouseLeave={() => setPanStart(null)}
        >
          <div className="tree-overlay-controls">
            <div className="tree-zoom-controls">
              <button type="button" onClick={zoomIn} aria-label="Zoom in">+</button>
              <button type="button" onClick={zoomOut} aria-label="Zoom out">-</button>
              <button type="button" onClick={resetView} aria-label="Reset tree view">Reset</button>
            </div>

            <div className="tree-link-legend" aria-label="Tree dependency legend">
              <div className="tree-link-legend-row">
                <span className="tree-link-sample" />
                <span>Primary tree dependency</span>
              </div>
              <div className="tree-link-legend-row">
                <span className="tree-link-sample tree-link-sample-extra" />
                <span>Additional dependency edge</span>
              </div>
            </div>
          </div>

          <svg
            className="tree-canvas"
            width={Math.max(layout.width + 320, 1200)}
            height={Math.max(layout.height + 220, 700)}
            role="img"
            aria-label="Resource dependency tree"
          >
            <g transform={`translate(${translate.x + 32}, ${translate.y + 22}) scale(${scale})`}>
              <g>
                {layout.links.map((link, index) => (
                  <path
                    key={`${link.sourceId}-${link.targetId}-${index}`}
                    d={linkPath(link.sourceX, link.sourceY, link.targetX, link.targetY)}
                    className={link.isExtra ? 'tree-link tree-link-extra' : 'tree-link'}
                  />
                ))}
              </g>

              <g>
                {layout.nodes.map((node) => (
                  <g
                    key={node.id}
                    transform={`translate(${node.y}, ${node.x})`}
                    className={`tree-node ${getStatusClass(node.diff)}`}
                    onClick={() =>
                      setSelectedResource({
                        resource: node.resource,
                        diff: node.diff,
                      })
                    }
                  >
                    <rect width={NODE_WIDTH} height={NODE_HEIGHT} rx={12} ry={12} className="tree-node-card" />
                    <image href={node.iconUrl} x={12} y={12} width={32} height={32} />
                    <text x={52} y={28} className="tree-node-name">
                      <title>{node.resource.name}</title>
                      {truncateLabel(node.resource.shortName, 28)}
                    </text>
                    <text x={52} y={46} className="tree-node-type">
                      <title>{node.resource.shortType}</title>
                      {truncateLabel(node.resource.shortType, 26)}
                    </text>
                    <text x={12} y={64} className="tree-node-provider">
                      <title>{node.resource.type}</title>
                      {truncateLabel(node.resource.type.split('/').slice(0, -1).join('/'), 38)}
                    </text>
                  </g>
                ))}
              </g>
            </g>
          </svg>
        </div>
      </div>

      {selectedResource && (
        <ResourceDetails
          resource={selectedResource.resource}
          diff={selectedResource.diff}
          onClose={() => setSelectedResource(null)}
        />
      )}
    </div>
  );
}
