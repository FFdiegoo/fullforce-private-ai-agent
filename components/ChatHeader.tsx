import React from 'react';
import Image from 'next/image';
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
    <div className="bg-primary text-white shadow-lg">
      <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
        <div className="flex items-center">
          <Image
            src="/csrental-logo.svg"
            alt="CSRental logo"
            width={32}
            height={32}
            className="mr-3"
          />
          <div>
            <h1 className="text-2xl font-bold">{title}</h1>
            <p className="text-white/80 text-sm mt-1">{description}</p>
          </div>
        </div>
        <button
          onClick={() => router.push('/select-assistant')}
          className="px-4 py-2 rounded-lg bg-secondary text-white hover:bg-secondary/90 transition-colors duration-200"
        >
          Switch Assistant
        </button>
      </div>
    </div>
  );
}