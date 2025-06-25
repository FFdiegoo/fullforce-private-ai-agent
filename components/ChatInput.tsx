import React, { useState } from 'react';
import FileUploadDropzone from './FileUploadDropzone';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');
  const [showUpload, setShowUpload] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: Do nothing, let default behavior add new line
        // But since this is an input field, we need to convert to textarea for multiline
        return;
      } else {
        // Regular Enter: Submit the form
        e.preventDefault();
        handleSubmit(e);
      }
    }
  };

  const handleUploadSuccess = (filename: string) => {
    setShowUpload(false);
    // Send a system message about the upload
    onSendMessage(`📎 Document geüpload: ${filename} (wacht op admin goedkeuring)`);
  };

  const handleUploadError = (error: string) => {
    alert(`Upload fout: ${error}`);
  };

  return (
    <div className="p-6 space-y-4">
      {/* File Upload Section */}
      {showUpload && (
        <div className="bg-white rounded-2xl border border-gray-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-gray-700">Document uploaden</h3>
            <button
              onClick={() => setShowUpload(false)}
              className="text-gray-400 hover:text-gray-600 text-sm"
            >
              ✕
            </button>
          </div>
          <FileUploadDropzone
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
          />
          <p className="text-xs text-gray-500 mt-2">
            Geüploade documenten worden eerst door een admin beoordeeld voordat ze beschikbaar zijn voor de AI.
          </p>
        </div>
      )}

      {/* Message Input */}
      <form onSubmit={handleSubmit}>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setShowUpload(!showUpload)}
            disabled={disabled}
            className={`px-3 rounded-2xl transition-all duration-200 ${
              showUpload
                ? 'bg-indigo-100 text-indigo-600'
                : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Upload document"
          >
            📎
          </button>
          
          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Typ je bericht"
            disabled={disabled}
            rows={1}
            className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm resize-none min-h-[56px] max-h-32 overflow-y-auto"
            style={{
              height: 'auto',
              minHeight: '56px'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 128) + 'px';
            }}
          />
          
          <button
            type="submit"
            disabled={!message.trim() || disabled}
            className={`px-8 rounded-2xl font-medium ${
              !message.trim() || disabled
                ? 'bg-gray-200 cursor-not-allowed text-gray-500'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 hover:opacity-90 text-white transform hover:scale-[1.02]'
            } transition-all duration-200`}
          >
            Send
          </button>
        </div>
        
        {/* Keyboard shortcut hint */}
        <div className="mt-2 text-xs text-gray-500 text-center">
          <span className="bg-gray-100 px-2 py-1 rounded">Shift+Enter</span> voor nieuwe regel • <span className="bg-gray-100 px-2 py-1 rounded">Enter</span> om te versturen
        </div>
      </form>
    </div>
  );
}