import '../styles/globals.css';
import type { AppProps } from 'next/app';
import AdminButton from '../components/AdminButton';

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <>
      <Component {...pageProps} />
      <AdminButton />
    </>
  );
}