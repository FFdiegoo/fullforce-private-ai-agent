import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function ForgotPassword() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        throw error;
      }

      setSuccess(true);
    } catch (error: any) {
      console.error('Password reset request error:', error);
      setError(error.message || 'Failed to send reset email. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
        <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl w-full max-w-md p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">📧</span>
            </div>
            <h1 className="text-2xl font-bold text-gray-800 mb-2">
              Check Your Email
            </h1>
            <p className="text-gray-600">
              We've sent a password reset link to <strong>{email}</strong>. 
              Click the link in the email to reset your password.
            </p>
          </div>
          
          <div className="space-y-3">
            <button
              onClick={() => router.push('/login')}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl py-3 px-4 hover:opacity-90 transition-all duration-200 font-medium"
            >
              Back to Login
            </button>
            
            <button
              onClick={() => {
                setSuccess(false);
                setEmail('');
              }}
              className="w-full text-gray-600 hover:text-gray-800 transition-colors text-sm"
            >
              Send to different email
            </button>
          </div>
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
            Wachtwoord vergeten
          </h1>
          <p className="mt-1 text-[15px] text-[#6b7280]">
            Voer je e-mailadres in en we sturen je een link om je wachtwoord te resetten
          </p>
        </div>

        {error && (
          <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}

        <form onSubmit={handleForgotPassword} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              E-mailadres
            </label>
            <input
              type="email"
              id="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 rounded-md border border-[#d1d5db] focus:outline-none focus:ring-1 focus:ring-[#2563eb] focus:border-[#2563eb] transition-all duration-200"
              placeholder="naam@csrental.nl"
              required
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email}
            className={`w-full py-3 px-4 rounded-md font-medium transition-all duration-200 ${
              loading || !email
                ? 'bg-gray-300 cursor-not-allowed text-gray-500'
                : 'bg-[#2563eb] text-white hover:bg-[#1d4ed8]'
            }`}
          >
            {loading ? 'Link versturen...' : 'Verstuur reset link'}
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