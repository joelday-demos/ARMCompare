import { useState, useCallback, useMemo } from 'react';
import './App.css';

import type { ArmTemplate, ParsedResource, DiffResult } from './types/arm';
import { parseTemplate, resolveDependencies, validateTemplate } from './utils/armParser';
import { parseBicepTemplate } from './utils/bicepParser';
import { diffTemplates, buildDiffMap } from './utils/templateDiff';
import FileUpload from './components/FileUpload';
import DependencyGraph from './components/DependencyGraph';
import DiffLegend from './components/DiffLegend';
import RawTemplateViewer from './components/RawTemplateViewer';
import sampleTemplates from './data/sampleTemplates.json';

type ViewMode = 'single' | 'compare';

interface LoadedTemplate {
  template?: ArmTemplate;
  rawText: string;
  fileName: string;
  resources: ParsedResource[];
  edges: { from: string; to: string }[];
  sourceFormat: 'arm' | 'bicep';
}

function App() {
  const [mode, setMode] = useState<ViewMode>('single');
  const [template1, setTemplate1] = useState<LoadedTemplate | null>(null);
  const [template2, setTemplate2] = useState<LoadedTemplate | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [controlsCollapsed, setControlsCollapsed] = useState(false);

  const loadTemplate = useCallback(
    (content: string, fileName: string): LoadedTemplate | null => {
      const lowerFileName = fileName.toLowerCase();

      if (lowerFileName.endsWith('.bicep')) {
        try {
          const { resources, edges } = parseBicepTemplate(content);
          if (resources.length === 0) {
            setError(`No resources were found in "${fileName}". Ensure the Bicep file declares resources.`);
            return null;
          }
          setError(null);
          return {
            fileName,
            rawText: content,
            resources,
            edges,
            sourceFormat: 'bicep',
          };
        } catch {
          setError(`Failed to parse "${fileName}". Ensure it is valid Bicep syntax.`);
          return null;
        }
      }

      try {
        const parsed = JSON.parse(content);
        if (!validateTemplate(parsed)) {
          setError('Invalid ARM template: must contain a "resources" array.');
          return null;
        }
        setError(null);
        const resources = parseTemplate(parsed);
        const edges = resolveDependencies(resources);
        return {
          template: parsed,
          rawText: content,
          fileName,
          resources,
          edges,
          sourceFormat: 'arm',
        };
      } catch {
        setError(`Failed to parse "${fileName}". Upload a valid ARM JSON or .bicep file.`);
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
  const isTopCollapsed = controlsCollapsed && showGraph;

  return (
    <div className="app">
      {isTopCollapsed && (
        <div className="collapsed-controls-bar">
          <span className="collapsed-controls-label">Controls hidden for focus view</span>
          <button
            className="collapse-toggle-btn"
            onClick={() => setControlsCollapsed(false)}
            type="button"
          >
            ▾ Expand Controls
          </button>
        </div>
      )}

      {!isTopCollapsed && (
        <>
          <header className="app-header">
            <div className="header-left">
              <h1>
                <span className="logo-icon">🔀</span>
                ARM/Bicep Template Visualizer
              </h1>
              <p className="subtitle">
                Visualize Azure ARM JSON and Bicep resource dependencies
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

              {showGraph && (
                <button
                  className="collapse-toggle-btn"
                  onClick={() => setControlsCollapsed(true)}
                  type="button"
                >
                  ▴ Collapse Controls
                </button>
              )}
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
                label={mode === 'compare' ? 'Base Template (left)' : 'Template (ARM/Bicep)'}
                onFileLoaded={handleTemplate1}
                accept=".json,.bicep"
                fileName={template1?.fileName}
                fileTypeLabel={template1 ? template1.sourceFormat.toUpperCase() : undefined}
                onClear={() => setTemplate1(null)}
              />
              {mode === 'compare' && (
                <FileUpload
                  label="Updated Template (right)"
                  onFileLoaded={handleTemplate2}
                  accept=".json,.bicep"
                  fileName={template2?.fileName}
                  fileTypeLabel={template2 ? template2.sourceFormat.toUpperCase() : undefined}
                  onClear={() => setTemplate2(null)}
                />
              )}
            </div>

            {mode === 'compare' && template1 && template2 && template1.sourceFormat !== template2.sourceFormat && (
              <div className="comparison-mode-note">
                Comparing across formats: {template1.sourceFormat.toUpperCase()} vs {template2.sourceFormat.toUpperCase()}
              </div>
            )}

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

            {(template1 || (mode === 'compare' && template2)) && (
              <div className={`raw-templates-grid ${mode === 'compare' ? 'compare' : ''}`}>
                {template1 && (
                  <RawTemplateViewer
                    title={mode === 'compare' ? `Base: ${template1.fileName}` : template1.fileName}
                    rawText={template1.rawText}
                  />
                )}
                {mode === 'compare' && template2 && (
                  <RawTemplateViewer
                    title={`Updated: ${template2.fileName}`}
                    rawText={template2.rawText}
                  />
                )}
              </div>
            )}
          </div>
        </>
      )}

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
          <h2>Upload a Template to get started</h2>
          <p>
            {mode === 'single'
              ? 'Drop an ARM JSON or .bicep template file above to visualize its resource dependency tree.'
              : 'Upload two ARM JSON or .bicep files to compare resources and see what changed.'}
          </p>
        </div>
      )}
    </div>
  );
}

export default App;
