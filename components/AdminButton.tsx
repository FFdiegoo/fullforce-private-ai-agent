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
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const { data } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single();

    setIsAdmin(data?.role === 'admin');
  }

  if (!isAdmin) return null;

  return (
    <button
      onClick={() => router.push('/admin/dashboard')}
      className="fixed bottom-4 right-4 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200"
    >
      <span className="sr-only">Open Admin Dashboard</span>
      ⚙️
    </button>
  );
}