import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function DiegoLogin() {
  const router = useRouter();
  const [email, setEmail] = useState('diego.a.scognamiglio@gmail.com');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      console.log('🔓 Diego bypass login attempt...');

      // First try the bypass API
      const bypassResponse = await fetch('/api/auth/diego-bypass', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });

      const bypassData = await bypassResponse.json();

      if (bypassResponse.ok) {
        console.log('✅ Bypass successful, now doing Supabase auth...');

        // Now do the actual Supabase login
        const { data, error: authError } = await supabase.auth.signInWithPassword({
          email,
          password,
        });

        if (authError) {
          console.error('❌ Supabase auth error:', authError);
          setError('Login failed: ' + authError.message);
          return;
        }

        console.log('✅ Full login successful!');
        
        // Log the login event
        await supabase.from('auth_events').insert({
          user_email: email,
          event_type: 'diego_bypass_login'
        });

        // Redirect directly to admin dashboard
        router.push('/admin');
      } else {
        setError(bypassData.error || 'Access denied');
      }
    } catch (error) {
      console.error('❌ Login error:', error);
      setError('Network error - please try again');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && password) {
      handleLogin(e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-500 via-blue-500 to-indigo-500 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl w-full max-w-md p-8">
        <div className="text-center mb-8">
          <div className="text-4xl mb-4">👨‍💻</div>
          <h1 className="text-3xl font-bold bg-gradient-to-r from-purple-600 to-blue-600 bg-clip-text text-transparent">
            Diego Admin Access
          </h1>
          <p className="mt-3 text-gray-600">Direct admin login (2FA bypassed)</p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-xl">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        
        <form onSubmit={handleLogin} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
              placeholder="diego.a.scognamiglio@gmail.com"
              required
              readOnly
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200"
              placeholder="Enter your password"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password}
            className={`w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
              loading || !password
                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                : 'bg-gradient-to-r from-purple-600 to-blue-600 text-white hover:opacity-90 transform hover:scale-[1.02]'
            }`}
          >
            {loading ? 'Signing in...' : '🔓 Admin Login (Bypass)'}
          </button>
        </form>

        {/* Keyboard shortcut hint */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Press <span className="bg-gray-100 px-2 py-1 rounded">Enter</span> to sign in
          </p>
        </div>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
          >
            ← Back to Normal Login
          </button>
        </div>

        <div className="mt-6 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
          <p className="text-xs text-yellow-700 text-center">
            <strong>⚠️ Special Access:</strong> 2FA requirement bypassed for Diego admin account
          </p>
        </div>
      </div>
    </div>
  );
}