import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { useRouter } from 'next/router';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const router = useRouter();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const { error } = await supabase.auth.signInWithOtp({ email });
    if (error) {
      alert('Inloggen mislukt: ' + error.message);
    } else {
      alert('Check je e-mail voor een login-link!');
    }
  };

  return (
    <div style={{ padding: '2rem' }}>
      <h1>Inloggen</h1>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="diego@full-force.ai"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit">Login-link versturen</button>
      </form>
    </div>
  );
}