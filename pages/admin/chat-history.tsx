import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../../lib/supabaseClient';
import { format } from 'date-fns';

interface ChatMessage {
  id: string;
  content: string;
  role: 'user' | 'assistant';
  created_at: string;
  model_used?: string;
}

interface ChatSession {
  id: string;
  title: string;
  mode: 'technical' | 'procurement';
  created_at: string;
  user_email: string;
  messages: ChatMessage[];
}

export default function ChatHistoryPage() {
  const router = useRouter();
  const { session: sessionId, message: messageId } = router.query;
  const [chatSession, setChatSession] = useState<ChatSession | null>(null);
  const [loading, setLoading] = useState(true);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);

  useEffect(() => {
    if (sessionId) {
      fetchChatSession(sessionId as string);
      if (messageId) {
        setHighlightedMessageId(messageId as string);
        // Scroll to message after a short delay
        setTimeout(() => {
          const element = document.getElementById(`message-${messageId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 500);
      }
    }
  }, [sessionId, messageId]);

  async function fetchChatSession(sessionId: string) {
    try {
      // Fetch session details
      const { data: sessionData, error: sessionError } = await supabase
        .from('chat_sessions')
        .select(`
          *,
          profiles!inner(email)
        `)
        .eq('id', sessionId)
        .single();

      if (sessionError) {
        console.error('Error fetching session:', sessionError);
        return;
      }

      // Fetch messages
      const { data: messagesData, error: messagesError } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('session_id', sessionId)
        .order('created_at', { ascending: true });

      if (messagesError) {
        console.error('Error fetching messages:', messagesError);
        return;
      }

      const session: ChatSession = {
        id: sessionData.id,
        title: sessionData.title,
        mode: sessionData.mode,
        created_at: sessionData.created_at,
        user_email: sessionData.profiles.email,
        messages: messagesData || []
      };

      setChatSession(session);
    } catch (error) {
      console.error('Error in fetchChatSession:', error);
    } finally {
      setLoading(false);
    }
  }

  const getModeIcon = (mode: string) => {
    return mode === 'technical' ? '🔧' : '📦';
  };

  const getModeLabel = (mode: string) => {
    return mode === 'technical' ? 'CeeS (Technical)' : 'ChriS (Procurement)';
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading chat history...</div>
      </div>
    );
  }

  if (!chatSession) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-4">Chat Session Not Found</h1>
          <button
            onClick={() => router.push('/admin')}
            className="px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Back to Admin Dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <div className="bg-white shadow-sm border-b">
        <div className="max-w-4xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-3">
              <button
                onClick={() => router.push('/admin')}
                className="text-gray-400 hover:text-gray-600"
              >
                ← Back
              </button>
              <span className="text-lg">{getModeIcon(chatSession.mode)}</span>
              <div>
                <h1 className="text-xl font-bold text-gray-900">
                  {chatSession.title}
                </h1>
                <p className="text-sm text-gray-600">
                  {getModeLabel(chatSession.mode)} • {chatSession.user_email}
                </p>
              </div>
            </div>
            <div className="text-sm text-gray-500">
              {format(new Date(chatSession.created_at), 'dd-MM-yyyy HH:mm')}
            </div>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="space-y-6">
          {chatSession.messages.map((message) => (
            <div
              key={message.id}
              id={`message-${message.id}`}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} ${
                highlightedMessageId === message.id ? 'animate-pulse' : ''
              }`}
            >
              <div
                className={`max-w-[70%] rounded-2xl p-6 shadow-lg transition-all duration-200 ${
                  message.role === 'user'
                    ? 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white'
                    : highlightedMessageId === message.id
                    ? 'bg-red-100 border-2 border-red-400 text-gray-800'
                    : 'bg-white text-gray-800 border'
                }`}
              >
                <p className="text-base leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
                
                <div className={`text-xs mt-3 flex items-center justify-between ${
                  message.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
                }`}>
                  <span>{format(new Date(message.created_at), 'HH:mm')}</span>
                  {message.model_used && message.role === 'assistant' && (
                    <span className="ml-2 bg-gray-200 text-gray-600 px-2 py-1 rounded text-xs">
                      {message.model_used}
                    </span>
                  )}
                  {highlightedMessageId === message.id && (
                    <span className="ml-2 bg-red-500 text-white px-2 py-1 rounded text-xs font-bold">
                      👎 Negatieve feedback
                    </span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}