import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import ChatHeader from '../components/ChatHeader';
import ChatBubble from '../components/ChatBubble';
import ChatInputWithSelector from '../components/ChatInputWithSelector';
import SystemNotice from '../components/SystemNotice';

interface Message {
  text: string;
  isUser: boolean;
  modelUsed?: string;
}

type ChatMode = 'technical' | 'procurement';

export default function ChatPage() {
  const router = useRouter();
  const { mode } = router.query;
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const validMode = (mode === 'technical' || mode === 'procurement') ? mode as ChatMode : 'technical';

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text: string, model: 'simple' | 'complex') => {
    setIsLoading(true);
    setMessages(prev => [...prev, { text, isUser: true }]);

    try {
      const response = await fetch('/api/chat-enhanced', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: text, mode: validMode, model }),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data = await response.json();
      
      // Check of we een error response hebben
      if (data.error) {
        throw new Error(data.error);
      }

      setMessages(prev => [...prev, { 
        text: data.reply, 
        isUser: false,
        modelUsed: data.modelUsed 
      }]);
    } catch (error) {
      console.error('Error:', error);
      setMessages(prev => [...prev, { 
        text: 'Sorry, er is een fout opgetreden. Probeer het later opnieuw.',
        isUser: false 
      }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <ChatHeader mode={validMode} />
      
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <div className="max-w-4xl mx-auto">
          {messages.length === 0 && (
            <div className="text-center py-12">
              <h2 className="text-2xl font-semibold text-gray-700 mb-2">
                {validMode === 'technical' ? 'Welcome to CeeS' : 'Welcome to ChriS'}
              </h2>
              <p className="text-gray-500 mb-4">
                {validMode === 'technical' 
                  ? 'Ask me anything about technical documentation and support'
                  : 'Ask me about procurement and parts information'}
              </p>
              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 max-w-md mx-auto">
                <p className="text-sm text-blue-700">
                  <strong>Nieuw:</strong> Kies tussen "Simpele vragen" (GPT-4 Turbo) en "Complexe vragen" (GPT-4.1) voor optimale resultaten!
                </p>
              </div>
            </div>
          )}
          {messages.map((message, index) => (
            <div key={index}>
              <ChatBubble
                message={message.text}
                isUser={message.isUser}
              />
              {!message.isUser && message.modelUsed && (
                <div className="text-xs text-gray-400 text-right mr-4 mb-2">
                  Powered by {message.modelUsed}
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <SystemNotice text="CeeS is aan het typen..." />
          )}
          <div ref={messagesEndRef} />
        </div>
      </div>

      <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm">
        <div className="max-w-4xl mx-auto w-full">
          <ChatInputWithSelector
            onSendMessage={handleSendMessage}
            disabled={isLoading}
          />
        </div>
      </div>
    </div>
  );
}