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
          className="fixed inset-0 bg-slate-950/80 backdrop-blur-sm z-40 lg:hidden"
          onClick={onToggle}
        />
      )}

      {/* Sidebar */}
      <div
        className={`fixed left-0 top-0 h-full w-80 lg:w-72 z-50 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0`}
      >
        <div className="relative h-full">
          <div className="absolute inset-0 bg-gradient-to-b from-white/20 via-white/10 to-transparent opacity-80" aria-hidden="true" />
          <div className="relative h-full backdrop-blur-2xl bg-white/5 border-r border-white/10 shadow-2xl shadow-blue-900/30 flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-white/10">
              <div className="flex items-start justify-between gap-3 mb-6">
                <div>
                  <p className="uppercase tracking-[0.35em] text-[0.65rem] text-cyan-200/70">
                    Sessions
                  </p>
                  <h2 className="text-xl font-semibold mt-2">
                    {mode === 'technical' ? 'CeeS Logboek' : 'ChriS Logboek'}
                  </h2>
                </div>
                <button
                  onClick={onToggle}
                  className="text-slate-200/70 hover:text-slate-100 transition-colors lg:hidden"
                >
                  ✕
                </button>
              </div>

              <div className="space-y-3">
                <button
                  onClick={() => {
                    onNewChat();
                    fetchChatSessions();
                  }}
                  className="w-full inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-500/80 via-blue-500/80 to-indigo-500/80 hover:from-cyan-400/80 hover:via-blue-400/80 hover:to-indigo-400/80 text-sm font-semibold tracking-[0.18em] uppercase py-3 transition"
                >
                  <span className="text-lg">＋</span>
                  Nieuwe chat
                </button>

                <button
                  onClick={() => setShowArchived(!showArchived)}
                  className="w-full rounded-2xl border border-white/10 bg-white/5 hover:bg-white/10 text-xs uppercase tracking-[0.25em] text-slate-200 py-3 transition"
                >
                  {showArchived ? 'Toon actieve' : 'Toon archief'}
                </button>
              </div>
            </div>

            {/* Chat Sessions List */}
            <div className="flex-1 overflow-y-auto">
              {loading ? (
                <div className="p-6 text-center text-slate-300/70 text-sm tracking-[0.2em] uppercase">
                  Laden...
                </div>
              ) : sessions.length === 0 ? (
                <div className="p-6 text-center text-slate-300/70 text-sm leading-relaxed">
                  {showArchived ? 'Geen gearchiveerde chats gevonden.' : 'Nog geen gesprekken. Start een nieuwe chat om te beginnen.'}
                </div>
              ) : (
                <div className="p-4 space-y-3">
                  {sessions.map((session) => (
                    <div
                      key={session.id}
                      onClick={() => onSessionSelect(session.id)}
                      className={`group relative p-4 rounded-2xl cursor-pointer transition-all duration-200 border border-transparent backdrop-blur hover:border-white/20 hover:bg-white/10 ${
                        currentSessionId === session.id
                          ? 'bg-white/15 border-white/25 shadow-inner shadow-cyan-500/10'
                          : 'bg-white/5 text-slate-100'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="text-sm font-medium tracking-wide truncate">
                            {session.title}
                          </div>
                          <div className="text-xs text-slate-300/70 mt-2">
                            {formatDate(session.updated_at)}
                          </div>
                        </div>

                        <button
                          onClick={(e) =>
                            showArchived
                              ? restoreSession(session.id, e)
                              : archiveSession(session.id, e)
                          }
                          className="opacity-0 group-hover:opacity-100 ml-2 text-slate-200/70 hover:text-white transition-all p-1"
                          title={showArchived ? 'Herstel chat' : 'Archiveer chat'}
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
            <div className="p-6 border-t border-white/10">
              <div className="text-[0.65rem] uppercase tracking-[0.3em] text-slate-300/70 text-center">
                {sessions.length} chat{sessions.length !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}