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
        className={`max-w-[70%] rounded-lg p-4 shadow-md transform transition-all duration-200 hover:shadow-lg ${
          isUser
            ? 'bg-primary text-white'
            : 'bg-white text-gray-800 border border-secondary/20'
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