import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/supabaseClient';

interface FeedbackStatsProps {
  className?: string;
}

interface FeedbackStats {
  total_thumbs_up: number;
  total_thumbs_down: number;
  unviewed_thumbs_down: number;
}

export default function FeedbackStats({ className = '' }: FeedbackStatsProps) {
  const [stats, setStats] = useState<FeedbackStats>({
    total_thumbs_up: 0,
    total_thumbs_down: 0,
    unviewed_thumbs_down: 0
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchStats();
    
    // Set up real-time subscription for feedback changes
    const channel = supabase
      .channel('feedback_stats_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'message_feedback'
        }, 
        () => {
          console.log('Feedback changed, refreshing stats...');
          fetchStats();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  async function fetchStats() {
    try {
      const { data, error } = await supabase.rpc('get_feedback_stats');
      
      if (error) {
        console.error('Error fetching feedback stats:', error);
        return;
      }

      if (data && data.length > 0) {
        setStats({
          total_thumbs_up: parseInt(data[0].total_thumbs_up) || 0,
          total_thumbs_down: parseInt(data[0].total_thumbs_down) || 0,
          unviewed_thumbs_down: parseInt(data[0].unviewed_thumbs_down) || 0
        });
      }
    } catch (error) {
      console.error('Error in fetchStats:', error);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className={`bg-white rounded-xl shadow-lg p-4 ${className}`}>
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-3/4 mb-2"></div>
          <div className="h-8 bg-gray-200 rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-white rounded-xl shadow-lg p-4 ${className}`}>
      <h3 className="text-sm font-medium text-gray-600 mb-3">AI Feedback</h3>
      
      <div className="grid grid-cols-2 gap-4">
        {/* Thumbs Up */}
        <div className="text-center">
          <div className="flex items-center justify-center mb-1">
            <svg className="w-5 h-5 text-green-600 mr-1" fill="currentColor" viewBox="0 0 20 20">
              <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
            </svg>
            <span className="text-2xl font-bold text-green-600">
              {stats.total_thumbs_up.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-gray-500">Positief</p>
        </div>

        {/* Thumbs Down */}
        <div className="text-center relative">
          <div className="flex items-center justify-center mb-1">
            <svg className="w-5 h-5 text-red-600 mr-1" fill="currentColor" viewBox="0 0 20 20" style={{ transform: 'rotate(180deg)' }}>
              <path d="M2 10.5a1.5 1.5 0 113 0v6a1.5 1.5 0 01-3 0v-6zM6 10.333v5.43a2 2 0 001.106 1.79l.05.025A4 4 0 008.943 18h5.416a2 2 0 001.962-1.608l1.2-6A2 2 0 0015.56 8H12V4a2 2 0 00-2-2 1 1 0 00-1 1v.667a4 4 0 01-.8 2.4L6.8 7.933a4 4 0 00-.8 2.4z" />
            </svg>
            <span className="text-2xl font-bold text-red-600">
              {stats.total_thumbs_down.toLocaleString()}
            </span>
            
            {/* Notification Badge */}
            {stats.unviewed_thumbs_down > 0 && (
              <div className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center font-bold">
                {stats.unviewed_thumbs_down > 99 ? '99+' : stats.unviewed_thumbs_down}
              </div>
            )}
          </div>
          <p className="text-xs text-gray-500">Negatief</p>
        </div>
      </div>

      {/* Success Rate */}
      <div className="mt-4 pt-3 border-t border-gray-200">
        <div className="text-center">
          <div className="text-lg font-bold text-gray-800">
            {stats.total_thumbs_up + stats.total_thumbs_down > 0 
              ? Math.round((stats.total_thumbs_up / (stats.total_thumbs_up + stats.total_thumbs_down)) * 100)
              : 0}%
          </div>
          <p className="text-xs text-gray-500">Tevredenheid</p>
        </div>
      </div>
    </div>
  );
}