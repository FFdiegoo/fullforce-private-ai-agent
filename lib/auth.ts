import { createServerComponentClient } from '@supabase/auth-helpers-nextjs';
import { createServerActionClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { createServerSupabaseClient } from '@supabase/auth-helpers-nextjs';
import type { GetServerSidePropsContext } from 'next';

export async function getUserAndRole(ctx: GetServerSidePropsContext) {
  const supabase = createServerSupabaseClient(ctx);

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const user = session?.user || null;

  if (!user) return { user: null, role: null };
  const email = user.email?.toLowerCase();
  if (!email) {
    console.error('Email not found for user');
    return { user, role: null };
  }

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('email', email) // Changed from id to email
    .single();

  if (error) {
    console.error('Rol ophalen mislukt:', error.message);
    return { user, role: null };
  }

  return { user, role: data?.role?.toLowerCase() || null };
}
