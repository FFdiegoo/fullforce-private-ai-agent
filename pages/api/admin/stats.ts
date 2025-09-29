import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

type ChatAgg = {
  sessions: number;
  messages: number;
  last_message_at: string | null;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    // --- RAG stats ---
    const docsRpcPromise = (async () => {
      try {
        return await supabaseAdmin.rpc('sql', {
          query:
            'select count(*)::int as c, sum((processed)::int)::int as p from documents_metadata',
        });
      } catch {
        return { data: null, error: new Error('rpc sql not available') };
      }
    })();

    const [docsRpcResp, chunksResp, needsOcrResp] = await Promise.all([
      // Probeer een (optionele) RPC die raw SQL uitvoert; val terug op normale selects als die niet bestaat.
      docsRpcPromise,
      supabaseAdmin
        .from('document_chunks')
        .select('id', { count: 'exact', head: true }),
      supabaseAdmin
        .from('documents_metadata')
        .select('id', { count: 'exact', head: true })
        .eq('needs_ocr', true),
    ]);

    let total_docs = 0;
    let processed_docs = 0;

    if ((docsRpcResp as any)?.data && !(docsRpcResp as any)?.error) {
      // RPC succesvol; verwacht één record met velden c en p
      const d = (docsRpcResp as any).data as { c?: number; p?: number };
      total_docs = d?.c ?? 0;
      processed_docs = d?.p ?? 0;
    } else {
      // Fallback: normale selects
      const { data: all } = await supabaseAdmin
        .from('documents_metadata')
        .select('processed');
      total_docs = all?.length ?? 0;
      processed_docs = (all ?? []).filter((x: any) => x.processed).length;
    }

    const chunksCount = (chunksResp as any)?.count ?? 0;
    const needsOcrCount = (needsOcrResp as any)?.count ?? 0;

    // --- Chat aggregaties ---
    let chatAgg: ChatAgg = { sessions: 0, messages: 0, last_message_at: null };

    const chatRpcResp = await (async () => {
      try {
        return await supabaseAdmin.rpc('sql', {
          query: `
          select
            (select count(*) from chat_sessions)::int as sessions,
            (select count(*) from chat_messages)::int as messages,
            (select max(created_at) from chat_messages)::timestamptz as last_message_at
        `,
        });
      } catch {
        return null as any;
      }
    })();

    if (chatRpcResp?.data && !chatRpcResp?.error) {
      chatAgg = chatRpcResp.data as ChatAgg;
    } else {
      // Fallback zonder RPC
      const [sessionsRes, messagesRes, lastMsgRes] = await Promise.all([
        supabaseAdmin
          .from('chat_sessions')
          .select('id', { count: 'exact', head: true }),
        supabaseAdmin
          .from('chat_messages')
          .select('id', { count: 'exact', head: true }),
        supabaseAdmin
          .from('chat_messages')
          .select('created_at')
          .order('created_at', { ascending: false })
          .limit(1),
      ]);

      chatAgg = {
        sessions: (sessionsRes as any)?.count ?? 0,
        messages: (messagesRes as any)?.count ?? 0,
        last_message_at: (lastMsgRes as any)?.data?.[0]?.created_at ?? null,
      };
    }

    res.status(200).json({
      rag: {
        total_docs,
        processed_docs,
        chunks: chunksCount,
        needs_ocr: needsOcrCount,
      },
      chat: chatAgg,
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'Internal error' });
  }
}
