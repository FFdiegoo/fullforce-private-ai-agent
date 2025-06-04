/*
  # Create document chunks table with vector support

  1. New Tables
    - `document_chunks`
      - `id` (uuid, primary key)
      - `content` (text, chunk content)
      - `embedding` (vector, 1536-dimensional embedding)
      - `metadata` (jsonb, document metadata)
      - `chunk_index` (integer, position in document)
      - `created_at` (timestamp)
  
  2. Security
    - Enable RLS on `document_chunks` table
    - Add policy for authenticated users to read chunks
*/

-- Enable vector extension if not already enabled
CREATE EXTENSION IF NOT EXISTS vector;

-- Create document chunks table
CREATE TABLE IF NOT EXISTS document_chunks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  content text NOT NULL,
  embedding vector(1536),
  metadata jsonb NOT NULL,
  chunk_index integer NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Create index for vector similarity search
CREATE INDEX IF NOT EXISTS document_chunks_embedding_idx ON document_chunks 
USING ivfflat (embedding vector_cosine_ops)
WITH (lists = 100);

-- Enable RLS
ALTER TABLE document_chunks ENABLE ROW LEVEL SECURITY;

-- Create policy for reading chunks
CREATE POLICY "Users can read document chunks"
  ON document_chunks
  FOR SELECT
  TO authenticated
  USING (true);

-- Add processed status columns to documents_metadata
ALTER TABLE documents_metadata 
ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false,
ADD COLUMN IF NOT EXISTS processed_at timestamptz;