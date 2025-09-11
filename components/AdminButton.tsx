import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function AdminButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    async function checkAccess() {
      try {
        // Tel profielen zonder data op te halen
        const { count, error: countError } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true });

        // Als tellen faalt of er nog geen profielen zijn: toon knop
        if (countError || (count ?? 0) === 0) {
          setVisible(true);
          return;
        }

        // Haal ingelogde user op
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Check rol van huidige user
        const { data: profile } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single();

        if (profile?.role === 'admin') {
          setVisible(true);
        }
      } catch {
        // In geval van fout: liever zichtbaar dan verstopt
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
