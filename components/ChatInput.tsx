import React, { useState } from 'react';

interface ChatInputProps {
  onSendMessage: (message: string) => void;
  disabled?: boolean;
}

export default function ChatInput({ onSendMessage, disabled }: ChatInputProps) {
  const [message, setMessage] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (message.trim() && !disabled) {
      onSendMessage(message);
      setMessage('');
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6">
      <div className="flex gap-4">
        <input
          type="text"
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Type your message..."
          disabled={disabled}
          className="flex-1 px-6 py-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
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
    </form>
  );
}