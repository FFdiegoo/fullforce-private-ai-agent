import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';

export default function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);

  // Inloggen
  const handleLogin = async (e) => {
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
      // eventueel: router.push('/home');
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
    <div style={{ maxWidth: 400, margin: '0 auto', padding: 32 }}>
      <h2>Inloggen</h2>
      <form onSubmit={handleLogin}>
        <input
          type="email"
          placeholder="E-mail"
          value={email}
          onChange={e => setEmail(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12, padding: 8 }}
        />
        <input
          type="password"
          placeholder="Wachtwoord"
          value={password}
          onChange={e => setPassword(e.target.value)}
          required
          style={{ width: '100%', marginBottom: 12, padding: 8 }}
        />
        <button
          type="submit"
          disabled={loading}
          style={{ width: '100%', padding: 10, background: '#0070f3', color: 'white', border: 'none', borderRadius: 4 }}
        >
          {loading ? 'Even geduld...' : 'Inloggen'}
        </button>
      </form>
      <button
        type="button"
        onClick={handleForgotPassword}
        disabled={loading}
        style={{
          marginTop: 12,
          background: 'none',
          color: '#0070f3',
          border: 'none',
          cursor: 'pointer',
          textDecoration: 'underline',
        }}
      >
        Wachtwoord vergeten?
      </button>
      {message && (
        <div style={{ marginTop: 16, color: message.startsWith('Inloggen gelukt') || message.startsWith('Check') ? 'green' : 'red' }}>
          {message}
        </div>
      )}
    </div>
  );
}