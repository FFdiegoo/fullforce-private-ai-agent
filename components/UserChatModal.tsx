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
  timestamp: string;
  model_used?: string;
}

interface ChatSession {
  id: string;
  created_at: string;
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
      // Since we don't have actual chat sessions stored yet, we'll create dummy data
      // In a real implementation, you would fetch from your chat_sessions table
      const dummyChatSessions: ChatSession[] = [
        {
          id: '1',
          created_at: new Date(Date.now() - 86400000).toISOString(), // 1 day ago
          messages: [
            {
              id: '1',
              content: 'Hoe kan ik de hydraulische druk controleren op machine X?',
              role: 'user',
              timestamp: new Date(Date.now() - 86400000).toISOString(),
            },
            {
              id: '2',
              content: 'Om de hydraulische druk te controleren op machine X, volg je deze stappen:\n\n1. Zorg ervoor dat de machine uitgeschakeld is\n2. Lokaliseer de drukmeters aan de zijkant van de machine\n3. Controleer of de druk tussen 150-200 bar ligt\n4. Als de druk te laag is, controleer dan de hydraulische vloeistof niveau',
              role: 'assistant',
              timestamp: new Date(Date.now() - 86400000 + 30000).toISOString(),
              model_used: 'gpt-4-turbo'
            },
            {
              id: '3',
              content: 'Dank je! Waar vind ik de hydraulische vloeistof?',
              role: 'user',
              timestamp: new Date(Date.now() - 86400000 + 60000).toISOString(),
            },
            {
              id: '4',
              content: 'De hydraulische vloeistof tank bevindt zich aan de achterkant van de machine, links van de motor. Het is een blauwe tank met een doorzichtig venster om het niveau te controleren.',
              role: 'assistant',
              timestamp: new Date(Date.now() - 86400000 + 90000).toISOString(),
              model_used: 'gpt-4-turbo'
            }
          ]
        },
        {
          id: '2',
          created_at: new Date(Date.now() - 3600000).toISOString(), // 1 hour ago
          messages: [
            {
              id: '5',
              content: 'Wat zijn de onderhoudsintervallen voor de graafmachine?',
              role: 'user',
              timestamp: new Date(Date.now() - 3600000).toISOString(),
            },
            {
              id: '6',
              content: 'De onderhoudsintervallen voor de graafmachine zijn als volgt:\n\n**Dagelijks:**\n- Visuele inspectie\n- Olie niveau controleren\n\n**Wekelijks:**\n- Smeren van alle smeerpunten\n- Luchtfilter controleren\n\n**Maandelijks:**\n- Hydraulische vloeistof vervangen\n- Rupsbanden controleren\n\n**Jaarlijks:**\n- Volledige service door technicus',
              role: 'assistant',
              timestamp: new Date(Date.now() - 3600000 + 15000).toISOString(),
              model_used: 'o3'
            }
          ]
        }
      ];

      setChatSessions(dummyChatSessions);
    } catch (error) {
      console.error('Error fetching chat history:', error);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-semibold text-gray-900">
              Chat History - {user.name || user.email}
            </h2>
            <p className="text-sm text-gray-500 mt-1">
              {chatSessions.length} chat sessie(s)
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
            <div className="space-y-6">
              {chatSessions.map((session) => (
                <div key={session.id} className="border rounded-lg p-4 bg-gray-50">
                  <div className="text-sm text-gray-500 mb-4 font-medium">
                    Sessie van {format(new Date(session.created_at), 'dd-MM-yyyy HH:mm')}
                  </div>
                  <div className="space-y-4">
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
                          <div className={`text-xs mt-2 ${
                            message.role === 'user' ? 'text-indigo-200' : 'text-gray-500'
                          }`}>
                            {format(new Date(message.timestamp), 'HH:mm')}
                            {message.model_used && message.role === 'assistant' && (
                              <span className="ml-2">• {message.model_used}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
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