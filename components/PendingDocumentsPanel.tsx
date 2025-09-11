import { useEffect, useState } from 'react';

interface PendingDoc {
  id: string;
  filename: string;
}

interface Props {
  className?: string;
}

export default function PendingDocumentsPanel({ className = '' }: Props) {
  const [docs, setDocs] = useState<PendingDoc[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectAll, setSelectAll] = useState(false);

  useEffect(() => {
    loadDocs();
  }, []);

  const loadDocs = async () => {
    const res = await fetch('/api/admin/pending-documents');
    const data = await res.json();
    setDocs(data.documents || []);
  };

  const toggle = (id: string) => {
    const newSet = new Set(selected);
    if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
    setSelected(newSet);
  };

  const toggleAll = () => {
    if (selectAll) {
      setSelected(new Set());
      setSelectAll(false);
    } else {
      setSelected(new Set(docs.map(d => d.id)));
      setSelectAll(true);
    }
  };

  const approve = async () => {
    await fetch('/api/admin/approve-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) })
    });
    setDocs(docs.filter(d => !selected.has(d.id)));
    setSelected(new Set());
    setSelectAll(false);
  };

  const reject = async () => {
    await fetch('/api/admin/reject-documents', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ids: Array.from(selected) })
    });
    setDocs(docs.filter(d => !selected.has(d.id)));
    setSelected(new Set());
    setSelectAll(false);
  };

  return (
    <div className={`bg-black border border-green-500 p-4 rounded-xl ${className}`}>
      <h3 className="text-lg font-semibold text-green-400 mb-4">Nieuwe documenten</h3>
      {docs.length === 0 ? (
        <p className="text-green-400">Geen documenten in wacht.</p>
      ) : (
        <div>
          <div className="flex items-center mb-2">
            <input type="checkbox" className="mr-2 accent-green-500" checked={selectAll} onChange={toggleAll} />
            <span className="text-green-400">Selecteer alles</span>
          </div>
          <ul className="max-h-64 overflow-auto mb-4">
            {docs.map(doc => (
              <li key={doc.id} className="flex items-center mb-1">
                <input
                  type="checkbox"
                  className="mr-2 accent-green-500"
                  checked={selected.has(doc.id)}
                  onChange={() => toggle(doc.id)}
                />
                <span className="text-green-500">{doc.filename}</span>
              </li>
            ))}
          </ul>
          <div className="flex space-x-2">
            <button
              onClick={approve}
              className="bg-green-700 hover:bg-green-600 text-black px-4 py-2 rounded"
            >
              ✅
            </button>
            <button
              onClick={reject}
              className="bg-red-700 hover:bg-red-600 text-white px-4 py-2 rounded"
            >
              ❌
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
