import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    checkAuthAndRedirect();
  }, [router]);

  const checkAuthAndRedirect = async () => {
    try {
      console.log('🔍 Starting auth check...');
      setLoading(true);
      setError('');

      const { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('❌ Session error:', sessionError);
        setError(`Session error: ${sessionError.message}`);
        router.push('/login');
        return;
      }

      if (!session) {
        console.log('❌ No session, redirecting to login');
        router.push('/login');
        return;
      }

      console.log('✅ Session found for:', session.user.email);

      // 🔓 DIEGO BYPASS: Check if this is Diego's account
      if (session.user.email === 'diego.a.scognamiglio@gmail.com') {
        console.log('🔓 Diego detected, bypassing 2FA checks');
        router.push('/select-assistant');
        return;
      }

      // User is authenticated, check if they need 2FA setup
      console.log('👤 Checking user profile...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('two_factor_enabled, role')
        .eq('email', session.user.email)
        .single();

      if (profileError) {
        console.error('❌ Profile error:', profileError);
        // If profile doesn't exist, redirect to 2FA setup to create it
        console.log('📝 Profile not found, redirecting to 2FA setup');
        router.push('/setup-2fa');
        return;
      }

      console.log('✅ Profile found:', profile);

      // Check if 2FA is enabled
      if (!profile.two_factor_enabled) {
        console.log('🔐 2FA not enabled, redirecting to setup');
        router.push('/setup-2fa');
        return;
      }

      // 2FA is enabled, redirect to main app
      console.log('🎯 2FA enabled, redirecting to assistant selection');
      router.push('/select-assistant');

    } catch (error) {
      console.error('❌ Auth check error:', error);
      setError(`Authentication error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      
      // Fallback to login after error
      setTimeout(() => {
        router.push('/login');
      }, 3000);
    } finally {
      setLoading(false);
    }
  };

  // Show error state if there's an error
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-red-50 to-red-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="text-red-500 text-4xl mb-4">⚠️</div>
          <h1 className="text-xl font-bold text-gray-900 mb-4">Authentication Error</h1>
          <p className="text-gray-600 mb-6">{error}</p>
          <div className="space-y-3">
            <button
              onClick={() => {
                setError('');
                checkAuthAndRedirect();
              }}
              className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
            >
              🔄 Retry
            </button>
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-gray-600 text-white py-3 rounded-lg hover:bg-gray-700 transition-colors"
            >
              🔑 Go to Login
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">
          {loading ? 'Checking authentication...' : 'Redirecting...'}
        </p>
        <p className="text-xs text-gray-500 mt-2">
          If this takes too long, <button 
            onClick={() => router.push('/login')} 
            className="text-indigo-600 underline"
          >
            click here to login
          </button>
        </p>
      </div>
    </div>
  );
}