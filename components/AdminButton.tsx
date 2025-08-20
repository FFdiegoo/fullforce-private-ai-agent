'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { supabase } from '../lib/supabaseClient';

export default function AdminButton() {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    // Initial check when component mounts
    checkAdminStatus();

    // Re-check whenever auth state changes (login, logout, token refresh)
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(() => {
      checkAdminStatus();
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  async function checkAdminStatus() {
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setIsAdmin(false);
        return;
      }

      console.log('Checking admin status for user:', user.email);

      // First check if user has admin role in metadata
      if (
        user.app_metadata?.role === 'admin' ||
        (user.user_metadata as any)?.role === 'admin'
      ) {
        console.log('User has admin role in auth metadata');
        setIsAdmin(true);
        return;
      }

      // Then check profiles table by user id
      const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();

      if (error) {
        console.error('Error checking admin status:', error);
        setIsAdmin(false);
        return;
      }

      const isAdminRole = data?.role === 'admin';
      console.log('Profile check result:', isAdminRole, 'for user:', user.email);
      setIsAdmin(isAdminRole);
    } catch (error) {
      console.error('Error in checkAdminStatus:', error);
      setIsAdmin(false);
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
