import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Check if user is already logged in
    checkUser();
  }, []);

  async function checkUser() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (session) {
        // 🔓 DIEGO BYPASS: Check if this is Diego's account
        if (session.user.email === 'diego.a.scognamiglio@gmail.com') {
          console.log('🔓 Diego detected, bypassing 2FA checks');
          router.push('/select-assistant');
          return;
        }

        // Check if 2FA is enabled
        const { data: profile } = await supabase
          .from('profiles')
          .select('two_factor_enabled')
          .eq('email', session.user.email)
          .single();

        if (!profile?.two_factor_enabled) {
          router.push('/setup-2fa');
        } else {
          router.push('/select-assistant');
        }
      }
    } catch (error) {
      console.error('Auth check error:', error);
      // Continue with login form
    }
  }

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      // 🔓 DIEGO BYPASS: Special handling for Diego
      if (email === 'diego.a.scognamiglio@gmail.com' && password === 'Hamkaastostimetkaka321@!') {
        console.log('🔓 Diego bypass login detected');
        
        // Call bypass API first
        const bypassResponse = await fetch('/api/auth/diego-bypass', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, password })
        });

        if (bypassResponse.ok) {
          console.log('✅ Bypass API successful');
        }
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        throw error;
      }

      if (data.user) {
        // Log the login event
        await supabase.from('auth_events').insert({
          user_email: email,
          event_type: 'login'
        });

        // 🔓 DIEGO BYPASS: Skip 2FA check for Diego
        if (email === 'diego.a.scognamiglio@gmail.com') {
          console.log('🔓 Diego bypass - redirecting to admin');
          router.push('/select-assistant');
          return;
        }

        // Check if 2FA is enabled for this user
        const { data: profile } = await supabase
          .from('profiles')
          .select('two_factor_enabled')
          .eq('email', email)
          .single();

        if (!profile?.two_factor_enabled) {
          // Redirect to 2FA setup
          router.push('/setup-2fa');
        } else {
          // Redirect to main app
          router.push('/select-assistant');
        }
      }
    } catch (error: any) {
      console.error('Login error:', error);
      setError(error.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !loading && email && password) {
      handleLogin(e);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl w-full max-w-md p-8 transform transition-all hover:scale-[1.01]">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Welcome Back
          </h1>
          <p className="mt-3 text-gray-600">Sign in to your account</p>
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
              placeholder="Enter your email"
              required
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
            disabled={loading || !email || !password}
            className={`w-full py-3 px-4 rounded-xl font-medium transition-all duration-200 ${
              loading || !email || !password
                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                : 'bg-gradient-to-r from-indigo-600 to-purple-600 text-white hover:opacity-90 transform hover:scale-[1.02]'
            }`}
          >
            {loading ? 'Signing in...' : 'Sign In'}
          </button>
        </form>

        {/* Keyboard shortcut hint */}
        <div className="mt-4 text-center">
          <p className="text-xs text-gray-500">
            Press <span className="bg-gray-100 px-2 py-1 rounded">Enter</span> to sign in
          </p>
        </div>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={() => router.push('/forgot-password')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors block"
          >
            Forgot your password?
          </button>
          
          {/* 🔓 DIEGO BYPASS: Special login link */}
          <button
            onClick={() => router.push('/diego-login')}
            className="text-sm text-purple-600 hover:text-purple-800 transition-colors block"
          >
            👨‍💻 Diego Admin Access
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-gray-500">
          Secure login powered by Supabase
        </div>
      </div>
    </div>
  );
}