import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Image from 'next/image';
import { useEffect } from 'react';
import AdminButton from '../components/AdminButton';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ThemeProvider } from '../contexts/ThemeContext';

export default function MyApp({ Component, pageProps }: AppProps) {
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