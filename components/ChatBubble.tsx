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
        className={`max-w-[72%] rounded-3xl px-6 py-5 shadow-xl transition-all duration-300 backdrop-blur ${
          isUser
            ? 'bg-gradient-to-br from-cyan-500/80 via-blue-500/80 to-indigo-500/80 text-white shadow-cyan-500/30'
            : 'bg-white/8 text-slate-100 border border-white/15 shadow-blue-900/30'
        }`}
      >
        <p className="text-sm leading-relaxed whitespace-pre-wrap tracking-wide">
          {message}
        </p>

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