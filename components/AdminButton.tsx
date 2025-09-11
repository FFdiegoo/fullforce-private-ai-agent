import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function AdminButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        const { data: profileCount, error: countError } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true });

        if (countError) {
          setVisible(true);
          return;
        }

        if ((profileCount?.count || 0) === 0) {
          setVisible(true);
          return;
        }

        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role === 'admin') {
          setVisible(true);
        }
      } catch {
        setVisible(true);
      }
    }

    checkAccess();
  }, []);

  if (!visible) return null;

  return (
    <Link
      href="/admin"
      className="fixed bottom-4 right-4 bg-gradient-to-r from-green-700 to-green-900 text-green-200 rounded-full p-4 shadow-lg hover:shadow-xl transition-all duration-200 z-50"
      title="Admin Dashboard"
    >
      <span className="sr-only">Open Admin Dashboard</span>
      ⚙️
    </Link>
  );
}
