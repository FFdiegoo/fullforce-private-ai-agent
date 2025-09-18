import { useEffect, useState } from 'react';

type CountRes = { total_docs: number; processed_docs: number; chunks: number; needs_ocr: number; };
type ChatStat = { messages: number; sessions: number; last_message_at: string | null; };

export default function AdminHome() {
  const [allowed, setAllowed] = useState(false);
  const [counts, setCounts] = useState<CountRes | null>(null);
  const [chat, setChat] = useState<ChatStat | null>(null);

  useEffect(() => {
    const ok = process.env.NEXT_PUBLIC_PUBLIC_ADMIN === 'true' || process.env.PUBLIC_ADMIN === 'true';
    setAllowed(!!ok);

    (async () => {
      const a = await fetch('/api/admin/stats').then(r => r.json()).catch(() => null);
      setCounts(a?.rag || null);
      setChat(a?.chat || null);
    })();
  }, []);

  if (!allowed) return <div className="p-6">403 — Admin tijdelijk uitgeschakeld</div>;

  return (
    <div className="max-w-5xl mx-auto p-6">
      <h1 className="text-2xl font-semibold mb-6">Admin Dashboard</h1>

      <section className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Totaal documenten</div>
          <div className="text-3xl font-bold">{counts?.total_docs ?? '—'}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Geprocessd</div>
          <div className="text-3xl font-bold">{counts?.processed_docs ?? '—'}</div>
        </div>
        <div className="border rounded p-4">
          <div className="text-sm text-gray-500">Chunks</div>
          <div className="text-3xl font-bold">{counts?.chunks ?? '—'}</div>
        </div>
      </section>

      <section className="border rounded p-4 mb-6">
        <div className="text-sm text-gray-500">Needs OCR</div>
        <div className="text-2xl font-semibold">{counts?.needs_ocr ?? '—'}</div>
      </section>

      <section className="border rounded p-4">
        <h2 className="text-lg font-semibold mb-2">Chat gebruik</h2>
        <div className="text-sm">Sessions: <b>{chat?.sessions ?? '—'}</b></div>
        <div className="text-sm">Messages: <b>{chat?.messages ?? '—'}</b></div>
        <div className="text-sm">Laatste: <b>{chat?.last_message_at ?? '—'}</b></div>
      </section>
    </div>
  );
}
