import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function AdminButton() {
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  async function checkAdminStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      console.log('Checking admin status for user:', user.email);

      // First check if user has admin role in raw_app_meta_data
      if (user.app_metadata?.role === 'admin') {
        console.log('User has admin role in auth metadata');
        setIsAdmin(true);
        return;
      }

      // Then check profiles table by email
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', user.email)
        .single();

      if (error) {
        console.error('Error checking admin status:', error);
        return;
      }

      const isAdminRole = data?.role === 'admin';
      console.log('Profile check result:', isAdminRole, 'for user:', user.email);
      setIsAdmin(isAdminRole);
    } catch (error) {
      console.error('Error in checkAdminStatus:', error);
    }
  }

  if (!isAdmin) return null;

  return (
    <button
      onClick={() => router.push('/admin')}
      className="fixed bottom-4 right-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-50"
      title="Admin Dashboard"
    >
      <span className="sr-only">Open Admin Dashboard</span>
      ⚙️
    </button>
  );
}