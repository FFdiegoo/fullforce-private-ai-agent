import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import ThemeToggle from '../components/ThemeToggle';

export default function SelectAssistant() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkAuthAndSetup();
  }, []);

  async function checkAuthAndSetup() {
    try {
      const { data: { session }, error } = await supabase.auth.getSession();
      
      if (error || !session) {
        console.log('No valid session, redirecting to login');
        router.push('/login');
        return;
      }

      const email = session.user.email?.toLowerCase();
      setCurrentUser(session.user);

      // Check user profile and 2FA status
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('email', email)
        .single();

      if (profileError) {
        console.error('Profile error:', profileError);
        // If no profile exists, redirect to 2FA setup
        router.push('/setup-2fa');
        return;
      }

      // Check if 2FA is enabled
      if (!profile.two_factor_enabled) {
        console.log('2FA not enabled, redirecting to setup');
        router.push('/setup-2fa');
        return;
      }

      // Check admin status
      const isAdminRole = profile.role?.toLowerCase() === 'admin';
      setIsAdmin(isAdminRole);
      console.log('User authenticated and 2FA enabled:', email);

    } catch (error) {
      console.error('Error in auth check:', error);
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin w-8 h-8 border-3 border-white border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-white">Checking authentication...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 dark:from-gray-900 dark:via-gray-800 dark:to-gray-700 flex items-center justify-center p-6 relative">
      {/* Theme Toggle - top left */}
      <div className="fixed top-4 left-4 z-50">
        <ThemeToggle />
      </div>

      {/* Red admin indicator - top right */}
      {isAdmin && (
        <div className="fixed top-4 right-4 z-50">
          <div className="flex items-center space-x-2 bg-red-600 text-white px-3 py-1 rounded-full shadow-lg">
            <span className="w-2 h-2 bg-white rounded-full"></span>
            <span className="text-sm font-medium">Admin</span>
          </div>
        </div>
      )}

      <div className="w-full max-w-5xl">
        {/* Admin Dashboard Button */}
        {isAdmin && (
          <div className="text-center mb-8">
            <button
              onClick={() => router.push('/admin')}
              className="bg-red-600 hover:bg-red-700 text-white px-6 py-3 rounded-xl font-medium transition-all duration-200 shadow-lg hover:shadow-xl"
            >
              🛠️ Admin Dashboard
            </button>
            {currentUser && (
              <p className="text-white/80 dark:text-gray-300 text-sm mt-2">
                Ingelogd als admin: {currentUser.email}
              </p>
            )}
          </div>
        )}

        {/* 2FA Status Indicator */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center space-x-2 bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
            <span>🛡️</span>
            <span>
              2FA Enabled
            </span>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <button
            onClick={() => router.push('/chat?mode=technical')}
            className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg rounded-3xl shadow-xl p-8 hover:transform hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-blue-500/10 to-indigo-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative z-10">
              <div className="bg-blue-500/10 rounded-2xl w-16 h-16 flex items-center justify-center mb-6">
                <span className="text-2xl">🔧</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4 bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                CeeS
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                Your Technical Knowledge Expert
              </p>
              <div className="flex items-center text-blue-600 dark:text-blue-400 font-medium">
                Start Chat
                <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </button>

          <button
            onClick={() => router.push('/chat?mode=procurement')}
            className="group bg-white/90 dark:bg-gray-800/90 backdrop-blur-lg rounded-3xl shadow-xl p-8 hover:transform hover:scale-[1.02] transition-all duration-300 cursor-pointer relative overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-purple-500/10 to-pink-500/10 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />
            <div className="relative z-10">
              <div className="bg-purple-500/10 rounded-2xl w-16 h-16 flex items-center justify-center mb-6">
                <span className="text-2xl">📦</span>
              </div>
              <h2 className="text-3xl font-bold text-gray-800 dark:text-white mb-4 bg-gradient-to-r from-purple-600 to-pink-600 bg-clip-text text-transparent">
                ChriS
              </h2>
              <p className="text-gray-600 dark:text-gray-300 mb-6 text-lg">
                Your Procurement & Parts Specialist
              </p>
              <div className="flex items-center text-purple-600 dark:text-purple-400 font-medium">
                Start Chat
                <span className="ml-2 transform group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </button>
        </div>

        {/* 2FA Management Link */}
        <div className="text-center mt-8">
          <button
            onClick={() => router.push('/setup-2fa')}
            className="text-white/80 hover:text-white text-sm underline"
          >
            Manage 2FA Settings
          </button>
        </div>
      </div>
    </div>
  );
}