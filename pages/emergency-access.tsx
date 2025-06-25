import { useState } from 'react';
import { useRouter } from 'next/router';

export default function EmergencyAccess() {
  const router = useRouter();
  const [email, setEmail] = useState('diego.a.scognamiglio@gmail.com');
  const [emergencyCode, setEmergencyCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<any>(null);

  const handleEmergencyAccess = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('🚨 Requesting emergency access...');
      
      const response = await fetch('/api/admin/emergency-access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, emergencyCode })
      });

      const data = await response.json();
      console.log('📡 Emergency access response:', data);

      if (response.ok) {
        setSuccess(true);
        setResult(data);
        console.log('✅ Emergency access granted!');
      } else {
        setError(data.error || 'Emergency access failed');
        console.error('❌ Emergency access failed:', data);
      }
    } catch (error) {
      console.error('❌ Network error:', error);
      setError('Network error - please try again');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full text-center">
          <div className="text-6xl mb-4">✅</div>
          <h1 className="text-2xl font-bold text-green-600 mb-4">
            Emergency Access Granted!
          </h1>
          <div className="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
            <p className="text-sm text-green-700 mb-2">
              <strong>User:</strong> {result?.user?.email}<br />
              <strong>Role:</strong> {result?.user?.role}<br />
              <strong>Status:</strong> 2FA bypassed
            </p>
          </div>
          <p className="text-gray-600 mb-6">
            You can now login normally. 2FA requirement has been bypassed for your account.
          </p>
          <div className="space-y-3">
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors"
            >
              🔑 Go to Login
            </button>
            <button
              onClick={() => router.push('/admin')}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              🛠️ Go to Admin Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-500 via-orange-500 to-yellow-500 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 max-w-md w-full">
        <div className="text-center mb-8">
          <div className="text-6xl mb-4">🚨</div>
          <h1 className="text-2xl font-bold text-red-600 mb-2">
            Emergency Admin Access
          </h1>
          <p className="text-gray-600">
            Bypass 2FA requirement for admin access
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-6">
            <p className="text-red-600 text-sm font-medium">❌ Error:</p>
            <p className="text-red-600 text-sm">{error}</p>
            <button
              onClick={() => setError('')}
              className="mt-2 px-3 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm"
            >
              🔄 Try Again
            </button>
          </div>
        )}

        <form onSubmit={handleEmergencyAccess} className="space-y-6">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Emergency Code
            </label>
            <input
              type="text"
              value={emergencyCode}
              onChange={(e) => setEmergencyCode(e.target.value)}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500"
              placeholder="Enter emergency code"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              💡 Hint: DIEGO_EMERGENCY_2025
            </p>
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-red-600 text-white py-3 rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
          >
            {loading ? '⏳ Granting Access...' : '🚨 Grant Emergency Access'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-gray-500 hover:text-gray-700"
          >
            ← Back to Login
          </button>
        </div>

        <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-xs text-yellow-700">
            <strong>⚠️ Emergency Access:</strong> This will bypass 2FA requirement for the specified user account. Use only in emergency situations.
          </p>
        </div>
      </div>
    </div>
  );
}