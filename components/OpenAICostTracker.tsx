import React, { useEffect, useState } from 'react';

interface CostData {
  totalCost: number;
  gpt4TurboCost: number;
  o3Cost: number;
  lastUpdated: string;
}

export default function OpenAICostTracker() {
  const [costData, setCostData] = useState<CostData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchCostData();
    // Refresh every 5 minutes
    const interval = setInterval(fetchCostData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  async function fetchCostData() {
    try {
      const response = await fetch('/api/openai-costs');
      if (!response.ok) {
        throw new Error('Failed to fetch cost data');
      }
      const data = await response.json();
      setCostData(data);
      setError(null);
    } catch (err) {
      console.error('Error fetching cost data:', err);
      setError('Failed to load cost data');
      // Set dummy data for demonstration
      setCostData({
        totalCost: 23.57,
        gpt4TurboCost: 15.32,
        o3Cost: 8.25,
        lastUpdated: new Date().toISOString()
      });
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="bg-white rounded-xl shadow-lg p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 rounded w-1/4 mb-4"></div>
          <div className="h-8 bg-gray-200 rounded w-1/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-xl shadow-lg p-6 border border-green-200">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2 flex items-center">
            <span className="mr-2">💰</span>
            OpenAI API Kosten (Deze Maand)
          </h3>
          {costData && (
            <div className="space-y-2">
              <div className="text-3xl font-bold text-green-600">
                ${costData.totalCost.toFixed(2)}
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <div className="flex justify-between items-center">
                  <span>GPT-4 Turbo:</span>
                  <span className="font-medium">${costData.gpt4TurboCost.toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span>GPT-o3:</span>
                  <span className="font-medium">${costData.o3Cost.toFixed(2)}</span>
                </div>
              </div>
            </div>
          )}
          {error && (
            <div className="text-red-600 text-sm">{error}</div>
          )}
        </div>
        
        <div className="text-right">
          <div className="text-xs text-gray-500 mb-2">
            Laatste update:
          </div>
          <div className="text-sm text-gray-700">
            {costData ? new Date(costData.lastUpdated).toLocaleString('nl-NL') : 'N/A'}
          </div>
          <button
            onClick={fetchCostData}
            className="mt-2 px-3 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition-colors"
          >
            🔄 Ververs
          </button>
        </div>
      </div>
    </div>
  );
}