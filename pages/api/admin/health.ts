import type { NextApiRequest, NextApiResponse } from 'next';
import { OpenAI } from 'openai';
import { RAG_CONFIG } from '../../../lib/rag/config';
import { supabaseAdmin } from '../../../lib/server/supabaseAdmin';

const isPublicAdminEnabled = () =>
  process.env.NEXT_PUBLIC_PUBLIC_ADMIN === 'true' || process.env.PUBLIC_ADMIN === 'true';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (!isPublicAdminEnabled()) {
    return res.status(403).json({ error: 'disabled' });
  }

  try {
    const [documentsResp, chunksResp] = await Promise.all([
      supabaseAdmin.from('documents_metadata').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('document_chunks').select('id', { count: 'exact', head: true }),
    ]);

    const documents_count = documentsResp?.count ?? 0;
    const chunks_count = chunksResp?.count ?? 0;

    let sample_match: any = null;
    const apiKey = process.env.OPENAI_API_KEY;

    if (apiKey) {
      try {
        const client = new OpenAI({ apiKey });
        const embeddingResponse = await client.embeddings.create({
          model: RAG_CONFIG.embeddingModel,
          input: 'health check query',
        });
        const embedding = embeddingResponse.data?.[0]?.embedding;

        if (embedding) {
          const { data, error } = await supabaseAdmin.rpc('match_documents', {
            query_embedding: embedding,
            similarity_threshold: RAG_CONFIG.similarityThreshold,
            match_count: 1,
          });

          if (!error) {
            sample_match = data?.[0] ?? null;
          }
        }
      } catch (error) {
        console.warn('admin health embedding failed', error);
      }
    }

    if (!sample_match) {
      const { data } = await supabaseAdmin
        .from('document_chunks')
        .select('doc_id, chunk_index, content')
        .limit(1);
      sample_match = data?.[0] ?? null;
    }

    res.status(200).json({ documents_count, chunks_count, sample_match });
  } catch (error: any) {
    console.error('admin health error', error);
    res.status(500).json({ error: 'health check failed', detail: error?.message ?? String(error) });
  }
}
