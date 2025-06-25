import '../styles/globals.css';
import type { AppProps } from 'next/app';
import AdminButton from '../components/AdminButton';
import { ThemeProvider } from '../contexts/ThemeContext';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { useEffect } from 'react';
import { auditLogger } from '../lib/enhanced-audit-logger';

export default function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    // Global error handler for unhandled promise rejections
    const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
      console.error('Unhandled promise rejection:', event.reason);
      auditLogger.logError(
        new Error(event.reason), 
        'UNHANDLED_PROMISE_REJECTION'
      );
    };

    // Global error handler for uncaught exceptions
    const handleError = (event: ErrorEvent) => {
      console.error('Uncaught error:', event.error);
      auditLogger.logError(event.error, 'UNCAUGHT_ERROR');
    };

    window.addEventListener('unhandledrejection', handleUnhandledRejection);
    window.addEventListener('error', handleError);

    return () => {
      window.removeEventListener('unhandledrejection', handleUnhandledRejection);
      window.removeEventListener('error', handleError);
    };
  }, []);

  return (
    <ErrorBoundary>
      <ThemeProvider>
        <Component {...pageProps} />
        <AdminButton />
      </ThemeProvider>
    </ErrorBoundary>
  );
}