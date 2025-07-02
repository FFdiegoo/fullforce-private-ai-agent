import { useState, useEffect } from 'react';
import { supabase } from './supabaseClient';
import type { User, Session } from '@supabase/supabase-js';

interface AuthState {
  user: User | null;
  session: Session | null;
  loading: boolean;
  isAuthenticated: boolean;
}

export function useAuth() {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    loading: true,
    isAuthenticated: false,
  });

  useEffect(() => {
    async function getSession() {
      const { data: { session }, error } = await supabase.auth.getSession();
      if (error) {
        setState({ user: null, session: null, loading: false, isAuthenticated: false });
        return;
      }
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        isAuthenticated: !!session,
      });
    }

    getSession();

    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      setState({
        user: session?.user ?? null,
        session,
        loading: false,
        isAuthenticated: !!session,
      });
    });

    return () => {
      listener?.subscription.unsubscribe();
    };
  }, []);

  return state;
}

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