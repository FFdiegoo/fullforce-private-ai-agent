import { useState } from 'react';

export default function Chat() {
  const [msg, setMsg] = useState('');
  const [log, setLog] = useState([]);
  
  async function send() {
    const { reply } = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt: msg }),
    }).then(r => r.json());
    setLog([...log, { user: msg, ai: reply }]);
    setMsg('');
  }
  
  return (
    <div>
      {log.map((c,i)=><div key={i}><b>U:</b> {c.user}<br/><b>AI:</b> {c.ai}</div>)}
      <input value={msg} onChange={e=>setMsg(e.target.value)} />
      <button onClick={send}>Send</button>
    </div>
  );
}