import React from 'react';

interface UploadProgressProps {
  fileName: string;
  progress: number;
  status: 'uploading' | 'processing' | 'completed' | 'error';
  speed?: string;
  eta?: string;
  error?: string;
  onCancel?: () => void;
  onRetry?: () => void;
}

export default function UploadProgress({
  fileName,
  progress,
  status,
  speed,
  eta,
  error,
  onCancel,
  onRetry
}: UploadProgressProps) {
  const getStatusColor = () => {
    switch (status) {
      case 'uploading': return 'bg-blue-500';
      case 'processing': return 'bg-yellow-500';
      case 'completed': return 'bg-green-500';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-500';
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'uploading': return '📤';
      case 'processing': return '⚙️';
      case 'completed': return '✅';
      case 'error': return '❌';
      default: return '📄';
    }
  };

  const getStatusText = () => {
    switch (status) {
      case 'uploading': return 'Uploading';
      case 'processing': return 'Processing';
      case 'completed': return 'Completed';
      case 'error': return 'Failed';
      default: return 'Unknown';
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 shadow-sm">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center space-x-3">
          <span className="text-xl">{getStatusIcon()}</span>
          <div>
            <div className="font-medium text-gray-900 truncate max-w-xs">
              {fileName}
            </div>
            <div className="text-sm text-gray-500">
              {getStatusText()}
              {speed && eta && status === 'uploading' && (
                <span className="ml-2">• {speed} • ETA: {eta}</span>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center space-x-2">
          {status === 'uploading' && onCancel && (
            <button
              onClick={onCancel}
              className="p-1 text-gray-400 hover:text-red-600 transition-colors"
              title="Cancel upload"
            >
              ❌
            </button>
          )}
          {status === 'error' && onRetry && (
            <button
              onClick={onRetry}
              className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
              title="Retry upload"
            >
              🔄
            </button>
          )}
        </div>
      </div>

      {/* Progress Bar */}
      {(status === 'uploading' || status === 'processing') && (
        <div className="mb-3">
          <div className="flex justify-between text-xs text-gray-600 mb-1">
            <span>{progress}%</span>
            {status === 'processing' && (
              <span className="animate-pulse">Processing document...</span>
            )}
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div 
              className={`h-2 rounded-full transition-all duration-300 ${getStatusColor()} ${
                status === 'processing' ? 'animate-pulse' : ''
              }`}
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-3">
          <div className="text-sm text-red-800">
            <strong>Error:</strong> {error}
          </div>
        </div>
      )}

      {/* Success Message */}
      {status === 'completed' && (
        <div className="bg-green-50 border border-green-200 rounded-lg p-3">
          <div className="text-sm text-green-800">
            <strong>Success:</strong> Document uploaded and queued for processing
          </div>
        </div>
      )}
    </div>
  );
}