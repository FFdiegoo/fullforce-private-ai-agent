import { useEffect, useState } from 'react';

type Msg = { role: 'user'|'assistant'|'system'; content: string; created_at?: string; sources?: any };

export default function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/chat/history');
      const json = await res.json();
      setMessages(json.messages || []);
    })();
  }, []);

  async function send() {
    const m = input.trim();
    if (!m) return;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: m }]);

    const res = await fetch('/api/chat', {
      method: 'POST',
      body: JSON.stringify({ message: m })
    });
    const json = await res.json();

    if (json?.answer) {
      setMessages(prev => [...prev, { role: 'assistant', content: json.answer, sources: json.sources }]);
    } else {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Er ging iets mis.' }]);
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4">
      <h1 className="text-xl font-semibold mb-4">Chat</h1>
      <div className="border rounded p-3 h-[60vh] overflow-auto">
        {messages.map((m, idx) => (
          <div key={idx} className="mb-3">
            <div className={`font-medium ${m.role === 'user' ? 'text-blue-600' : 'text-green-700'}`}>
              {m.role === 'user' ? 'Jij' : 'Assistant'}
            </div>
            <div className="whitespace-pre-wrap">{m.content}</div>
            {m.sources?.length ? (
              <details className="mt-1">
                <summary className="cursor-pointer text-sm underline">Bronnen</summary>
                <pre className="text-xs bg-gray-50 p-2 rounded">{JSON.stringify(m.sources, null, 2)}</pre>
              </details>
            ) : null}
          </div>
        ))}
      </div>

      <div className="flex gap-2 mt-3">
        <textarea
          className="flex-1 border rounded p-2"
          value={input}
          placeholder="Typ je bericht…"
          onChange={e => setInput(e.target.value)}
        />
        <button className="px-4 py-2 bg-black text-white rounded" onClick={send}>Versturen</button>
      </div>
    </div>
  );
}
