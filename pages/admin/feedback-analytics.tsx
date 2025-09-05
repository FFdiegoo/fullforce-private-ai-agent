import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Line, Bar } from 'react-chartjs-2';
import 'chart.js/auto';
import { supabase } from '../../lib/supabaseClient';

interface Trend {
  month: string;
  thumbs_up: number;
  thumbs_down: number;
  total: number;
}

export default function FeedbackAnalytics() {
  const router = useRouter();
  const [trends, setTrends] = useState<Trend[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthAndFetch();
  }, []);

  async function checkAuthAndFetch() {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      router.push('/login');
      return;
    }

    const { data: profile } = await supabase
      .from('profiles')
      .select('role')
      .eq('email', session.user.email)
      .single();

    if (profile?.role !== 'admin') {
      router.push('/');
      return;
    }

    await fetchTrends();
  }

  async function fetchTrends() {
    const { data, error } = await supabase.rpc('get_feedback_trends');
    if (error) {
      console.error('Error fetching trends:', error);
      setLoading(false);
      return;
    }

    const parsed = (data || []).map((row: any) => ({
      month: row.month,
      thumbs_up: parseInt(row.thumbs_up),
      thumbs_down: parseInt(row.thumbs_down),
      total: parseInt(row.total)
    }));

    setTrends(parsed);
    setLoading(false);
  }

  const labels = trends.map(t => t.month);
  const positive = trends.map(t => t.total > 0 ? (t.thumbs_up / t.total) * 100 : 0);
  const negative = trends.map(t => t.total > 0 ? (t.thumbs_down / t.total) * 100 : 0);

  const ratioData = {
    labels,
    datasets: [
      {
        label: 'Positief %',
        data: positive,
        borderColor: 'rgb(34,197,94)',
        backgroundColor: 'rgba(34,197,94,0.2)'
      },
      {
        label: 'Negatief %',
        data: negative,
        borderColor: 'rgb(239,68,68)',
        backgroundColor: 'rgba(239,68,68,0.2)'
      }
    ]
  };

  const totalData = {
    labels,
    datasets: [
      {
        label: 'Totaal feedback',
        data: trends.map(t => t.total),
        backgroundColor: 'rgba(59,130,246,0.5)'
      }
    ]
  };

  if (loading) {
    return <div className="min-h-screen flex items-center justify-center">Laden...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold mb-6">Feedback Analytics</h1>

      <div className="bg-white rounded-xl shadow-lg p-4 mb-8">
        <h2 className="text-lg font-semibold mb-4">Verhouding up/down per maand</h2>
        <Line data={ratioData} />
      </div>

      <div className="bg-white rounded-xl shadow-lg p-4">
        <h2 className="text-lg font-semibold mb-4">Totaal aantal feedbacks per maand</h2>
        <Bar data={totalData} />
      </div>
    </div>
  );
}
