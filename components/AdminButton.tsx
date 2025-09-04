import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function AdminButton() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    checkAdminStatus();
  }, []);

  async function checkAdminStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const email = user.email?.toLowerCase();
      console.log('Checking admin status for user:', email);

      // First check if user has admin role in app_metadata
      if (user.app_metadata?.role?.toLowerCase() === 'admin') {
        console.log('User has admin role in auth metadata');
        setIsAdmin(true);
        return;
      }

      // Then check profiles table by email
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', email)
        .single();

      if (error) {
        console.error('Error checking admin status:', error);
        return;
      }

      const isAdminRole = data?.role?.toLowerCase() === 'admin';
      console.log('Profile check result:', isAdminRole, 'for user:', email);
      setIsAdmin(isAdminRole);
    } catch (error) {
      console.error('Error in checkAdminStatus:', error);
    }
  }

  if (!isAdmin) return null;

  return (
    <Link
      href="/admin"
      className="fixed bottom-4 right-4 bg-gradient-to-r from-red-600 to-red-700 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-50"
      title="Admin Dashboard"
    >
      <span className="sr-only">Open Admin Dashboard</span>
      ⚙️
    </Link>
  );
}