import { useState } from 'react';
import { useRouter } from 'next/router';
import { supabase } from '../lib/supabaseClient';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  // Inloggen met Supabase
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    if (error) {
      setMessage('Inloggen mislukt: ' + error.message);
    } else {
      setMessage('Inloggen gelukt! Je wordt doorgestuurd...');
      setTimeout(() => {
        router.push('/select-assistant');
      }, 1000);
    }
    setLoading(false);
  };

  // Wachtwoord vergeten
  const handleForgotPassword = async () => {
    if (!email) {
      setMessage('Vul eerst je e-mailadres in.');
      return;
    }
    setLoading(true);
    setMessage('');
    const { error } = await supabase.auth.resetPasswordForEmail(email);
    if (error) {
      setMessage('Er ging iets mis: ' + error.message);
    } else {
      setMessage('Check je e-mail voor een reset-link!');
    }
    setLoading(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 flex items-center justify-center p-4">
      <div className="bg-white/90 backdrop-blur-lg rounded-3xl shadow-2xl w-full max-w-md p-8 transform transition-all hover:scale-[1.01]">
        <div className="mb-8 text-center">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
            Welcome Back
          </h1>
          <p className="mt-3 text-gray-600">Sign in to your account</p>
        </div>
        
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Email Address
            </label>
            <input
              type="email"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
              placeholder="Enter your email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700">
              Password
            </label>
            <input
              type="password"
              required
              className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:ring-2 focus:ring-purple-500 focus:border-transparent transition-all duration-200 bg-white/50 backdrop-blur-sm"
              placeholder="Enter your password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl py-3 px-4 hover:opacity-90 transition-all duration-200 transform hover:scale-[1.02] font-medium shadow-lg hover:shadow-purple-500/25"
          >
            {loading ? 'Even geduld...' : 'Sign In'}
          </button>
        </form>

        <button
          type="button"
          onClick={handleForgotPassword}
          disabled={loading}
          className="w-full mt-4 text-purple-600 hover:text-indigo-600 text-sm underline transition-all"
        >
          Wachtwoord vergeten?
        </button>

        {message && (
          <div
            className={`mt-6 text-center text-sm ${
              message.startsWith('Inloggen gelukt') || message.startsWith('Check')
                ? 'text-green-600'
                : 'text-red-600'
            }`}
          >
            {message}
          </div>
        )}
      </div>
    </div>
  );
}