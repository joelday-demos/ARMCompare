import type { DiffResult } from '../types/arm';

interface DiffLegendProps {
  diffs: DiffResult[];
}

export default function DiffLegend({ diffs }: DiffLegendProps) {
  const added = diffs.filter(d => d.status === 'added').length;
  const removed = diffs.filter(d => d.status === 'removed').length;
  const modified = diffs.filter(d => d.status === 'modified').length;
  const unchanged = diffs.filter(d => d.status === 'unchanged').length;

  return (
    <div className="diff-legend">
      <h4>Comparison Summary</h4>
      <div className="legend-items">
        <div className="legend-item">
          <span className="legend-dot added" />
          <span>{added} Added</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot removed" />
          <span>{removed} Removed</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot modified" />
          <span>{modified} Modified</span>
        </div>
        <div className="legend-item">
          <span className="legend-dot unchanged" />
          <span>{unchanged} Unchanged</span>
        </div>
      </div>
    </div>
  );
}
