import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

interface SessionData {
  userId: string;
  email: string;
  role: string;
  permissions: string[];
  expiresAt: number;
  lastActivity: number;
}

export function useSession() {
  const [session, setSession] = useState<SessionData | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();

  useEffect(() => {
    validateSession();
  }, []);

  const validateSession = async () => {
    try {
      const sessionId = localStorage.getItem('session-id');
      
      if (!sessionId) {
        setLoading(false);
        return;
      }

      const response = await fetch('/api/auth/session-validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId })
      });

      if (response.ok) {
        const data = await response.json();
        setSession(data.session);
      } else {
        localStorage.removeItem('session-id');
        setSession(null);
      }
    } catch (error) {
      console.error('Session validation error:', error);
      setSession(null);
    } finally {
      setLoading(false);
    }
  };

  const logout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
      localStorage.removeItem('session-id');
      setSession(null);
      router.push('/login');
    } catch (error) {
      console.error('Logout error:', error);
    }
  };

  return {
    session,
    loading,
    logout,
    isAuthenticated: !!session,
    hasRole: (role: string) => session?.role === role,
    hasPermission: (permission: string) => session?.permissions.includes(permission) || session?.role === 'admin'
  };
}