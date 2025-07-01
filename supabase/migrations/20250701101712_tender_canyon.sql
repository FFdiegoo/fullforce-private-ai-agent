-- Enable the pgvector extension
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the match_documents function for vector similarity search
CREATE OR REPLACE FUNCTION match_documents(
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id bigint,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    document_chunks.id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
ON document_chunks USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create text search index for fallback
CREATE INDEX IF NOT EXISTS document_chunks_content_fts_idx 
ON document_chunks USING gin(to_tsvector('english', content));

-- Update RLS policies if needed
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read chunks
CREATE POLICY IF NOT EXISTS "Users can read document chunks" 
ON document_chunks FOR SELECT 
TO authenticated 
USING (true);

-- Allow service role to insert/update chunks
CREATE POLICY IF NOT EXISTS "Service role can manage chunks" 
ON document_chunks FOR ALL 
TO service_role 
USING (true);