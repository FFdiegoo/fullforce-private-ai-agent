import React, { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';

interface User {
  id: string;
  email: string;
  name?: string;
  role: string;
}

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
  updated_at: string;
  messages: ChatMessage[];
}

interface UserChatModalProps {
  user: User;
  onClose: () => void;
}

export default function UserChatModal({ user, onClose }: UserChatModalProps) {
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchChatHistory();
  }, [user.id]);

  async function fetchChatHistory() {
    try {
      // Fetch chat sessions for this user
      const { data: sessions, error: sessionsError } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false });

      if (sessionsError) {
        console.error('Error fetching sessions:', sessionsError);
        return;
      }

      if (!sessions || sessions.length === 0) {
        setChatSessions([]);
        return;
      }

      // Fetch messages for each session
      const sessionsWithMessages = await Promise.all(
        sessions.map(async (session) => {
          const { data: messages, error: messagesError } = await supabase
            .from('chat_messages')
            .select('*')
            .eq('session_id', session.id)
            .order('created_at', { ascending: true });

          if (messagesError) {
            console.error('Error fetching messages for session:', session.id, messagesError);
            return { ...session, messages: [] };
          }

          return { ...session, messages: messages || [] };
        })
      );

      setChatSessions(sessionsWithMessages);
    } catch (error) {
      console.error('Error fetching chat history:', error);
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

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Chat History - {user.name || user.email}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {chatSessions.length} chat sessie(s) • {chatSessions.reduce((total, session) => total + session.messages.length, 0)} berichten
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 text-2xl"
          >
            ×
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">Loading chat history...</div>
            </div>
          ) : chatSessions.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              Geen chat geschiedenis gevonden voor deze gebruiker
            </div>
          ) : (
            <div className="space-y-8">
              {chatSessions.map((session) => (
                <div key={session.id} className="border rounded-lg bg-gray-50">
                  {/* Session Header */}
                  <div className="p-4 border-b bg-gray-100 rounded-t-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center space-x-3">
                        <span className="text-lg">{getModeIcon(session.mode)}</span>
                        <div>
                          <h3 className="font-medium text-gray-900">{session.title}</h3>
                          <p className="text-sm text-gray-600">{getModeLabel(session.mode)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="text-sm text-gray-500">
                          {format(new Date(session.created_at), 'dd-MM-yyyy HH:mm')}
                        </div>
                        <div className="text-xs text-gray-400">
                          {session.messages.length} berichten
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Messages */}
                  <div className="p-4">
                    {session.messages.length === 0 ? (
                      <div className="text-center text-gray-500 py-4">
                        Geen berichten in deze sessie
                      </div>
                    ) : (
                      <div className="space-y-4 max-h-96 overflow-y-auto">
                        {session.messages.map((message) => (
                          <div
                            key={message.id}
                            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
                          >
                            <div
                              className={`max-w-[70%] rounded-lg p-3 ${
                                message.role === 'user'
                                  ? 'bg-indigo-600 text-white'
                                  : 'bg-white text-gray-800 border'
                              }`}
                            >
                              <div className="whitespace-pre-wrap text-sm">
                                {message.content}
                              </div>
                              <div className={`text-xs mt-2 flex items-center justify-between ${
                                message.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
                              }`}>
                                <span>{format(new Date(message.created_at), 'HH:mm')}</span>
                                {message.model_used && message.role === 'assistant' && (
                                  <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                                    {message.model_used}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-6 border-t bg-gray-50 rounded-b-xl">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-600 text-white rounded-lg hover:bg-gray-700 transition-colors"
          >
            Sluiten
          </button>
        </div>
      </div>
    </div>
  );
}