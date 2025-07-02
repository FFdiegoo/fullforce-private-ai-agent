import { useRouter } from 'next/router';
import { useState, useEffect, useRef } from 'react';
import ChatHeader from '../components/ChatHeader';
import ChatBubble from '../components/ChatBubble';
import ChatInputWithSelector from '../components/ChatInputWithSelector';
import ChatSidebar from '../components/ChatSidebar';
import SystemNotice from '../components/SystemNotice';
import { useChatSession } from '../hooks/useChatSession';

type ChatMode = 'technical' | 'procurement';

export default function ChatEnhancedPage() {
  const router = useRouter();
  const { mode } = router.query;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const validMode = (mode === 'technical' || mode === 'procurement') ? mode as ChatMode : 'technical';
  
  const {
    currentSessionId,
    messages,
    loading,
    sendMessage,
    loadSession,
    startNewChat
  } = useChatSession(validMode);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async (text: string, model: 'simple' | 'complex') => {
    // Dynamically select the endpoint based on the model
    const endpoint = model === 'complex' ? '/api/chat-rag' : '/api/chat-with-context';
    await sendMessage(text, model, endpoint);
  };

  const handleSessionSelect = (sessionId: string) => {
    loadSession(sessionId);
    setSidebarOpen(false);
  };

  const handleNewChat = () => {
    startNewChat();
    setSidebarOpen(false);
  };

  return (
    <div className="flex h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      {/* Chat Sidebar */}
      <ChatSidebar
        isOpen={sidebarOpen}
        onToggle={() => setSidebarOpen(!sidebarOpen)}
        currentSessionId={currentSessionId || undefined}
        onSessionSelect={handleSessionSelect}
        onNewChat={handleNewChat}
        mode={validMode}
      />

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col">
        {/* Header with sidebar toggle */}
        <div className="bg-white/80 backdrop-blur-sm shadow-lg border-b border-gray-200">
          <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
            <div className="flex items-center">
              <button
                onClick={() => setSidebarOpen(!sidebarOpen)}
                className="mr-4 p-2 rounded-lg hover:bg-gray-100 transition-colors"
                title="Toggle chat history"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
              </button>
              <div>
                <h1 className="text-2xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
                  {validMode === 'technical' ? 'CeeS Enhanced' : 'ChriS Enhanced'}
                </h1>
                <p className="text-gray-600 text-sm mt-1">
                  {validMode === 'technical' 
                    ? 'Your expert for technical questions and documentation'
                    : 'Your specialist for procurement and supplier information'}
                </p>
              </div>
            </div>
            <button
              onClick={() => router.push('/select-assistant')}
              className="px-4 py-2 rounded-xl bg-gray-100 text-gray-700 hover:bg-gray-200 transition-colors duration-200"
            >
              Switch Assistant
            </button>
          </div>
        </div>
        
        {/* Messages Area */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div className="max-w-4xl mx-auto">
            {messages.length === 0 && (
              <div className="text-center py-12">
                <h2 className="text-2xl font-semibold text-gray-700 mb-2">
                  {validMode === 'technical' ? 'Welcome to CeeS Enhanced' : 'Welcome to ChriS Enhanced'}
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
            {loading && (
              <SystemNotice text={`${validMode === 'technical' ? 'CeeS' : 'ChriS'} is aan het typen...`} />
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Area */}
        <div className="border-t border-gray-200 bg-white/80 backdrop-blur-sm">
          <div className="max-w-4xl mx-auto w-full">
            <ChatInputWithSelector
              onSendMessage={handleSendMessage}
              disabled={loading}
            />
          </div>
        </div>
      </div>
    </div>
  );
}