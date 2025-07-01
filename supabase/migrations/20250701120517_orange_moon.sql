/*
  # Complete Vector Search Setup for RAG

  1. New Tables
    - `document_chunks`
      - `id` (uuid, primary key)
      - `content` (text, chunk content)
      - `embedding` (vector, 1536-dimensional embedding)
      - `metadata` (jsonb, document metadata)
      - `chunk_index` (integer, position in document)
      - `created_at` (timestamp)
  
  2. Functions
    - `match_documents` - Vector similarity search function
    - Returns documents ranked by similarity to query embedding
  
  3. Indexes
    - Vector similarity index for fast cosine distance calculation
    - Text search index for fallback searches
  
  4. Security
    - RLS policies for proper access control
    - Authenticated users can read chunks
    - Service role can manage chunks
*/

-- Enable vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document chunks table with vector support
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(1536),
  metadata jsonb NOT NULL,
  chunk_index integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create vector similarity search function
CREATE OR REPLACE FUNCTION match_documents (
  query_embedding vector(1536),
  match_threshold float DEFAULT 0.7,
  match_count int DEFAULT 5
)
RETURNS TABLE (
  id uuid,
  content text,
  metadata jsonb,
  similarity float
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT
    document_chunks.id,
    document_chunks.content,
    document_chunks.metadata,
    1 - (document_chunks.embedding <=> query_embedding) AS similarity
  FROM document_chunks
  WHERE 1 - (document_chunks.embedding <=> query_embedding) > match_threshold
  ORDER BY document_chunks.embedding <=> query_embedding
  LIMIT match_count;
END;
$$;

-- Create index for vector similarity search (IVFFlat for larger datasets)
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx 
ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Create text search index for fallback searches
CREATE INDEX IF NOT EXISTS document_chunks_content_idx 
ON document_chunks 
USING gin(to_tsvector('english', content));

-- Create index on metadata for filtering
CREATE INDEX IF NOT EXISTS document_chunks_metadata_idx 
ON document_chunks 
USING gin(metadata);

-- Create index on chunk_index for ordering
CREATE INDEX IF NOT EXISTS document_chunks_chunk_index_idx 
ON document_chunks(chunk_index);

-- Enable Row Level Security
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Create policy for reading chunks (all authenticated users can read)
CREATE POLICY "Users can read document chunks"
  ON document_chunks
  FOR SELECT
  TO authenticated
  USING (true);

-- Create policy for inserting chunks (only service role can insert)
CREATE POLICY "Service role can insert document chunks"
  ON document_chunks
  FOR INSERT
  TO service_role
  WITH CHECK (true);

-- Create policy for updating chunks (only service role can update)
CREATE POLICY "Service role can update document chunks"
  ON document_chunks
  FOR UPDATE
  TO service_role
  USING (true);

-- Create policy for deleting chunks (only service role can delete)
CREATE POLICY "Service role can delete document chunks"
  ON document_chunks
  FOR DELETE
  TO service_role
  USING (true);

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION match_documents TO authenticated;

-- Add processed status columns to documents_metadata if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'processed'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN processed boolean DEFAULT false;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'processed_at'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN processed_at timestamptz;
  END IF;
  
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'ready_for_indexing'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN ready_for_indexing boolean DEFAULT false;
  END IF;
END $$;