import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    checkAuthAndRedirect();
  }, [router]);

  const checkAuthAndRedirect = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error) {
        console.error('Session error:', error);
        router.push('/login');
        return;
      }

      if (!session) {
        console.log('No session, redirecting to login');
        router.push('/login');
        return;
      }

      // 🔓 DIEGO BYPASS: Check if this is Diego's account
      if (session.user.email === 'diego.a.scognamiglio@gmail.com') {
        console.log('🔓 Diego detected, bypassing 2FA checks');
        router.push('/select-assistant');
        return;
      }

      // User is authenticated, check if they need 2FA setup
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('two_factor_enabled, role')
        .eq('email', session.user.email)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        // If profile doesn't exist, still allow access to setup 2FA
        router.push('/setup-2fa');
        return;
      }

      // Check if 2FA is enabled
      if (!profile.two_factor_enabled) {
        console.log('2FA not enabled, redirecting to setup');
        router.push('/setup-2fa');
        return;
      }

      // 2FA is enabled, redirect to main app
      console.log('2FA enabled, redirecting to assistant selection');
      router.push('/select-assistant');

    } catch (error) {
      console.error('Auth check error:', error);
      router.push('/login');
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 to-blue-100 flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin w-8 h-8 border-3 border-indigo-600 border-t-transparent rounded-full mx-auto mb-4"></div>
        <p className="text-gray-600">Checking authentication...</p>
      </div>
    </div>
  );
}