import React from 'react';

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
}

export default function ChatBubble({ message, isUser }: ChatBubbleProps) {
  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-6 animate-fade-in`}>
      <div
        className={`max-w-[70%] rounded-2xl p-6 shadow-lg transform transition-all duration-200 hover:scale-[1.01] ${
          isUser
            ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
            : 'bg-white dark:bg-gray-800 text-gray-800 dark:text-gray-200 border dark:border-gray-700'
        }`}
      >
        <p className="text-base leading-relaxed whitespace-pre-wrap">{message}</p>
      </div>
    </div>
  );
}