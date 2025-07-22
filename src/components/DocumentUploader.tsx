import { useState, useRef } from 'react';
import { Upload, FileText, X } from 'react-feather';
import './DocumentUploader.scss';

interface DocumentUploaderProps {
  onDocumentsProcessed: (stats: any) => void;
  isProcessing: boolean;
}

export function DocumentUploader({ onDocumentsProcessed, isProcessing }: DocumentUploaderProps) {
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFiles(e.dataTransfer.files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFiles(e.target.files);
    }
  };

  const handleFiles = (files: FileList) => {
    const newFiles = Array.from(files).filter(file => {
      const fileType = file.name.split('.').pop()?.toLowerCase();
      return ['pdf', 'docx', 'doc', 'txt'].includes(fileType || '');
    });
    
    setUploadedFiles(prev => [...prev, ...newFiles]);
  };

  const removeFile = (index: number) => {
    setUploadedFiles(prev => prev.filter((_, i) => i !== index));
  };

  const processFiles = async () => {
    if (uploadedFiles.length === 0) return;
    
    try {
      // Import the document processor dynamically to avoid circular dependencies
      const { default: DocumentProcessor } = await import('../lib/documentProcessor.js');
      const processor = new DocumentProcessor();
      
      const stats = await processor.processUploadedFiles(uploadedFiles);
      onDocumentsProcessed(stats);
      
      // Clear uploaded files after processing
      setUploadedFiles([]);
    } catch (error) {
      console.error('Error processing files:', error);
      alert('Error processing files. Please check the console for details.');
    }
  };

  const getFileIcon = (fileName: string) => {
    const ext = fileName.split('.').pop()?.toLowerCase();
    switch (ext) {
      case 'pdf':
        return '📄';
      case 'docx':
      case 'doc':
        return '📝';
      case 'txt':
        return '📃';
      default:
        return '📎';
    }
  };

  return (
    <div className="document-uploader">
      <div className="upload-section">
        <div
          className={`upload-area ${dragActive ? 'drag-active' : ''}`}
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
        >
          <Upload size={24} />
          <div className="upload-text">
            <strong>Drop files here</strong> or click to browse
          </div>
          <div className="upload-hint">
            Supports PDF, DOCX, DOC, and TXT files
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.doc,.txt"
            onChange={handleFileSelect}
            style={{ display: 'none' }}
          />
        </div>
      </div>

      {uploadedFiles.length > 0 && (
        <div className="files-section">
          <div className="files-header">
            <h4>Uploaded Files ({uploadedFiles.length})</h4>
            <button
              className="process-button"
              onClick={processFiles}
              disabled={isProcessing}
            >
              {isProcessing ? 'Processing...' : 'Process Documents'}
            </button>
          </div>
          
          <div className="files-list">
            {uploadedFiles.map((file, index) => (
              <div key={index} className="file-item">
                <span className="file-icon">{getFileIcon(file.name)}</span>
                <span className="file-name">{file.name}</span>
                <span className="file-size">
                  ({(file.size / 1024 / 1024).toFixed(2)} MB)
                </span>
                <button
                  className="remove-file"
                  onClick={() => removeFile(index)}
                  disabled={isProcessing}
                >
                  <X size={16} />
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="instructions">
        <h4>How to use:</h4>
        <ol>
          <li>Upload your PDF, Word, or text documents</li>
          <li>Click "Process Documents" to extract and index the content</li>
          <li>Start a conversation and ask questions about your documents</li>
          <li>The AI will automatically search through your documents and provide answers with sources</li>
        </ol>
      </div>
    </div>
  );
} 