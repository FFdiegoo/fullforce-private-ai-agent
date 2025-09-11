import { useEffect, useState } from 'react';
import {
  Chart,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend
} from 'chart.js';
import { Line } from 'react-chartjs-2';

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend);

interface Trend {
  month: string;
  thumbs_up: number;
  thumbs_down: number;
}

export default function FeedbackAnalytics() {
  const [trends, setTrends] = useState<Trend[]>([]);

  useEffect(() => {
    fetch('/api/admin/feedback-trends')
      .then(res => res.json())
      .then(data => setTrends(data.trends || []));
  }, []);

  const data = {
    labels: trends.map(t => t.month),
    datasets: [
      {
        label: 'Thumbs Up',
        data: trends.map(t => t.thumbs_up),
        borderColor: '#00ff00',
        backgroundColor: 'rgba(0,255,0,0.2)'
      },
      {
        label: 'Thumbs Down',
        data: trends.map(t => t.thumbs_down),
        borderColor: '#ff0000',
        backgroundColor: 'rgba(255,0,0,0.2)'
      }
    ]
  };

  const options = { scales: { y: { beginAtZero: true } } };

  return (
    <div className="min-h-screen bg-black text-green-500 p-8">
      <h1 className="text-3xl font-bold mb-8">Feedback Analytics</h1>
      <Line data={data} options={options} />
    </div>
  );
}
