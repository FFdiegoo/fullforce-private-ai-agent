import React from 'react';

interface ModelSelectorProps {
  selectedModel: 'simple' | 'complex';
  onModelChange: (model: 'simple' | 'complex') => void;
  disabled: boolean | undefined;
}

export default function ModelSelector({ selectedModel, onModelChange, disabled }: ModelSelectorProps) {
  return (
    <div className="flex bg-gray-100 rounded-xl p-1 mr-4">
      <button
        type="button"
        onClick={() => onModelChange('simple')}
        disabled={disabled}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          selectedModel === 'simple'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        Simpele vragen
      </button>
      <button
        type="button"
        onClick={() => onModelChange('complex')}
        disabled={disabled}
        className={`px-4 py-2 rounded-lg text-sm font-medium transition-all duration-200 ${
          selectedModel === 'complex'
            ? 'bg-white text-gray-900 shadow-sm'
            : 'text-gray-600 hover:text-gray-900'
        } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        Complexe vragen
      </button>
    </div>
  );
}