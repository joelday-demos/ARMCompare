import { useState, useCallback, useMemo } from 'react';
import './App.css';

import type { ArmTemplate, ParsedResource, DiffResult } from './types/arm';
import {
  parseTemplate,
  resolveDependencies,
  validateTemplate,
  extractParameterDefinitions,
  buildEffectiveParameters,
} from './utils/armParser';
import type { ArmParameterDefinition } from './utils/armParser';
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
  parameterDefinitions?: ArmParameterDefinition[];
}

type ParameterValueMap = Record<string, unknown>;

function App() {
  const [mode, setMode] = useState<ViewMode>('single');
  const [template1, setTemplate1] = useState<LoadedTemplate | null>(null);
  const [template2, setTemplate2] = useState<LoadedTemplate | null>(null);
  const [parameterOverrides1, setParameterOverrides1] = useState<ParameterValueMap>({});
  const [parameterOverrides2, setParameterOverrides2] = useState<ParameterValueMap>({});
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
          parameterDefinitions: extractParameterDefinitions(parsed),
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
      if (loaded) {
        setTemplate1(loaded);
        setParameterOverrides1({});
      }
    },
    [loadTemplate]
  );

  const handleTemplate2 = useCallback(
    (content: string, fileName: string) => {
      const loaded = loadTemplate(content, fileName);
      if (loaded) {
        setTemplate2(loaded);
        setParameterOverrides2({});
      }
    },
    [loadTemplate]
  );

  const renderedTemplate1 = useMemo(() => {
    if (!template1 || template1.sourceFormat !== 'arm' || !template1.template) return template1;
    const resources = parseTemplate(template1.template, { parameterValues: parameterOverrides1 });
    const edges = resolveDependencies(resources);
    return {
      ...template1,
      resources,
      edges,
    };
  }, [template1, parameterOverrides1]);

  const renderedTemplate2 = useMemo(() => {
    if (!template2 || template2.sourceFormat !== 'arm' || !template2.template) return template2;
    const resources = parseTemplate(template2.template, { parameterValues: parameterOverrides2 });
    const edges = resolveDependencies(resources);
    return {
      ...template2,
      resources,
      edges,
    };
  }, [template2, parameterOverrides2]);

  const effectiveParams1 = useMemo(() => {
    if (!template1?.template || template1.sourceFormat !== 'arm') return {} as ParameterValueMap;
    return buildEffectiveParameters(template1.template, parameterOverrides1);
  }, [template1, parameterOverrides1]);

  const effectiveParams2 = useMemo(() => {
    if (!template2?.template || template2.sourceFormat !== 'arm') return {} as ParameterValueMap;
    return buildEffectiveParameters(template2.template, parameterOverrides2);
  }, [template2, parameterOverrides2]);

  const castParameterValue = useCallback((rawValue: string, definition: ArmParameterDefinition): unknown => {
    const type = definition.type.toLowerCase();

    if (type === 'int') {
      const parsed = Number(rawValue);
      return Number.isFinite(parsed) ? parsed : 0;
    }

    if (type === 'bool' || type === 'boolean') {
      return rawValue === 'true';
    }

    return rawValue;
  }, []);

  const renderParameterControls = useCallback((
    label: string,
    loaded: LoadedTemplate | null,
    effectiveValues: ParameterValueMap,
    setOverrides: React.Dispatch<React.SetStateAction<ParameterValueMap>>,
    castValue: (raw: string, definition: ArmParameterDefinition) => unknown,
  ) => {
    if (!loaded || loaded.sourceFormat !== 'arm' || !loaded.parameterDefinitions || loaded.parameterDefinitions.length === 0) {
      return null;
    }

    return (
      <div className="parameter-controls-card">
        <div className="parameter-controls-title">{label}: Parameter Values</div>
        <div className="parameter-controls-grid">
          {loaded.parameterDefinitions.map((parameter) => {
            const value = effectiveValues[parameter.name];
            const allowedValues = parameter.allowedValues ?? [];
            const type = parameter.type.toLowerCase();

            return (
              <label key={parameter.name} className="parameter-control">
                <span className="parameter-label">{parameter.name}</span>
                {parameter.description && <span className="parameter-description">{parameter.description}</span>}

                {allowedValues.length > 0 ? (
                  <select
                    className="parameter-input"
                    value={String(value ?? '')}
                    onChange={(event) => {
                      const nextValue = castValue(event.target.value, parameter);
                      setOverrides((prev) => ({ ...prev, [parameter.name]: nextValue }));
                    }}
                  >
                    {allowedValues.map((optionValue, index) => (
                      <option key={`${parameter.name}-${index}`} value={String(optionValue)}>
                        {String(optionValue)}
                      </option>
                    ))}
                  </select>
                ) : type === 'bool' || type === 'boolean' ? (
                  <select
                    className="parameter-input"
                    value={String(Boolean(value))}
                    onChange={(event) => {
                      const nextValue = castValue(event.target.value, parameter);
                      setOverrides((prev) => ({ ...prev, [parameter.name]: nextValue }));
                    }}
                  >
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    className="parameter-input"
                    type={type === 'int' ? 'number' : 'text'}
                    value={value === undefined || value === null ? '' : String(value)}
                    min={parameter.minValue}
                    max={parameter.maxValue}
                    onChange={(event) => {
                      const nextValue = castValue(event.target.value, parameter);
                      setOverrides((prev) => ({ ...prev, [parameter.name]: nextValue }));
                    }}
                  />
                )}
              </label>
            );
          })}
        </div>
      </div>
    );
  }, []);

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
    if (mode !== 'compare' || !renderedTemplate1 || !renderedTemplate2) {
      return { diffs: [] as DiffResult[], diffMap: undefined, combinedResources: [] as ParsedResource[], combinedEdges: [] as { from: string; to: string }[] };
    }

    const diffs = diffTemplates(renderedTemplate1.resources, renderedTemplate2.resources);
    const diffMap = buildDiffMap(diffs);

    const resourceMap = new Map<string, ParsedResource>();
    for (const r of renderedTemplate1.resources) resourceMap.set(r.id, r);
    for (const r of renderedTemplate2.resources) resourceMap.set(r.id, r);
    const combinedResources = [...resourceMap.values()];

    const edgeSet = new Set<string>();
    const combinedEdges: { from: string; to: string }[] = [];
    for (const e of [...renderedTemplate1.edges, ...renderedTemplate2.edges]) {
      const key = `${e.from}|${e.to}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        combinedEdges.push(e);
      }
    }

    return { diffs, diffMap, combinedResources, combinedEdges };
  }, [mode, renderedTemplate1, renderedTemplate2]);

  const activeTemplate = renderedTemplate1;
  const showGraph = mode === 'single' ? !!activeTemplate : !!(renderedTemplate1 && renderedTemplate2);
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
                fileName={renderedTemplate1?.fileName}
                fileTypeLabel={renderedTemplate1 ? renderedTemplate1.sourceFormat.toUpperCase() : undefined}
                onClear={() => {
                  setTemplate1(null);
                  setParameterOverrides1({});
                }}
              />
              {mode === 'compare' && (
                <FileUpload
                  label="Updated Template (right)"
                  onFileLoaded={handleTemplate2}
                  accept=".json,.bicep"
                  fileName={renderedTemplate2?.fileName}
                  fileTypeLabel={renderedTemplate2 ? renderedTemplate2.sourceFormat.toUpperCase() : undefined}
                  onClear={() => {
                    setTemplate2(null);
                    setParameterOverrides2({});
                  }}
                />
              )}
            </div>

            {mode === 'compare' && renderedTemplate1 && renderedTemplate2 && renderedTemplate1.sourceFormat !== renderedTemplate2.sourceFormat && (
              <div className="comparison-mode-note">
                Comparing across formats: {renderedTemplate1.sourceFormat.toUpperCase()} vs {renderedTemplate2.sourceFormat.toUpperCase()}
              </div>
            )}

            <div className={`parameter-controls-wrap ${mode === 'compare' ? 'compare' : ''}`}>
              {renderParameterControls(
                mode === 'compare' ? 'Base Template' : 'Template',
                renderedTemplate1,
                effectiveParams1,
                setParameterOverrides1,
                castParameterValue,
              )}
              {mode === 'compare' && renderParameterControls(
                'Updated Template',
                renderedTemplate2,
                effectiveParams2,
                setParameterOverrides2,
                castParameterValue,
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
                      onClick={() => loadSample(i, !renderedTemplate1 ? 1 : 2)}
                    >
                      {sample.name}
                      <span className="sample-desc">{sample.description}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {(renderedTemplate1 || (mode === 'compare' && renderedTemplate2)) && (
              <div className={`raw-templates-grid ${mode === 'compare' ? 'compare' : ''}`}>
                {renderedTemplate1 && (
                  <RawTemplateViewer
                    title={mode === 'compare' ? `Base: ${renderedTemplate1.fileName}` : renderedTemplate1.fileName}
                    rawText={renderedTemplate1.rawText}
                  />
                )}
                {mode === 'compare' && renderedTemplate2 && (
                  <RawTemplateViewer
                    title={`Updated: ${renderedTemplate2.fileName}`}
                    rawText={renderedTemplate2.rawText}
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

          {mode === 'compare' && renderedTemplate1 && renderedTemplate2 && (
            <DependencyGraph
              resources={combinedResources}
              edges={combinedEdges}
              diffMap={diffMap}
              title={`${renderedTemplate1.fileName}  →  ${renderedTemplate2.fileName}`}
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
