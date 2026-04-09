import type { ParsedResource, DiffResult } from '../types/arm';

interface ResourceDetailsProps {
  resource: ParsedResource;
  diff?: DiffResult;
  onClose: () => void;
}

export default function ResourceDetails({ resource, diff, onClose }: ResourceDetailsProps) {
  return (
    <div className="resource-details">
      <div className="details-header">
        <h3>Resource Details</h3>
        <button className="close-btn" onClick={onClose}>✕</button>
      </div>

      <div className="details-body">
        <div className="detail-group">
          <label>Type</label>
          <code>{resource.type}</code>
        </div>

        <div className="detail-group">
          <label>Name</label>
          <code>{resource.name}</code>
        </div>

        <div className="detail-group">
          <label>API Version</label>
          <code>{resource.apiVersion}</code>
        </div>

        {resource.location && (
          <div className="detail-group">
            <label>Location</label>
            <code>{resource.location}</code>
          </div>
        )}

        {resource.dependsOn.length > 0 && (
          <div className="detail-group">
            <label>Depends On</label>
            <ul className="depends-list">
              {resource.dependsOn.map((dep, i) => (
                <li key={i}><code>{dep}</code></li>
              ))}
            </ul>
          </div>
        )}

        {diff && diff.status === 'modified' && diff.changes && (
          <div className="detail-group">
            <label>Changes ({diff.changes.length})</label>
            <div className="changes-list">
              {diff.changes.map((change, i) => (
                <div key={i} className="change-item">
                  <div className="change-path">{change.path}</div>
                  <div className="change-values">
                    <div className="change-old">
                      <span className="change-label">Old:</span>
                      <code>{JSON.stringify(change.oldValue, null, 2) ?? 'undefined'}</code>
                    </div>
                    <div className="change-new">
                      <span className="change-label">New:</span>
                      <code>{JSON.stringify(change.newValue, null, 2) ?? 'undefined'}</code>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {resource.properties && (
          <div className="detail-group">
            <label>Properties</label>
            <pre className="properties-json">
              {JSON.stringify(resource.properties, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
