import { useState, useEffect } from 'react';
import { supabase, getCurrentSession } from './supabaseClient';
import { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
}

export function useAuth() {
  const [authState, setAuthState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    error: null
  });

  useEffect(() => {
    // Get initial session
    getCurrentSession().then(session => {
      setAuthState({
        user: session?.user || null,
        session,
        loading: false,
        error: null
      });
    }).catch(error => {
      console.error('❌ Initial auth check failed:', error);
      setAuthState({
        user: null,
        session: null,
        loading: false,
        error: error.message
      });
    });

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        console.log('🔐 Auth state changed:', event);
      
        setAuthState({
          user: session?.user || null,
          session,
          loading: false,
          error: null
        });

        // Handle specific events
        if (event === 'SIGNED_OUT') {
          // Clear any cached data
          localStorage.removeItem('supabase.auth.token');
        }
      }
    );

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => {
    try {
      setAuthState(prev => ({ ...prev, loading: true }));
      await supabase.auth.signOut();
    } catch (error: any) {
      setAuthState(prev => ({ 
        ...prev, 
        loading: false, 
        error: error.message 
      }));
    }
  };

  return {
    ...authState,
    signOut,
    isAuthenticated: !!authState.user
  };
}