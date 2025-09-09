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

      const { data: { user }, error: userError } = await supabase.auth.getUser();

      if (userError) {
        console.error('❌ getUser error:', userError);
        setError('Sessie verlopen');
        return;
      }

      if (!user) {
        console.log('❌ No user found, session likely expired');
        setError('Sessie verlopen');
        return;
      }

      const email = user.email?.toLowerCase();
      console.log('✅ User found for:', email);

      // 🔓 DIEGO BYPASS: Check if this is Diego's account
      if (email === 'diego.a.scognamiglio@gmail.com') {
        console.log('🔓 Diego detected, bypassing 2FA checks');
        router.push('/select-assistant');
        return;
      }

      // User is authenticated, check if they need 2FA setup
      console.log('👤 Checking user profile...');
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('two_factor_enabled, role')
        .eq('email', email)
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

      // Check admin role before redirecting
      if (profile.role?.toLowerCase() !== 'admin') {
        console.log('❌ User is not admin');
        setError('Sessie verlopen');
        return;
      }

      // 2FA is enabled and user is admin, redirect to main app
      console.log('🎯 2FA enabled and user is admin, redirecting to assistant selection');
      router.push('/select-assistant');

    } catch (error) {
      console.error('❌ Auth check error:', error);
      setError('Sessie verlopen');
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
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 transition-colors"
          >
            🔑 Sign in
          </button>
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