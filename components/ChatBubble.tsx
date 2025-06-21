import React from 'react';
import MessageFeedback from './MessageFeedback';

interface ChatBubbleProps {
  message: string;
  isUser: boolean;
  messageId?: string;
  sessionId?: string;
}

export default function ChatBubble({ message, isUser, messageId, sessionId }: ChatBubbleProps) {
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
        
        {/* Show feedback buttons only for AI messages */}
        {!isUser && messageId && sessionId && (
          <MessageFeedback 
            messageId={messageId}
            sessionId={sessionId}
            onFeedbackSubmitted={(type) => {
              console.log(`Feedback submitted: ${type} for message ${messageId}`);
            }}
          />
        )}
      </div>
    </div>
  );
}