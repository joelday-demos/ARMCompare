import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';
import type { ParsedResource } from '../types/arm';
import type { DiffResult } from '../types/arm';

export interface GraphNode extends Record<string, unknown> {
  resource: ParsedResource;
  diff?: DiffResult;
}

const NODE_WIDTH = 280;
const NODE_HEIGHT = 100;

/**
 * Use dagre to auto-layout nodes in a top-to-bottom hierarchy.
 */
export function layoutGraph(
  resources: ParsedResource[],
  edges: { from: string; to: string }[],
  diffMap?: Map<string, DiffResult>
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });

  for (const resource of resources) {
    g.setNode(resource.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  for (const edge of edges) {
    g.setEdge(edge.from, edge.to);
  }

  dagre.layout(g);

  const flowNodes: Node[] = resources.map((resource) => {
    const nodeWithPosition = g.node(resource.id);
    const diff = diffMap?.get(resource.id);
    return {
      id: resource.id,
      type: 'resourceNode',
      position: {
        x: nodeWithPosition.x - NODE_WIDTH / 2,
        y: nodeWithPosition.y - NODE_HEIGHT / 2,
      },
      data: { resource, diff } as GraphNode,
    };
  });

  const flowEdges: Edge[] = edges.map((edge, i) => {
    const diff = diffMap?.get(edge.to);
    let edgeStyle = {};
    let animated = false;

    if (diff) {
      switch (diff.status) {
        case 'added':
          edgeStyle = { stroke: '#22c55e', strokeWidth: 2 };
          animated = true;
          break;
        case 'removed':
          edgeStyle = { stroke: '#ef4444', strokeWidth: 2, strokeDasharray: '5 5' };
          break;
        case 'modified':
          edgeStyle = { stroke: '#f59e0b', strokeWidth: 2 };
          break;
        default:
          edgeStyle = { stroke: '#64748b', strokeWidth: 1.5 };
      }
    } else {
      edgeStyle = { stroke: '#64748b', strokeWidth: 1.5 };
    }

    return {
      id: `e-${i}-${edge.from}-${edge.to}`,
      source: edge.from,
      target: edge.to,
      style: edgeStyle,
      animated,
      type: 'smoothstep',
    };
  });

  return { nodes: flowNodes, edges: flowEdges };
}
