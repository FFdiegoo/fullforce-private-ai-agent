import React from 'react';
import { useRouter } from 'next/router';

interface ChatHeaderProps {
  mode: 'technical' | 'procurement';
}

export default function ChatHeader({ mode }: ChatHeaderProps) {
  const router = useRouter();
  const title = mode === 'technical' ? 'CeeS - Technical Support' : 'ChriS - Procurement Assistant';
  const description = mode === 'technical' 
    ? 'Your expert for technical questions and documentation'
    : 'Your specialist for procurement and supplier information';

  return (
    <div className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-gray-200">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            {title}
          </h1>
          <p className="text-gray-600 text-sm mt-1">{description}</p>
        </div>
        <button
          onClick={() => router.push('/select-assistant')}
          className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors duration-200"
        >
          Switch Assistant
        </button>
      </div>
    </div>
  );
}