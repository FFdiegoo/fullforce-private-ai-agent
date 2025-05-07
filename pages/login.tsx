// pages/login.tsx
import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    const { error } = await supabase.auth.signInWithOtp({ email });

    setLoading(false);

    if (error) {
      alert('Fout bij inloggen: ' + error.message);
    } else {
      alert('Check je e-mail voor een login-link!');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Log in</h1>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="Voer je e-mail in"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <button type="submit" disabled={loading}>
          {loading ? 'Verzenden...' : 'Login-link sturen'}
        </button>
      </form>
    </div>
  );
}