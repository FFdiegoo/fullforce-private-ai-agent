import React, { useState } from 'react';
import ModelSelector from './ModelSelector';
import FileUploadDropzone from './FileUploadDropzone';

interface ChatInputWithSelectorProps {
  onSendMessage: (message: string, model: 'simple' | 'complex') => void;
  disabled?: boolean;
}

export default function ChatInputWithSelector({ onSendMessage, disabled }: ChatInputWithSelectorProps) {
  const [message, setMessage] = useState('');
  const [selectedModel, setSelectedModel] = useState<'simple' | 'complex'>('simple');
  const [showUpload, setShowUpload] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message, selectedModel);
      setMessage('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      if (e.shiftKey) {
        // Shift+Enter: Allow default behavior (new line)
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
    onSendMessage(`📎 Document geüpload: ${filename} (wacht op admin goedkeuring)`, selectedModel);
  };

  const handleUploadError = (error: string) => {
    alert(`Upload fout: ${error}`);
  };

  return (
    <div className="p-6 sm:p-8 space-y-6">
      {/* File Upload Section */}
      {showUpload && (
        <div className="bg-slate-950/60 border border-white/10 rounded-2xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold tracking-[0.18em] uppercase text-slate-100">Document uploaden</h3>
            <button
              onClick={() => setShowUpload(false)}
              className="text-slate-400 hover:text-slate-200 text-sm"
            >
              ✕
            </button>
          </div>
          <FileUploadDropzone
            onUploadSuccess={handleUploadSuccess}
            onUploadError={handleUploadError}
          />
          <p className="text-xs text-slate-300/70 mt-3 leading-relaxed">
            Geüploade documenten worden eerst door een admin beoordeeld voordat ze beschikbaar zijn voor de AI.
          </p>
        </div>
      )}

      {/* Message Input */}
      <form onSubmit={handleSubmit}>
        <div className="flex flex-col gap-3 lg:flex-row lg:items-end">
          <ModelSelector
            selectedModel={selectedModel}
            onModelChange={setSelectedModel}
            disabled={disabled}
          />

          <button
            type="button"
            onClick={() => setShowUpload(!showUpload)}
            disabled={disabled}
            className={`px-4 py-4 rounded-2xl border border-white/10 transition-all duration-200 ${
              showUpload
                ? 'bg-white/20 text-slate-100 shadow-inner'
                : 'bg-white/5 hover:bg-white/10 text-slate-200'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            title="Upload document"
          >
            📎
          </button>

          <textarea
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type je bericht... (Shift+Enter voor nieuwe regel, Enter om te versturen)"
            disabled={disabled}
            rows={1}
            className="flex-1 px-6 py-4 rounded-2xl border border-white/10 focus:outline-none focus:ring-2 focus:ring-cyan-400/50 focus:border-transparent transition-all duration-200 bg-slate-950/50 backdrop-blur resize-none min-h-[64px] max-h-[2400px] overflow-y-auto text-slate-100 placeholder:text-slate-500"
            style={{
              height: 'auto',
              minHeight: '56px'
            }}
            onInput={(e) => {
              const target = e.target as HTMLTextAreaElement;
              target.style.height = 'auto';
              target.style.height = Math.min(target.scrollHeight, 2400) + 'px';
            }}
          />

          <div className="flex items-center gap-3 lg:ml-2">
            <button
              type="submit"
              disabled={!message.trim() || disabled}
              className={`px-10 py-4 rounded-2xl font-semibold tracking-[0.2em] uppercase ${
                !message.trim() || disabled
                  ? 'bg-white/10 text-slate-500 cursor-not-allowed'
                  : 'bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 text-white shadow-lg shadow-blue-900/40 transform hover:scale-[1.01]'
              } transition-all duration-300`}
            >
              Verstuur
            </button>
          </div>
        </div>

        {/* Model indicator and keyboard shortcuts */}
        <div className="mt-4 flex flex-col gap-2 text-xs text-slate-300/70 sm:flex-row sm:items-center sm:justify-between">
          <div className="tracking-[0.2em] uppercase">
            {selectedModel === 'simple' ? 'GPT-4 Turbo' : 'GPT-4.1'} geselecteerd
          </div>
          <div className="flex flex-wrap items-center gap-2 text-[0.7rem]">
            <span className="bg-white/10 px-2 py-1 rounded-md border border-white/10 uppercase tracking-[0.25em]">Shift+Enter</span>
            voor nieuwe regel •
            <span className="bg-white/10 px-2 py-1 rounded-md border border-white/10 uppercase tracking-[0.25em]">Enter</span>
            om te versturen
          </div>
        </div>
      </form>
    </div>
  );
}