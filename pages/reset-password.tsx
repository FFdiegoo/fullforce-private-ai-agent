import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';
import Image from 'next/image';

export default function ResetPassword() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const [tokensChecked, setTokensChecked] = useState(false);

  useEffect(() => {
    // Extract tokens from URL hash or search params
    const parseParams = () => {
      if (typeof window === 'undefined') return new URLSearchParams();
      if (window.location.hash) {
        return new URLSearchParams(window.location.hash.substring(1));
      }
      return new URLSearchParams(window.location.search);
    };

    let params = parseParams();
    let accessToken = params.get('access_token');
    let refreshToken = params.get('refresh_token');
    let type = params.get('type');

    // Fallback to query parameters if hash didn't contain tokens
    if ((!accessToken || !refreshToken) && window.location.search) {
      params = new URLSearchParams(window.location.search);
      accessToken = accessToken ?? params.get('access_token');
      refreshToken = refreshToken ?? params.get('refresh_token');
      type = type ?? params.get('type');
    }

    if (type !== 'recovery' || !accessToken || !refreshToken) {
      setError('Invalid or expired reset link. Please request a new password reset.');
      setTokensChecked(true);
      return;
    }

    supabase.auth.setSession({
      access_token: accessToken!,
      refresh_token: refreshToken!,
    }).then(({ error }) => {
      if (error) {
        setError('Failed to validate reset link. Please request a new password reset.');
      }
      setTokensChecked(true);
    });
  }, []);

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    // Validation
    if (password.length < 6) {
      setError('Password must be at least 6 characters long');
      setLoading(false);
      return;
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      setLoading(false);
      return;
    }

    try {
      // Gebruik de oudere API voor het updaten van het wachtwoord
      const { error: updateError } = await supabase.auth.updateUser({
        password: password
      });

      if (updateError) {
        throw updateError;
      }

      setSuccess(true);

      // Redirect to login after 3 seconds
      setTimeout(() => {
        router.push('/login');
      }, 3000);

    } catch (error: any) {
      console.error('Password reset error:', error);
      setError(error.message || 'Failed to reset password. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!tokensChecked) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <span>Even geduld...</span>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen bg-[#f7f8f9] flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-md w-full max-w-[420px] p-8 text-center">
          <div className="mb-6">
            <div className="flex justify-center mb-6">
              <Image 
                src="https://csrental.nl/wp-content/uploads/2023/03/CS-Rental-logo-1.png" 
                alt="CS Rental Logo" 
                width={100} 
                height={40} 
                className="h-10 w-auto"
              />
            </div>
            <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-xl text-green-600">✓</span>
            </div>
            <h1 className="text-[22px] font-semibold text-[#111827] mb-2">
              Wachtwoord reset gelukt
            </h1>
            <p className="text-[15px] text-[#6b7280]">
              Je wachtwoord is succesvol bijgewerkt. Je wordt doorgestuurd naar de inlogpagina.
            </p>
          </div>
          <button
            onClick={() => router.push('/login')}
            className="w-full bg-[#2563eb] text-white rounded-md py-3 px-4 hover:bg-[#1d4ed8] transition-all duration-200 font-medium"
          >
            Naar inloggen
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f7f8f9] flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-md w-full max-w-[420px] p-8">
        <div className="mb-6 text-center">
          <div className="flex justify-center mb-6">
            <Image 
              src="https://csrental.nl/wp-content/uploads/2023/03/CS-Rental-logo-1.png" 
              alt="CS Rental Logo" 
              width={100} 
              height={40} 
              className="h-10 w-auto"
            />
          </div>
          <h1 className="text-[22px] font-semibold text-[#111827]">
            Reset wachtwoord
          </h1>
          <p className="mt-1 text-[15px] text-[#6b7280]">
            Voer je nieuwe wachtwoord hieronder in
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleResetPassword} className="space-y-6">
          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Nieuw wachtwoord
            </label>
            <input
              type="password"
              id="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#d1d5db] focus:outline-none focus:ring-1 focus:ring-[#2563eb] focus:border-[#2563eb] transition-all duration-200"
              placeholder="Voer nieuw wachtwoord in"
              required
              minLength={6}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Bevestig wachtwoord
            </label>
            <input
              type="password"
              id="confirmPassword"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#d1d5db] focus:outline-none focus:ring-1 focus:ring-[#2563eb] focus:border-[#2563eb] transition-all duration-200"
              placeholder="Bevestig nieuw wachtwoord"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading || !password || !confirmPassword}
            className={`w-full py-3 px-4 rounded-md font-medium transition-all duration-200 ${
              loading || !password || !confirmPassword
                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
            }`}
          >
            {loading ? 'Wachtwoord bijwerken...' : 'Wachtwoord bijwerken'}
          </button>
        </form>

        <div className="mt-6 text-center">
          <button
            onClick={() => router.push('/login')}
            className="text-sm text-[#2563eb] hover:text-[#1d4ed8] transition-colors"
          >
            Terug naar inloggen
          </button>
        </div>
      </div>
    </div>
  );
}