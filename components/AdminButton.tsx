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

      // Check by email instead of user.id
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('email', user.email) // Changed from id to email
        .single();

      if (error) {
        console.error('Error checking admin status:', error);
        return;
      }

      setIsAdmin(data?.role === 'admin');
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