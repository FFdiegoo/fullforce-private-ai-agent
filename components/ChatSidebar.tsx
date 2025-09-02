import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';

interface ChatSession {
  id: string;
  title: string;
  mode: 'technical' | 'procurement';
  created_at: string;
  updated_at: string;
}

interface ChatSidebarProps {
  isOpen: boolean;
  onToggle: () => void;
  currentSessionId?: string;
  onSessionSelect: (sessionId: string) => void;
  onNewChat: () => void;
  mode: 'technical' | 'procurement';
}

export default function ChatSidebar({
  isOpen,
  onToggle,
  currentSessionId,
  onSessionSelect,
  onNewChat,
  mode
}: ChatSidebarProps) {
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);

  useEffect(() => {
    fetchChatSessions();
  }, [mode, showArchived]);

  useEffect(() => {
    fetchChatSessions();
  }, [currentSessionId]);

  async function fetchChatSessions() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      let userId = user.id;
      let { data, error } = await supabase
        .from('chat_sessions')
        .select('*')
        .eq('user_id', userId)
        .eq('mode', mode)
        .eq('archived', showArchived)
        .order('updated_at', { ascending: false });

      if (error || !data) {
        // Fallback: try to find profile by email
        if (user.email) {
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('id')
            .eq('email', user.email)
            .single();
          if (profileByEmail) {
            userId = profileByEmail.id;
            const res = await supabase
              .from('chat_sessions')
              .select('*')
              .eq('user_id', userId)
              .eq('mode', mode)
              .eq('archived', showArchived)
              .order('updated_at', { ascending: false });
            data = res.data;
          }
        }
      }

      setSessions(data || []);
      console.log('Fetched', data?.length || 0, 'chat sessions for mode:', mode, 'archived:', showArchived);
    } catch (error) {
      console.error('Error in fetchChatSessions:', error);
    } finally {
      setLoading(false);
    }
  }
  async function archiveSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();

    if (!confirm('Are you sure you want to archive this chat?')) return;

    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ archived: true })
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));

      if (sessionId === currentSessionId) {
        onNewChat();
      }
    } catch (error) {
      console.error('Error archiving session:', error);
      alert('Failed to archive chat session');
    }
  }

  async function restoreSession(sessionId: string, e: React.MouseEvent) {
    e.stopPropagation();

    try {
      const { error } = await supabase
        .from('chat_sessions')
        .update({ archived: false })
        .eq('id', sessionId);

      if (error) throw error;

      setSessions(prev => prev.filter(s => s.id !== sessionId));
    } catch (error) {
      console.error('Error restoring session:', error);
      alert('Failed to restore chat session');
    }
  }

  const formatDate = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffInHours < 24) {
      return format(date, 'HH:mm');
    } else if (diffInHours < 24 * 7) {
      return format(date, 'EEE');
    } else {
      return format(date, 'dd/MM');
    }
  };

  // Refresh sessions when a new message is sent (listen for changes)
  useEffect(() => {
    const channel = supabase
      .channel('chat_sessions_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'chat_sessions',
          filter: `mode=eq.${mode}`
        }, 
        () => {
          console.log('Chat sessions changed, refreshing...');
          fetchChatSessions();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [mode]);

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div 
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div className={`
        fixed left-0 top-0 h-full bg-primary text-white z-50 transition-transform duration-300 ease-in-out shadow-lg
        ${isOpen ? 'translate-x-0' : '-translate-x-full'}
        w-80 lg:w-64
      `}>
        {/* Header */}
        <div className="p-4 border-b border-primary/30">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">
              {mode === 'technical' ? 'CeeS Chats' : 'ChriS Chats'}
            </h2>
            <button
              onClick={onToggle}
              className="text-white/70 hover:text-white transition-colors lg:hidden"
            >
              ✕
            </button>
          </div>

          <button
            onClick={() => {
              onNewChat();
              fetchChatSessions();
            }}
            className="w-full bg-secondary hover:bg-secondary/90 text-gray-900 rounded-lg py-2 px-3 text-sm font-medium transition-colors flex items-center justify-center shadow"
          >
            <span className="mr-2">+</span>
            New Chat
          </button>

          <button
            onClick={() => setShowArchived(!showArchived)}
            className="w-full mt-2 bg-primary/70 hover:bg-primary/60 text-white rounded-lg py-2 px-3 text-sm font-medium transition-colors shadow"
          >
            {showArchived ? 'Show Active' : 'Show Archived'}
          </button>
        </div>

        {/* Chat Sessions List */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="p-4 text-center text-white/70">
              Loading chats...
            </div>
          ) : sessions.length === 0 ? (
            <div className="p-4 text-center text-white/70">
              {showArchived ? 'No archived chats' : 'No chat history yet'}
            </div>
          ) : (
            <div className="p-2">
              {sessions.map((session) => (
                <div
                  key={session.id}
                  onClick={() => onSessionSelect(session.id)}
                  className={`
                    group relative p-3 rounded-lg cursor-pointer transition-colors mb-1 shadow-sm
                    ${currentSessionId === session.id
                      ? 'bg-secondary text-gray-900'
                      : 'hover:bg-primary/60 text-white/90'
                    }
                  `}
                >
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">
                        {session.title}
                      </div>
                      <div className="text-xs text-white/70 mt-1">
                        {formatDate(session.updated_at)}
                      </div>
                    </div>

                    <button
                      onClick={(e) =>
                        showArchived
                          ? restoreSession(session.id, e)
                          : archiveSession(session.id, e)
                      }
                      className={`opacity-0 group-hover:opacity-100 ml-2 text-white/70 transition-all p-1 hover:text-secondary`}
                      title={showArchived ? 'Restore chat' : 'Archive chat'}
                    >
                      {showArchived ? '↩️' : '📦'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-primary/30">
          <div className="text-xs text-white/70 text-center">
            {sessions.length} chat{sessions.length !== 1 ? 's' : ''}
          </div>
        </div>
      </div>
    </>
  );
}