import React, { useState, useRef, useCallback } from 'react';
import { UploadUtils } from '../lib/upload-utils';
import FilePreview from './FilePreview';

interface UploadDropzoneProps {
  onFilesSelected: (files: File[]) => void;
  maxFiles?: number;
  disabled?: boolean;
  className?: string;
}

export default function UploadDropzone({ 
  onFilesSelected, 
  maxFiles = 10, 
  disabled = false,
  className = ''
}: UploadDropzoneProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [validationResults, setValidationResults] = useState<any[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);

  // Drag and drop handlers
  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    
    dragCounterRef.current++;
    setIsDragging(true);
  }, [disabled]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, [disabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (disabled) return;
    
    setIsDragging(false);
    dragCounterRef.current = 0;

    const droppedFiles = Array.from(e.dataTransfer.files);
    handleFileSelection(droppedFiles);
  }, [disabled]);

  // File selection handler
  const handleFileSelection = useCallback((newFiles: File[]) => {
    if (disabled) return;

    // Limit number of files
    const filesToAdd = newFiles.slice(0, maxFiles - selectedFiles.length);
    
    // Validate files
    const validation = UploadUtils.validateBatch([...selectedFiles, ...filesToAdd]);
    
    setSelectedFiles(prev => [...prev, ...validation.valid]);
    setValidationResults(validation.invalid);

    // Notify parent component
    onFilesSelected([...selectedFiles, ...validation.valid]);
  }, [disabled, maxFiles, selectedFiles, onFilesSelected]);

  // Remove file from selection
  const removeFile = useCallback((index: number) => {
    const newFiles = selectedFiles.filter((_, i) => i !== index);
    setSelectedFiles(newFiles);
    onFilesSelected(newFiles);
  }, [selectedFiles, onFilesSelected]);

  // Clear all files
  const clearAllFiles = useCallback(() => {
    setSelectedFiles([]);
    setValidationResults([]);
    onFilesSelected([]);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  }, [onFilesSelected]);

  // Get supported file types for display
  const getSupportedTypesDisplay = () => {
    return [
      { icon: '📄', name: 'PDF' },
      { icon: '📝', name: 'Word' },
      { icon: '📊', name: 'Excel' },
      { icon: '📊', name: 'PowerPoint' },
      { icon: '🖼️', name: 'Images' },
      { icon: '📄', name: 'Text' }
    ];
  };

  const totalSize = selectedFiles.reduce((sum, file) => sum + file.size, 0);
  const estimatedTime = selectedFiles.reduce((sum, file) => 
    sum + UploadUtils.estimateProcessingTime(file.size, file.type), 0
  );

  return (
    <div className={`space-y-6 ${className}`}>
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={UploadUtils.getSupportedTypes().join(',')}
        onChange={(e) => {
          if (e.target.files) {
            handleFileSelection(Array.from(e.target.files));
          }
        }}
        className="hidden"
        disabled={disabled}
      />

      {/* Drop Zone */}
      <div
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        onClick={() => !disabled && fileInputRef.current?.click()}
        className={`
          relative border-2 border-dashed rounded-2xl p-12 cursor-pointer transition-all duration-300
          ${disabled 
            ? 'border-gray-200 bg-gray-50 cursor-not-allowed opacity-50'
            : isDragging 
              ? 'border-indigo-500 bg-indigo-50 scale-[1.02] shadow-lg' 
              : 'border-gray-300 hover:border-indigo-400 hover:bg-gray-50'
          }
        `}
      >
        <div className="text-center">
          <div className="w-20 h-20 mx-auto mb-6 text-gray-400 flex items-center justify-center">
            {isDragging ? (
              <div className="text-4xl animate-bounce text-indigo-500">📁</div>
            ) : (
              <svg className="w-16 h-16" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            )}
          </div>
          
          <h3 className="text-2xl font-bold text-gray-900 mb-2">
            {isDragging ? 'Drop files here' : 'Upload Documents'}
          </h3>
          
          <p className="text-gray-600 mb-6 text-lg">
            {isDragging 
              ? 'Release to add files to upload queue'
              : disabled
                ? 'Upload is currently disabled'
                : 'Drag & drop files here or click to browse'
            }
          </p>

          {/* Supported file types */}
          <div className="flex flex-wrap justify-center gap-2 mb-6">
            {getSupportedTypesDisplay().map((type, index) => (
              <span key={index} className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                <span className="mr-1">{type.icon}</span>
                {type.name}
              </span>
            ))}
          </div>

          <div className="text-sm text-gray-500">
            Maximum file size: 1GB • Up to {maxFiles} files • Multiple selection supported
          </div>
        </div>
      </div>

      {/* File Preview Section */}
      {selectedFiles.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-semibold text-gray-900">
              Selected Files ({selectedFiles.length})
            </h3>
            <div className="flex items-center space-x-4">
              <div className="text-sm text-gray-600">
                Total: {UploadUtils.formatFileSize(totalSize)}
                {estimatedTime > 0 && (
                  <span className="ml-2">• Est. processing: {Math.round(estimatedTime / 60)}min</span>
                )}
              </div>
              <button
                onClick={clearAllFiles}
                className="px-3 py-1 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              >
                Clear All
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {selectedFiles.map((file, index) => (
              <FilePreview
                key={`${file.name}-${file.size}-${index}`}
                file={file}
                onRemove={() => removeFile(index)}
                showDetails={true}
              />
            ))}
          </div>
        </div>
      )}

      {/* Validation Errors */}
      {validationResults.length > 0 && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-4">
            ❌ Invalid Files ({validationResults.length})
          </h3>
          <div className="space-y-3">
            {validationResults.map((result, index) => (
              <div key={index} className="bg-white border border-red-200 rounded-lg p-3">
                <div className="font-medium text-red-900 mb-1">
                  {result.file.name}
                </div>
                <div className="text-sm text-red-700">
                  {result.errors.join(', ')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Upload Guidelines */}
      <div className="bg-blue-50 border border-blue-200 rounded-xl p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-4">📚 Upload Guidelines</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h4 className="font-medium text-blue-800 mb-2">Supported Formats</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>📄 PDF documents</li>
              <li>📝 Word documents (.doc, .docx)</li>
              <li>📊 Excel spreadsheets (.xls, .xlsx)</li>
              <li>📊 PowerPoint presentations (.ppt, .pptx)</li>
              <li>🖼️ Images (.jpg, .png, .gif, .bmp, .tiff)</li>
              <li>📄 Text files (.txt, .csv, .md, .rtf)</li>
            </ul>
          </div>
          <div>
            <h4 className="font-medium text-blue-800 mb-2">Best Practices</h4>
            <ul className="text-sm text-blue-700 space-y-1">
              <li>• Use descriptive, clear filenames</li>
              <li>• Keep files under 100MB for optimal performance</li>
              <li>• Avoid special characters in filenames</li>
              <li>• Group related documents together</li>
              <li>• Check for duplicates before uploading</li>
              <li>• Ensure documents are final versions</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}