import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const publicAdmin = process.env.NEXT_PUBLIC_PUBLIC_ADMIN === 'true' || process.env.PUBLIC_ADMIN === 'true';
    if (!publicAdmin) {
      res.status(403).json({ error: 'disabled' });
      return;
    }

    const [{ data: docs }, { data: chunks }, { data: needsOcr }] = await Promise.all([
      (async () => {
        const response = await supabaseAdmin.rpc('sql', {
          query: 'select count(*)::int as c, sum((processed)::int)::int as p from documents_metadata'
        });
        if (!response.data || response.error) {
          // fallback: normal selects
          const { data: all } = await supabaseAdmin.from('documents_metadata').select('id, processed, chunk_count');
          return { data: { c: all?.length || 0, p: (all || []).filter(x => x.processed).length } as any };
        }
        return response;
      })(),
      supabaseAdmin.from('document_chunks').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('documents_metadata').select('id', { count: 'exact', head: true }).eq('needs_ocr', true),
    ]);

    const total_docs = (docs as any)?.c ?? 0;
    const processed_docs = (docs as any)?.p ?? 0;
    const chunksCount = (chunks as any)?.count ?? 0;
    const needsOcrCount = (needsOcr as any)?.count ?? 0;

    const { data: chatAgg } = await (async () => {
      const response = await supabaseAdmin.rpc('sql', {
        query: `
      select 
        (select count(*) from chat_sessions)::int as sessions,
        (select count(*) from chat_messages)::int as messages,
        (select max(created_at) from chat_messages)::timestamptz as last_message_at
    `
      });

      if (!response.data || response.error) {
        const [{ count: sessionCount }, { count: messageCount }, { data: last }] = await Promise.all([
          supabaseAdmin.from('chat_sessions').select('id', { count: 'exact', head: true }),
          supabaseAdmin.from('chat_messages').select('id', { count: 'exact', head: true }),
          supabaseAdmin
            .from('chat_messages')
            .select('created_at')
            .order('created_at', { ascending: false })
            .limit(1)
        ]);
        return {
          data: {
            sessions: sessionCount ?? 0,
            messages: messageCount ?? 0,
            last_message_at: last?.[0]?.created_at || null
          }
        };
      }

      return response;
    })();

    res.status(200).json({
      rag: { total_docs, processed_docs, chunks: chunksCount, needs_ocr: needsOcrCount },
      chat: chatAgg
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
}
