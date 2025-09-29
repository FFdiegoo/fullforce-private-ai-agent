import { useRouter } from 'next/router';
import { useState, useEffect, useRef, useMemo } from 'react';
import ChatBubble from '../components/ChatBubble';
import ChatInputWithSelector from '../components/ChatInputWithSelector';
import ChatSidebar from '../components/ChatSidebar';
import SystemNotice from '../components/SystemNotice';
import { useChatSession } from '../hooks/useChatSession';

type ChatMode = 'technical' | 'procurement';

const backgroundLayers = [
  'bg-[radial-gradient(circle_at_top,_rgba(76,29,149,0.35),_transparent_65%)]',
  'bg-[radial-gradient(circle_at_bottom,_rgba(14,116,144,0.3),_transparent_70%)]',
  'bg-[radial-gradient(circle_at_left,_rgba(2,132,199,0.25),_transparent_60%)]'
];

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

  const assistantMeta = useMemo(
    () =>
      validMode === 'technical'
        ? {
            name: 'CeeS Enhanced',
            description: 'Je technische specialist voor documentatie en support',
            accent: 'from-cyan-400/90 via-blue-500/80 to-indigo-500/90'
          }
        : {
            name: 'ChriS Enhanced',
            description: 'Je inkoop expert voor leveranciers en onderdelen',
            accent: 'from-emerald-400/90 via-cyan-500/80 to-indigo-500/90'
          },
    [validMode]
  );

  const handleSendMessage = async (text: string, model: 'simple' | 'complex') => {
    // Always use the RAG endpoint for all queries
    await sendMessage(text, model, '/api/chat-rag');
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
    <div className="min-h-screen bg-slate-950 text-white relative overflow-hidden">
      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" aria-hidden="true" />
      {backgroundLayers.map((layer, index) => (
        <div key={index} className={`absolute inset-0 ${layer} blur-3xl opacity-90`} aria-hidden="true" />
      ))}

      <div className="relative z-10 flex min-h-screen">
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
        <div
          className={`flex-1 flex flex-col transition-all duration-300 ease-out ${
            sidebarOpen ? 'ml-80' : ''
          } lg:ml-72`}
        >
          <div className="flex-1 flex flex-col px-4 sm:px-8 lg:px-12 py-10">
            <div className="max-w-5xl w-full mx-auto flex flex-col flex-1 gap-6">
              {/* Header with sidebar toggle */}
              <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl shadow-blue-900/20">
                <div className="px-6 sm:px-10 py-6 flex items-start sm:items-center justify-between gap-6">
                  <div className="flex items-start sm:items-center gap-4">
                    <button
                      onClick={() => setSidebarOpen(!sidebarOpen)}
                      className="flex-shrink-0 p-3 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 transition-colors duration-200"
                      title="Toon chatgeschiedenis"
                    >
                      <svg className="w-5 h-5 text-cyan-200" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h16" />
                      </svg>
                    </button>
                    <div>
                      <p className="uppercase tracking-[0.3em] text-xs text-cyan-200/70 mb-2">Active Session</p>
                      <h1
                        className={`text-3xl font-semibold bg-gradient-to-r ${assistantMeta.accent} bg-clip-text text-transparent`}
                      >
                        {assistantMeta.name}
                      </h1>
                      <p className="text-slate-300/80 text-sm mt-3 leading-relaxed max-w-xl">
                        {assistantMeta.description}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => router.push('/select-assistant')}
                    className="flex-shrink-0 inline-flex items-center gap-2 px-5 py-3 rounded-2xl bg-gradient-to-r from-slate-800/60 via-slate-900/80 to-slate-950/80 border border-white/10 text-xs uppercase tracking-[0.25em] text-slate-200 hover:from-slate-800/40 hover:via-slate-900/60 hover:to-slate-950/60 transition"
                  >
                    <span>Wissel assistent</span>
                    <span className="text-base">⇄</span>
                  </button>
                </div>
              </div>

              {/* Messages Area */}
              <div className="flex-1 min-h-0">
                <div className="h-full overflow-y-auto px-4 sm:px-8 py-10 space-y-8 rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl shadow-blue-900/20">
                  {messages.length === 0 && (
                    <div className="text-center py-12">
                      <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-white/10 border border-white/10 mb-6">
                        <span className="text-2xl">✨</span>
                      </div>
                      <h2 className="text-2xl font-semibold text-slate-100 mb-3">
                        {validMode === 'technical' ? 'Welkom bij CeeS Enhanced' : 'Welkom bij ChriS Enhanced'}
                      </h2>
                      <p className="text-slate-300/80 mb-6 max-w-xl mx-auto">
                        {validMode === 'technical'
                          ? 'Stel je technische vragen en ontvang direct ondersteuning, inclusief relevante documentatie.'
                          : 'Vraag naar leveranciers, onderdelen en inkoopadvies met toegang tot de nieuwste gegevens.'}
                      </p>
                      <div className="max-w-md mx-auto">
                        <div className="rounded-2xl border border-white/10 bg-gradient-to-r from-cyan-500/10 via-blue-500/10 to-indigo-500/10 px-6 py-4">
                          <p className="text-sm text-slate-200 leading-relaxed">
                            <strong className="tracking-[0.2em] uppercase text-xs text-cyan-200/80 block mb-2">Nieuw</strong>
                            Kies tussen <span className="text-white font-medium">Simpele vragen</span> (GPT-4 Turbo) en <span className="text-white font-medium">Complexe vragen</span> (GPT-4.1) voor optimale resultaten.
                          </p>
                        </div>
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
                        <div className="text-xs text-slate-400 text-right mr-4 mt-2">
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
              <div className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-2xl shadow-2xl shadow-blue-900/20">
                <ChatInputWithSelector
                  onSendMessage={handleSendMessage}
                  disabled={loading}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}