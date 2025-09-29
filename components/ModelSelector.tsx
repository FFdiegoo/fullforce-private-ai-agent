import React from 'react';

interface ModelSelectorProps {
  selectedModel: 'simple' | 'complex';
  onModelChange: (model: 'simple' | 'complex') => void;
  disabled?: boolean;
}

export default function ModelSelector({ selectedModel, onModelChange, disabled }: ModelSelectorProps) {
  return (
    <div className="inline-flex bg-white/5 border border-white/10 rounded-2xl p-1 backdrop-blur shadow-inner shadow-blue-900/20">
      <button
        type="button"
        onClick={() => onModelChange('simple')}
        disabled={disabled}
        className={`px-4 py-2 rounded-xl text-[0.7rem] font-semibold tracking-[0.2em] uppercase transition-all duration-200 ${
          selectedModel === 'simple'
            ? 'bg-gradient-to-r from-cyan-500/80 to-blue-500/80 text-white shadow-lg shadow-cyan-500/30'
            : 'text-slate-200 hover:text-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        Simpele vragen
      </button>
      <button
        type="button"
        onClick={() => onModelChange('complex')}
        disabled={disabled}
        className={`px-4 py-2 rounded-xl text-[0.7rem] font-semibold tracking-[0.2em] uppercase transition-all duration-200 ${
          selectedModel === 'complex'
            ? 'bg-gradient-to-r from-indigo-500/80 to-purple-500/80 text-white shadow-lg shadow-indigo-500/30'
            : 'text-slate-200 hover:text-white'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        Complexe vragen
      </button>
    </div>
  );
}