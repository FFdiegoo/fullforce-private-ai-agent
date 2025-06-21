import '../styles/globals.css';
import type { AppProps } from 'next/app';
import AdminButton from '../components/AdminButton';
import { ThemeProvider } from '../contexts/ThemeContext';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <ThemeProvider>
      <Component {...pageProps} />
      <AdminButton />
    </ThemeProvider>
  );
}