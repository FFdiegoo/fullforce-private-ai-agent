import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';
import { format } from 'date-fns';

interface NegativeFeedback {
  id: string;
  message_id: string;
  session_id: string;
  user_id: string;
  created_at: string;
  viewed_by_admin: boolean;
  message_content: string;
  user_email: string;
  session_title: string;
  session_mode: string;
}

interface NegativeFeedbackPanelProps {
  onFeedbackViewed?: () => void;
}

export default function NegativeFeedbackPanel({ onFeedbackViewed }: NegativeFeedbackPanelProps) {
  const [negativeFeedback, setNegativeFeedback] = useState<NegativeFeedback[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFeedback, setSelectedFeedback] = useState<NegativeFeedback | null>(null);

  useEffect(() => {
    fetchNegativeFeedback();
    
    // Set up real-time subscription
    const channel = supabase
      .channel('negative_feedback_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'message_feedback',
          filter: 'feedback_type=eq.thumbs_down'
        }, 
        () => {
          console.log('Negative feedback changed, refreshing...');
          fetchNegativeFeedback();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchNegativeFeedback() {
    try {
      const { data, error } = await supabase
        .from('message_feedback')
        .select(`
          *,
          chat_messages!inner(content),
          profiles!inner(email),
          chat_sessions!inner(title, mode)
        `)
        .eq('feedback_type', 'thumbs_down')
        .order('created_at', { ascending: false });

      if (error) {
        console.error('Error fetching negative feedback:', error);
        return;
      }

      const formattedFeedback: NegativeFeedback[] = data.map(item => ({
        id: item.id,
        message_id: item.message_id,
        session_id: item.session_id,
        user_id: item.user_id,
        created_at: item.created_at,
        viewed_by_admin: item.viewed_by_admin,
        message_content: item.chat_messages.content,
        user_email: item.profiles.email,
        session_title: item.chat_sessions.title,
        session_mode: item.chat_sessions.mode
      }));

      setNegativeFeedback(formattedFeedback);
    } catch (error) {
      console.error('Error in fetchNegativeFeedback:', error);
    } finally {
      setLoading(false);
    }
  }

  async function markAsViewed(feedbackId: string) {
    try {
      const { error } = await supabase
        .from('message_feedback')
        .update({ viewed_by_admin: true })
        .eq('id', feedbackId);

      if (error) throw error;

      // Update local state
      setNegativeFeedback(prev => 
        prev.map(feedback => 
          feedback.id === feedbackId 
            ? { ...feedback, viewed_by_admin: true }
            : feedback
        )
      );

      onFeedbackViewed?.();
    } catch (error) {
      console.error('Error marking feedback as viewed:', error);
    }
  }

  function openChatHistory(sessionId: string, messageId: string) {
    // Open chat history and scroll to specific message
    const url = `/admin/chat-history?session=${sessionId}&message=${messageId}`;
    window.open(url, '_blank');
  }

  const unviewedCount = negativeFeedback.filter(f => !f.viewed_by_admin).length;

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-gray-200 rounded w-1/3 mb-4"></div>
          <div className="space-y-3">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-16 bg-gray-200 rounded"></div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-xl font-semibold flex items-center">
          <span className="mr-2">👎</span>
          Negatieve Feedback
          {unviewedCount > 0 && (
            <div className="ml-3 bg-red-500 text-white text-xs px-2 py-1 rounded-full font-bold">
              {unviewedCount} nieuw
            </div>
          )}
        </h2>
      </div>

      {negativeFeedback.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <span className="text-4xl mb-2 block">🎉</span>
          Geen negatieve feedback! Alle gebruikers zijn tevreden.
        </div>
      ) : (
        <div className="space-y-4 max-h-96 overflow-y-auto">
          {negativeFeedback.map((feedback) => (
            <div
              key={feedback.id}
              className={`p-4 rounded-lg border-2 cursor-pointer transition-all duration-200 hover:shadow-md ${
                feedback.viewed_by_admin 
                  ? 'border-gray-200 bg-gray-50' 
                  : 'border-red-200 bg-red-50 shadow-sm'
              }`}
              onClick={() => {
                if (!feedback.viewed_by_admin) {
                  markAsViewed(feedback.id);
                }
                openChatHistory(feedback.session_id, feedback.message_id);
              }}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center mb-2">
                    <span className={`w-2 h-2 rounded-full mr-2 ${
                      feedback.viewed_by_admin ? 'bg-gray-400' : 'bg-red-500'
                    }`}></span>
                    <span className="font-medium text-gray-900">
                      {feedback.user_email}
                    </span>
                    <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded">
                      {feedback.session_mode === 'technical' ? 'CeeS' : 'ChriS'}
                    </span>
                  </div>
                  
                  <div className="text-sm text-gray-600 mb-2">
                    <strong>Sessie:</strong> {feedback.session_title}
                  </div>
                  
                  <div className="text-sm text-gray-800 bg-white p-3 rounded border-l-4 border-red-400 mb-2 max-h-40 overflow-y-auto">
                    <strong>AI Antwoord:</strong>
                    <div className="whitespace-pre-wrap mt-1">
                      {feedback.message_content}
                    </div>
                  </div>
                  
                  <div className="text-xs text-gray-500">
                    {format(new Date(feedback.created_at), 'dd-MM-yyyy HH:mm')}
                  </div>
                </div>
                
                <div className="ml-4 flex items-center">
                  <span className="text-gray-400 text-sm">Klik om te bekijken →</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}