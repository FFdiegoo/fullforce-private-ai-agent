import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface MessageFeedbackProps {
  messageId: string;
  sessionId: string;
  onFeedbackSubmitted?: (type: 'thumbs_up' | 'thumbs_down') => void;
}

export default function MessageFeedback({ 
  messageId, 
  sessionId, 
  onFeedbackSubmitted 
}: MessageFeedbackProps) {
  const [feedback, setFeedback] = useState<'thumbs_up' | 'thumbs_down' | null>(null);
  const [loading, setLoading] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    getCurrentUser();
    loadExistingFeedback();
  }, [messageId]);

  async function getCurrentUser() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data: profile } = await supabase
        .from('profiles')
        .select('id')
        .eq('email', user.email)
        .single();

      if (profile) {
        setUserId(profile.id);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  }

  async function loadExistingFeedback() {
    if (!userId) return;

    try {
      const { data, error } = await supabase
        .from('message_feedback')
        .select('feedback_type')
        .eq('message_id', messageId)
        .eq('user_id', userId)
        .single();

      if (error && error.code !== 'PGRST116') {
        console.error('Error loading feedback:', error);
        return;
      }

      if (data) {
        setFeedback(data.feedback_type as 'thumbs_up' | 'thumbs_down');
      }
    } catch (error) {
      console.error('Error loading existing feedback:', error);
    }
  }

  async function submitFeedback(type: 'thumbs_up' | 'thumbs_down') {
    if (!userId || loading) return;

    setLoading(true);
    try {
      // If same feedback type, remove it (toggle off)
      if (feedback === type) {
        const { error } = await supabase
          .from('message_feedback')
          .delete()
          .eq('message_id', messageId)
          .eq('user_id', userId);

        if (error) throw error;
        setFeedback(null);
      } else {
        // Insert or update feedback
        const { error } = await supabase
          .from('message_feedback')
          .upsert({
            message_id: messageId,
            session_id: sessionId,
            user_id: userId,
            feedback_type: type,
            viewed_by_admin: false
          }, {
            onConflict: 'message_id,user_id'
          });

        if (error) throw error;
        setFeedback(type);
      }

      onFeedbackSubmitted?.(type);
    } catch (error) {
      console.error('Error submitting feedback:', error);
      alert('Er ging iets mis bij het versturen van je feedback. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex items-center space-x-2 mt-2">
      <button
        onClick={() => submitFeedback('thumbs_up')}
        disabled={loading}
        className={`p-2 rounded-lg transition-all duration-200 ${
          feedback === 'thumbs_up'
            ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
            : 'bg-gray-100 text-gray-500 hover:bg-green-50 hover:text-green-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-green-900/20 dark:hover:text-green-400'
        } ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}`}
        title="Goed antwoord"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
        </svg>
      </button>

      <button
        onClick={() => submitFeedback('thumbs_down')}
        disabled={loading}
        className={`p-2 rounded-lg transition-all duration-200 ${
          feedback === 'thumbs_down'
            ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400'
            : 'bg-gray-100 text-gray-500 hover:bg-red-50 hover:text-red-600 dark:bg-gray-700 dark:text-gray-400 dark:hover:bg-red-900/20 dark:hover:text-red-400'
        } ${loading ? 'opacity-50 cursor-not-allowed' : 'hover:scale-110'}`}
        title="Slecht antwoord"
      >
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20" style={{ transform: 'rotate(180deg)' }}>
          <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
        </svg>
      </button>

      {feedback && (
        <span className="text-xs text-gray-500 dark:text-gray-400 ml-2">
          {feedback === 'thumbs_up' ? 'Bedankt voor je feedback!' : 'Feedback ontvangen'}
        </span>
      )}
    </div>
  );
}