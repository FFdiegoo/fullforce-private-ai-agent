import { useState } from 'react';

export default function UserInviteForm() {
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [status, setStatus] = useState<string | null>(null);

  const handleInvite = async () => {
    setStatus(null);
    try {
      const res = await fetch('/api/admin/invite-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name })
      });
      if (!res.ok) throw new Error('Invite failed');
      setStatus('Uitnodiging verzonden');
      setEmail('');
      setName('');
    } catch (e) {
      setStatus('Fout bij versturen');
    }
  };

  return (
    <div className="bg-black border border-green-500 p-4 rounded-xl">
      <h3 className="text-lg font-semibold text-green-400 mb-4">Nieuwe gebruiker</h3>
      <div className="mb-2">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full p-2 bg-black border border-green-700 rounded text-green-500 placeholder-green-700"
        />
      </div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Voornaam"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className="w-full p-2 bg-black border border-green-700 rounded text-green-500 placeholder-green-700"
        />
      </div>
      <button
        onClick={handleInvite}
        className="bg-green-700 hover:bg-green-600 text-black px-4 py-2 rounded"
      >
        Verstuur link
      </button>
      {status && <p className="mt-2 text-sm text-green-400">{status}</p>}
    </div>
  );
}
