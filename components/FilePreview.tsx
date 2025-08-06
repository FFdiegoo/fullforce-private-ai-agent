import React from 'react';

interface FilePreviewProps {
  file: File;
  onRemove?: () => void;
  showDetails?: boolean;
}

export default function FilePreview({ file, onRemove, showDetails = true }: FilePreviewProps) {
  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const getFileIcon = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return '📄';
    if (mimeType.includes('word')) return '📝';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return '📊';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return '📊';
    if (mimeType.includes('image')) return '🖼️';
    if (mimeType.includes('text')) return '📄';
    if (mimeType.includes('csv')) return '📊';
    return '📄';
  };

  const getFileTypeLabel = (mimeType: string): string => {
    if (mimeType.includes('pdf')) return 'PDF';
    if (mimeType.includes('word')) return 'Word';
    if (mimeType.includes('excel') || mimeType.includes('spreadsheet')) return 'Excel';
    if (mimeType.includes('powerpoint') || mimeType.includes('presentation')) return 'PowerPoint';
    if (mimeType.includes('image')) return 'Image';
    if (mimeType.includes('text')) return 'Text';
    if (mimeType.includes('csv')) return 'CSV';
    return 'Document';
  };

  const isValidFileType = (mimeType: string): boolean => {
    const supportedTypes = [
      'application/pdf',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'text/plain',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'image/jpeg',
      'image/png',
      'image/gif'
    ];
    return supportedTypes.includes(mimeType);
  };

  const isValidSize = (size: number): boolean => {
    return size <= 1024 * 1024 * 1024; // 1GB
  };

  const isValid = isValidFileType(file.type) && isValidSize(file.size);

  return (
    <div className={`
      relative bg-white border-2 rounded-xl p-4 transition-all duration-200
      ${isValid 
        ? 'border-gray-200 hover:border-indigo-300 hover:shadow-md' 
        : 'border-red-300 bg-red-50'
      }
    `}>
      {/* Remove Button */}
      {onRemove && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full text-xs hover:bg-red-600 transition-colors flex items-center justify-center"
          title="Remove file"
        >
          ×
        </button>
      )}

      <div className="flex items-start space-x-3">
        {/* File Icon */}
        <div className={`
          flex-shrink-0 w-12 h-12 rounded-lg flex items-center justify-center
          ${isValid ? 'bg-gray-100' : 'bg-red-100'}
        `}>
          <span className="text-2xl">{getFileIcon(file.type)}</span>
        </div>

        {/* File Info */}
        <div className="flex-1 min-w-0">
          <div className="font-medium text-gray-900 truncate" title={file.name}>
            {file.name}
          </div>
          
          {showDetails && (
            <div className="mt-1 space-y-1">
              <div className="flex items-center space-x-4 text-sm text-gray-500">
                <span>{formatFileSize(file.size)}</span>
                <span>{getFileTypeLabel(file.type)}</span>
              </div>
              
              <div className="text-xs text-gray-400">
                Last modified: {new Date(file.lastModified).toLocaleDateString()}
              </div>
            </div>
          )}

          {/* Validation Messages */}
          {!isValid && (
            <div className="mt-2 space-y-1">
              {!isValidFileType(file.type) && (
                <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                  ❌ Unsupported file type: {file.type}
                </div>
              )}
              {!isValidSize(file.size) && (
                <div className="text-xs text-red-600 bg-red-100 px-2 py-1 rounded">
                  ❌ File too large: {formatFileSize(file.size)} (max: 1GB)
                </div>
              )}
            </div>
          )}

          {/* Success Indicator */}
          {isValid && (
            <div className="mt-2">
              <div className="text-xs text-green-600 bg-green-100 px-2 py-1 rounded inline-block">
                ✅ Ready for upload
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}