import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import { useAuth } from '../lib/useAuth';
import Image from 'next/image';

export default function Login() {
  const router = useRouter();
  const { user, loading: authLoading, isAuthenticated } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    // Redirect if already authenticated
    if (!authLoading && isAuthenticated && user) {
      console.log('✅ Already authenticated, redirecting...');
    
      // Diego bypass
      if (user.email === 'diego.a.scognamiglio@gmail.com') {
        router.push('/select-assistant');
        return;
      }

      // Check 2FA for other users
      if (user.email) {
        checkTwoFactorAndRedirect(user.email);
      } else {
        console.warn('⚠️ User authenticated but email is undefined');
        router.push('/setup-2fa');
      }
    }
  }, [authLoading, isAuthenticated, user, router]);

  async function checkTwoFactorAndRedirect(email: string) {
    try {
      const { data: profile } = await supabase
        .from('profiles')
        .select('two_factor_enabled')
        .eq('email', email)
        .single();

      if (!profile?.two_factor_enabled) {
        await router.push('/setup-2fa');
      } else {
        await router.push('/select-assistant');
      }
    } catch (error) {
      console.error('❌ 2FA check error:', error);
      await router.push('/setup-2fa');
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
        await supabase.from('auth_events').insert({
          user_email: email,
          event_type: 'login'
        });

        if (email === 'diego.a.scognamiglio@gmail.com') {
          console.log('🔓 Diego bypass - redirecting to admin');
          router.push('/select-assistant');
          return;
        }

        const { data: profile } = await supabase
          .from('profiles')
          .select('two_factor_enabled')
          .eq('email', email)
          .single();

        if (!profile?.two_factor_enabled) {
          router.push('/setup-2fa');
        } else {
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
      handleLogin(e as any);
    }
  };

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-2 text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-300 via-gray-400 to-gray-500 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white/90 backdrop-blur-sm border border-gray-100 rounded-2xl shadow-xl p-8">
        <div className="mb-8">
          <div className="flex flex-col items-center mb-6">
            <Image
              src="https://csrental.nl/wp-content/uploads/2023/03/CS-Rental-logo-1.png"
              alt="CS Rental logo"
              width={120}
              height={48}
              className="h-12 w-auto"
            />
            <p className="mt-2 text-sm text-gray-500">CS Rental • Chaam</p>
          </div>
          <h1 className="text-2xl font-semibold text-gray-900 text-center">
            Welkom terug
          </h1>
          <p className="mt-1 text-sm text-gray-600 text-center">
            Log in met je interne account
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
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
              className="w-full px-4 py-2 rounded-md border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 placeholder-gray-400 transition"
              placeholder="naam@csrental.nl"
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
              className="w-full px-4 py-2 rounded-md border border-gray-300 bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-600 focus:border-blue-600 placeholder-gray-400 transition"
              placeholder="Voer je wachtwoord in"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className={`w-full py-3 px-4 rounded-md font-medium transition ${
              loading || !email || !password
                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {loading ? 'Bezig met inloggen...' : 'Log in'}
          </button>
        </form>

        <div className="mt-3 text-center">
          <p className="text-xs text-gray-500">
            Druk op <span className="bg-gray-100 px-2 py-1 rounded">Enter</span> om in te loggen
          </p>
        </div>

        <div className="mt-6 text-center space-y-2">
          <button
            onClick={() => router.push('/forgot-password')}
            className="text-sm text-blue-600 hover:text-blue-700 transition-colors block"
          >
            Wachtwoord vergeten?
          </button>
          <button
            onClick={() => router.push('/diego-login')}
            className="text-sm text-gray-500 hover:text-gray-700 transition-colors block"
          >
            👨‍💻 Diego Admin Access
          </button>
        </div>

        <div className="mt-6 text-center text-xs text-gray-400">
          Secure login via Supabase
        </div>
      </div>
    </div>
  );
}
