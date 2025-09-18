import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';
import { OpenAI } from 'openai';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  try {
    const [{ data: dm }, { data: ch }] = await Promise.all([
      supabaseAdmin.from('documents_metadata').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('document_chunks').select('id', { count: 'exact', head: true })
    ]);

    // test embedding
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    const emb = await openai.embeddings.create({
      model: process.env.RAG_EMBEDDING_MODEL || 'text-embedding-3-small',
      input: 'test query'
    });
    const vec = emb.data?.[0]?.embedding;

    let sample: any = null;
    if (vec) {
      const { data } = await supabaseAdmin.rpc('match_documents', {
        query_embedding: vec,
        similarity_threshold: Number(process.env.RAG_SIMILARITY_THRESHOLD || 0.5),
        match_count: 1
      });
      sample = data?.[0] || null;
    }

    res.status(200).json({
      documents_count: dm?.count ?? 0,
      chunks_count: ch?.count ?? 0,
      sample_match: sample
    });
  } catch (e: any) {
    console.error(e);
    res.status(500).json({ error: 'health check failed', detail: e?.message });
  }
}
