import { useMemo, useState } from 'react';

interface RawTemplateViewerProps {
  title: string;
  rawText: string;
  defaultExpanded?: boolean;
}

interface TokenPart {
  type: 'plain' | 'key' | 'string' | 'number' | 'boolean' | 'null' | 'punctuation';
  value: string;
}

const JSON_TOKEN_REGEX =
  /("(?:\\.|[^"\\])*")(?=\s*:)|("(?:\\.|[^"\\])*")|\b(true|false)\b|\bnull\b|-?\d+(?:\.\d+)?(?:[eE][+\-]?\d+)?|[{}\[\],:]/g;

function tokenizeJson(text: string): TokenPart[] {
  const parts: TokenPart[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = JSON_TOKEN_REGEX.exec(text)) !== null) {
    const [token] = match;
    const start = match.index;

    if (start > lastIndex) {
      parts.push({ type: 'plain', value: text.slice(lastIndex, start) });
    }

    let type: TokenPart['type'] = 'plain';
    if (match[1]) type = 'key';
    else if (match[2]) type = 'string';
    else if (token === 'true' || token === 'false') type = 'boolean';
    else if (token === 'null') type = 'null';
    else if (/^-?\d/.test(token)) type = 'number';
    else if (/^[{}\[\],:]$/.test(token)) type = 'punctuation';

    parts.push({ type, value: token });
    lastIndex = JSON_TOKEN_REGEX.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({ type: 'plain', value: text.slice(lastIndex) });
  }

  return parts;
}

export default function RawTemplateViewer({
  title,
  rawText,
  defaultExpanded = false,
}: RawTemplateViewerProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);

  const formattedJson = useMemo(() => {
    try {
      const parsed = JSON.parse(rawText);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return rawText;
    }
  }, [rawText]);

  const highlightedParts = useMemo(() => tokenizeJson(formattedJson), [formattedJson]);

  return (
    <section className="raw-template-card">
      <header className="raw-template-header">
        <div className="raw-template-title-group">
          <h3>{title}</h3>
          <span className="raw-template-meta">Formatted JSON · {formattedJson.length.toLocaleString()} chars</span>
        </div>
        <button
          className="raw-template-toggle"
          type="button"
          onClick={() => setExpanded((value) => !value)}
          aria-expanded={expanded}
        >
          {expanded ? 'Collapse Raw JSON' : 'Expand Raw JSON'}
        </button>
      </header>

      {expanded && (
        <pre className="raw-template-code" aria-label={`Raw template content for ${title}`}>
          {highlightedParts.map((part, index) => (
            <span key={`${part.type}-${index}`} className={`json-token json-token-${part.type}`}>
              {part.value}
            </span>
          ))}
        </pre>
      )}
    </section>
  );
}