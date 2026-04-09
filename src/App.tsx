import { useState, useCallback, useMemo } from 'react';
import './App.css';

import type { ArmTemplate, ParsedResource, DiffResult } from './types/arm';
import { parseTemplate, resolveDependencies, validateTemplate } from './utils/armParser';
import { diffTemplates, buildDiffMap } from './utils/templateDiff';
import FileUpload from './components/FileUpload';
import DependencyGraph from './components/DependencyGraph';
import DiffLegend from './components/DiffLegend';
import sampleTemplates from './data/sampleTemplates.json';

type ViewMode = 'single' | 'compare';

interface LoadedTemplate {
  template: ArmTemplate;
  fileName: string;
  resources: ParsedResource[];
  edges: { from: string; to: string }[];
}

function App() {
  const [mode, setMode] = useState<ViewMode>('single');
  const [template1, setTemplate1] = useState<LoadedTemplate | null>(null);
  const [template2, setTemplate2] = useState<LoadedTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadTemplate = useCallback(
    (content: string, fileName: string): LoadedTemplate | null => {
      try {
        const parsed = JSON.parse(content);
        if (!validateTemplate(parsed)) {
          setError('Invalid ARM template: must contain a "resources" array.');
          return null;
        }
        setError(null);
        const resources = parseTemplate(parsed);
        const edges = resolveDependencies(resources);
        return { template: parsed, fileName, resources, edges };
      } catch {
        setError(`Failed to parse "${fileName}". Ensure it is valid JSON.`);
        return null;
      }
    },
    []
  );

  const handleTemplate1 = useCallback(
    (content: string, fileName: string) => {
      const loaded = loadTemplate(content, fileName);
      if (loaded) setTemplate1(loaded);
    },
    [loadTemplate]
  );

  const handleTemplate2 = useCallback(
    (content: string, fileName: string) => {
      const loaded = loadTemplate(content, fileName);
      if (loaded) setTemplate2(loaded);
    },
    [loadTemplate]
  );

  const loadSample = useCallback(
    (index: number, target: 1 | 2) => {
      const sample = sampleTemplates[index];
      const content = JSON.stringify(sample.template);
      const fileName = `${sample.name} (sample)`;
      if (target === 1) handleTemplate1(content, fileName);
      else handleTemplate2(content, fileName);
    },
    [handleTemplate1, handleTemplate2]
  );

  // Comparison results
  const { diffs, diffMap, combinedResources, combinedEdges } = useMemo(() => {
    if (mode !== 'compare' || !template1 || !template2) {
      return { diffs: [] as DiffResult[], diffMap: undefined, combinedResources: [] as ParsedResource[], combinedEdges: [] as { from: string; to: string }[] };
    }

    const diffs = diffTemplates(template1.resources, template2.resources);
    const diffMap = buildDiffMap(diffs);

    const resourceMap = new Map<string, ParsedResource>();
    for (const r of template1.resources) resourceMap.set(r.id, r);
    for (const r of template2.resources) resourceMap.set(r.id, r);
    const combinedResources = [...resourceMap.values()];

    const edgeSet = new Set<string>();
    const combinedEdges: { from: string; to: string }[] = [];
    for (const e of [...template1.edges, ...template2.edges]) {
      const key = `${e.from}|${e.to}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        combinedEdges.push(e);
      }
    }

    return { diffs, diffMap, combinedResources, combinedEdges };
  }, [mode, template1, template2]);

  const activeTemplate = template1;
  const showGraph = mode === 'single' ? !!activeTemplate : !!(template1 && template2);

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
          <h1>
            <span className="logo-icon">🔀</span>
            ARM Template Visualizer
          </h1>
          <p className="subtitle">
            Visualize Azure Resource Manager template dependencies
          </p>
        </div>
        <div className="header-right">
          <div className="mode-toggle">
            <button
              className={`mode-btn ${mode === 'single' ? 'active' : ''}`}
              onClick={() => setMode('single')}
            >
              📊 Visualize
            </button>
            <button
              className={`mode-btn ${mode === 'compare' ? 'active' : ''}`}
              onClick={() => setMode('compare')}
            >
              🔍 Compare
            </button>
          </div>
        </div>
      </header>

      {error && (
        <div className="error-banner">
          <span>⚠️ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      <div className="upload-section">
        <div className="upload-row">
          <FileUpload
            label={mode === 'compare' ? 'Base Template (left)' : 'ARM Template'}
            onFileLoaded={handleTemplate1}
            fileName={template1?.fileName}
            onClear={() => setTemplate1(null)}
          />
          {mode === 'compare' && (
            <FileUpload
              label="Updated Template (right)"
              onFileLoaded={handleTemplate2}
              fileName={template2?.fileName}
              onClear={() => setTemplate2(null)}
            />
          )}
        </div>

        {!showGraph && (
          <div className="samples-section">
            <p className="samples-label">Or try a sample template:</p>
            <div className="sample-buttons">
              {sampleTemplates.map((sample, i) => (
                <button
                  key={i}
                  className="sample-btn"
                  onClick={() => loadSample(i, !template1 ? 1 : 2)}
                >
                  {sample.name}
                  <span className="sample-desc">{sample.description}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {showGraph && (
        <div className="visualization">
          {mode === 'compare' && diffs.length > 0 && <DiffLegend diffs={diffs} />}

          {mode === 'single' && activeTemplate && (
            <DependencyGraph
              resources={activeTemplate.resources}
              edges={activeTemplate.edges}
              title={activeTemplate.fileName}
            />
          )}

          {mode === 'compare' && template1 && template2 && (
            <DependencyGraph
              resources={combinedResources}
              edges={combinedEdges}
              diffMap={diffMap}
              title={`${template1.fileName}  →  ${template2.fileName}`}
            />
          )}
        </div>
      )}

      {!showGraph && (
        <div className="empty-state">
          <div className="empty-icon">📋</div>
          <h2>Upload an ARM Template to get started</h2>
          <p>
            {mode === 'single'
              ? 'Drop a JSON ARM template file above to visualize its resource dependency tree.'
              : 'Upload two ARM template files to compare the resources and see what changed.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
