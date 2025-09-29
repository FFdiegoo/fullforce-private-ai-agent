import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Image from 'next/image';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import AdminButton from '../components/AdminButton';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ThemeProvider } from '../contexts/ThemeContext';
import { supabase } from '../lib/supabaseClient';

export default function MyApp({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const [isSessionReady, setIsSessionReady] = useState(false);
  const PUBLIC_ROUTES = ['/login'];

  useEffect(() => {
    // Global error handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      // Prevent the error from crashing the app
      event.preventDefault();
    };

    // Global error handler for uncaught exceptions
    const handleError = (event: ErrorEvent) => {
      console.error('Uncaught error:', event.error);
      // Prevent the error from crashing the app
      event.preventDefault();
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    // Log app initialization
    console.log('🚀 App initialized');

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  useEffect(() => {
    let isMounted = true;

    const verifySession = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();
        const isPublicRoute = PUBLIC_ROUTES.includes(router.pathname);

        if (!session && !isPublicRoute) {
          const redirectTarget = router.asPath && router.asPath !== '/' ? router.asPath : '/select-assistant';
          router.replace({
            pathname: '/login',
            query: redirectTarget ? { redirectTo: redirectTarget } : undefined
          });
        } else {
          if (session && router.pathname === '/login') {
            router.replace('/select-assistant');
          }

          if (isMounted) {
            setIsSessionReady(true);
          }
        }
      } catch (error) {
        console.error('Error verifying Supabase session', error);
        if (isMounted) {
          setIsSessionReady(true);
        }
      }
    };

    verifySession();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session && !PUBLIC_ROUTES.includes(router.pathname)) {
        setIsSessionReady(false);
        router.replace('/login');
      }

      if (session && router.pathname === '/login') {
        setIsSessionReady(false);
        router.replace('/select-assistant');
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [router.asPath, router.pathname]);

  if (!isSessionReady) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <span className="text-white/60 tracking-widest uppercase text-sm">Checking credentials...</span>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <div className="min-h-screen">
          <div className="fixed left-4 top-4 z-50">
            <Image
              src="/csrental-logo.svg"
              alt="CS Rental logo"
              width={160}
              height={60}
              priority
            />
          </div>
          <Component {...pageProps} />
          <AdminButton />
        </div>
      </ThemeProvider>
    </ErrorBoundary>
  );
}