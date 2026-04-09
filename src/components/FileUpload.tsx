import { useCallback, useRef, useState } from 'react';

interface FileUploadProps {
  label: string;
  onFileLoaded: (content: string, fileName: string) => void;
  accept?: string;
  fileName?: string;
  onClear?: () => void;
}

export default function FileUpload({
  label,
  onFileLoaded,
  accept = '.json',
  fileName,
  onClear,
}: FileUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  const handleFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        onFileLoaded(text, file.name);
      };
      reader.readAsText(file);
    },
    [onFileLoaded]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      const file = e.dataTransfer.files[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) handleFile(file);
    },
    [handleFile]
  );

  return (
    <div
      className={`file-upload ${dragOver ? 'drag-over' : ''} ${fileName ? 'has-file' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
      onClick={() => !fileName && inputRef.current?.click()}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        onChange={handleChange}
        style={{ display: 'none' }}
      />
      {fileName ? (
        <div className="file-loaded">
          <span className="file-icon">📄</span>
          <div className="file-info">
            <span className="file-label">{label}</span>
            <span className="file-name">{fileName}</span>
          </div>
          {onClear && (
            <button
              className="clear-btn"
              onClick={(e) => {
                e.stopPropagation();
                onClear();
                if (inputRef.current) inputRef.current.value = '';
              }}
              title="Remove file"
            >
              ✕
            </button>
          )}
        </div>
      ) : (
        <div className="upload-prompt">
          <span className="upload-icon">⬆</span>
          <span className="upload-label">{label}</span>
          <span className="upload-hint">Drop a JSON file or click to browse</span>
        </div>
      )}
    </div>
  );
}
