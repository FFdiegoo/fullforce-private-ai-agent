import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import Head from 'next/head';
import { supabase } from '../lib/supabaseClient';

const backgroundLayers = [
  'bg-[radial-gradient(circle_at_top,_rgba(76,29,149,0.35),_transparent_65%)]',
  'bg-[radial-gradient(circle_at_bottom,_rgba(14,116,144,0.3),_transparent_70%)]',
  'bg-[radial-gradient(circle_at_left,_rgba(2,132,199,0.25),_transparent_60%)]'
];

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const redirectTarget = useMemo(() => {
    const redirectTo = typeof router.query.redirectTo === 'string' ? router.query.redirectTo : null;
    if (redirectTo && redirectTo.startsWith('/')) {
      return redirectTo;
    }
    return '/select-assistant';
  }, [router.query.redirectTo]);

  useEffect(() => {
    const ensureSignedOut = async () => {
      try {
        const {
          data: { session }
        } = await supabase.auth.getSession();

        if (session) {
          router.replace(redirectTarget);
        }
      } catch (error) {
        console.error('Error while validating existing session', error);
      }
    };

    ensureSignedOut();
  }, [redirectTarget, router]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (isSubmitting) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        console.error('Supabase login error', error);
        setErrorMessage(
          error.message === 'Invalid login credentials'
            ? 'Onjuiste combinatie. Controleer je e-mailadres en wachtwoord.'
            : 'Inloggen is niet gelukt. Probeer het later opnieuw.'
        );
        return;
      }

      setSuccessMessage('Welkom terug! Je wordt nu doorgestuurd...');
      setTimeout(() => {
        router.replace(redirectTarget);
      }, 800);
    } catch (error) {
      console.error('Unexpected login error', error);
      setErrorMessage('Er ging iets mis tijdens het inloggen. Probeer het nog eens.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center relative overflow-hidden">
      <Head>
        <title>Inloggen | CS Rental Portal</title>
      </Head>

      <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" aria-hidden="true" />
      {backgroundLayers.map((layer, index) => (
        <div key={index} className={`absolute inset-0 ${layer} blur-3xl opacity-90`} aria-hidden="true" />
      ))}

      <div className="relative z-10 w-full max-w-md px-6">
        <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl shadow-2xl shadow-blue-900/20 p-10">
          <div className="flex items-center justify-between mb-8">
            <div>
              <p className="uppercase tracking-[0.35em] text-xs text-cyan-200/70">Restricted Access</p>
              <h1 className="text-3xl font-semibold mt-3">Welkom terug</h1>
            </div>
            <div className="h-12 w-12 rounded-full bg-gradient-to-br from-cyan-500/50 to-indigo-500/30 flex items-center justify-center">
              <span className="text-xl">🔐</span>
            </div>
          </div>

          <p className="text-sm text-slate-300/80 leading-relaxed mb-10">
            Toegang uitsluitend voor geautoriseerde collega&apos;s. Gebruik je Supabase inloggegevens om verder te gaan.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            <div>
              <label htmlFor="email" className="block text-xs uppercase tracking-[0.3em] text-slate-300/60 mb-3">
                Zakelijk e-mailadres
              </label>
              <input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={event => setEmail(event.target.value)}
                className="w-full bg-slate-900/70 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:border-transparent transition"
                placeholder="voornaam.achternaam@bedrijf.com"
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-xs uppercase tracking-[0.3em] text-slate-300/60 mb-3">
                Wachtwoord
              </label>
              <input
                id="password"
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={event => setPassword(event.target.value)}
                className="w-full bg-slate-900/70 border border-white/10 rounded-xl px-4 py-3 text-sm placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-400/60 focus:border-transparent transition"
                placeholder="••••••••••"
              />
            </div>

            {errorMessage ? (
              <div className="rounded-xl border border-red-500/40 bg-red-500/10 text-red-200 text-sm px-4 py-3">
                {errorMessage}
              </div>
            ) : null}

            {successMessage ? (
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 text-emerald-200 text-sm px-4 py-3">
                {successMessage}
              </div>
            ) : null}

            <button
              type="submit"
              disabled={isSubmitting || !email || !password}
              className="w-full inline-flex items-center justify-center gap-2 bg-gradient-to-r from-cyan-500 via-blue-500 to-indigo-500 hover:from-cyan-400 hover:via-blue-400 hover:to-indigo-400 disabled:opacity-50 disabled:cursor-not-allowed text-sm font-medium tracking-[0.2em] uppercase py-3 rounded-xl transition"
            >
              {isSubmitting ? 'Verifiëren…' : 'Inloggen'}
              <span className="text-lg">→</span>
            </button>
          </form>

          <div className="mt-10 text-xs text-slate-400/70 uppercase tracking-[0.25em] text-center">
            Supabase Secure Gateway
          </div>
        </div>
      </div>

      <div className="absolute bottom-6 inset-x-0 text-center text-[0.65rem] uppercase tracking-[0.3em] text-slate-400/60">
        Audit trail actief • Pogingen worden gelogd
      </div>
    </div>
  );
}
