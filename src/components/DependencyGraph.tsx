import { useCallback, useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  Background,
  BackgroundVariant,
  MiniMap,
  useNodesState,
  useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import type { ParsedResource, DiffResult } from '../types/arm';
import { layoutGraph } from '../utils/graphLayout';
import type { GraphNode } from '../utils/graphLayout';
import ResourceNode from './ResourceNode';
import ResourceDetails from './ResourceDetails';

interface DependencyGraphProps {
  resources: ParsedResource[];
  edges: { from: string; to: string }[];
  diffMap?: Map<string, DiffResult>;
  title?: string;
}

const nodeTypes = { resourceNode: ResourceNode };

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

  const { nodes: initialNodes, edges: initialEdges } = useMemo(
    () => layoutGraph(resources, rawEdges, diffMap),
    [resources, rawEdges, diffMap]
  );

  const [nodes, , onNodesChange] = useNodesState(initialNodes);
  const [edges, , onEdgesChange] = useEdgesState(initialEdges);

  const onNodeClick = useCallback(
    (_: React.MouseEvent, node: { data: unknown }) => {
      const data = node.data as GraphNode;
      setSelectedResource({
        resource: data.resource,
        diff: data.diff,
      });
    },
    []
  );

  const miniMapNodeColor = useCallback(
    (node: { data: unknown }) => {
      const data = node.data as GraphNode;
      if (data.diff) {
        switch (data.diff.status) {
          case 'added': return '#22c55e';
          case 'removed': return '#ef4444';
          case 'modified': return '#f59e0b';
          default: return '#64748b';
        }
      }
      return '#3b82f6';
    },
    []
  );

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
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
        >
          <Controls />
          <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="#334155" />
          <MiniMap
            nodeColor={miniMapNodeColor}
            maskColor="rgba(15, 23, 42, 0.7)"
            style={{ background: '#1e293b' }}
          />
        </ReactFlow>
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
