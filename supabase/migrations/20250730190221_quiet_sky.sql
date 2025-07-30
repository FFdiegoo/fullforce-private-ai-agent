/*
  # RAG Pipeline Schema Synchronization

  1. Schema Updates
    - Add missing RAG pipeline columns to documents table
    - Ensure proper indexing for performance
    - Add embedding status enum
    - Update document_chunks table structure

  2. New Columns Added
    - safe_filename (unique, required for RAG)
    - file_size (integer, required for RAG)
    - content_type (string, required for RAG)
    - upload_date (datetime, required for RAG)
    - processed_date (datetime, nullable)
    - embedding_status (enum, required for RAG)
    - chunk_count (integer, nullable)
    - content (text, nullable)
    - summary (text, nullable)

  3. Performance Indexes
    - safe_filename (unique index)
    - embedding_status (for filtering)
    - upload_date (for sorting)
    - document_id + chunk_index (for chunks)

  4. Security
    - Maintain existing RLS policies
    - Ensure data integrity with constraints
*/

-- Add embedding status enum if not exists
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'EmbeddingStatus') THEN
    CREATE TYPE "EmbeddingStatus" AS ENUM ('PENDING', 'PROCESSING', 'COMPLETED', 'FAILED');
  END IF;
END $$;

-- Update documents_metadata table to match Prisma schema
DO $$
BEGIN
  -- Add safe_filename column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'safe_filename'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN safe_filename text;
    
    -- Generate safe_filename from existing filename
    UPDATE documents_metadata 
    SET safe_filename = CONCAT(EXTRACT(EPOCH FROM NOW())::text, '_', 
                              REGEXP_REPLACE(filename, '[^a-zA-Z0-9._-]', '_', 'g'))
    WHERE safe_filename IS NULL;
    
    -- Make it unique and not null
    ALTER TABLE documents_metadata ALTER COLUMN safe_filename SET NOT NULL;
    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_safe_filename ON documents_metadata(safe_filename);
  END IF;

  -- Add content_type column if not exists (map from mime_type)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'content_type'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN content_type text;
    UPDATE documents_metadata SET content_type = COALESCE(mime_type, 'application/octet-stream');
    ALTER TABLE documents_metadata ALTER COLUMN content_type SET NOT NULL;
  END IF;

  -- Add upload_date column if not exists (map from last_updated)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'upload_date'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN upload_date timestamptz DEFAULT now();
    UPDATE documents_metadata SET upload_date = COALESCE(last_updated, created_at, now());
    ALTER TABLE documents_metadata ALTER COLUMN upload_date SET NOT NULL;
  END IF;

  -- Add processed_date column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'processed_date'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN processed_date timestamptz;
    UPDATE documents_metadata SET processed_date = processed_at WHERE processed = true;
  END IF;

  -- Add embedding_status column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'embedding_status'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN embedding_status "EmbeddingStatus" DEFAULT 'PENDING';
    UPDATE documents_metadata 
    SET embedding_status = CASE 
      WHEN processed = true THEN 'COMPLETED'::EmbeddingStatus
      ELSE 'PENDING'::EmbeddingStatus
    END;
    ALTER TABLE documents_metadata ALTER COLUMN embedding_status SET NOT NULL;
  END IF;

  -- Add content column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'content'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN content text;
  END IF;

  -- Add summary column if not exists
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'summary'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN summary text;
  END IF;

  -- Ensure metadata column exists as jsonb
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'metadata' AND data_type = 'jsonb'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN metadata jsonb;
  END IF;

  -- Add user_id column if not exists (map from uploaded_by)
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'documents_metadata' AND column_name = 'user_id'
  ) THEN
    ALTER TABLE documents_metadata ADD COLUMN user_id text;
    UPDATE documents_metadata SET user_id = uploaded_by;
  END IF;
END $$;

-- Update document_chunks table structure
DO $$
BEGIN
  -- Ensure document_chunks table has correct structure
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'document_chunks') THEN
    
    -- Add document_id column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'document_chunks' AND column_name = 'document_id'
    ) THEN
      ALTER TABLE document_chunks ADD COLUMN document_id uuid;
    END IF;

    -- Add chunk_index column if not exists
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'document_chunks' AND column_name = 'chunk_index'
    ) THEN
      ALTER TABLE document_chunks ADD COLUMN chunk_index integer DEFAULT 0;
    END IF;

    -- Ensure embedding column exists as text (for JSON storage)
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'document_chunks' AND column_name = 'embedding' AND data_type = 'text'
    ) THEN
      -- If embedding exists as vector, keep it, otherwise add as text
      IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name = 'document_chunks' AND column_name = 'embedding'
      ) THEN
        ALTER TABLE document_chunks ADD COLUMN embedding text;
      END IF;
    END IF;

    -- Add unique constraint for document_id + chunk_index
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints
      WHERE table_name = 'document_chunks' AND constraint_name = 'document_chunks_document_id_chunk_index_key'
    ) THEN
      ALTER TABLE document_chunks ADD CONSTRAINT document_chunks_document_id_chunk_index_key 
      UNIQUE (document_id, chunk_index);
    END IF;
  END IF;
END $$;

-- Create performance indexes
CREATE INDEX IF NOT EXISTS idx_documents_embedding_status ON documents_metadata(embedding_status);
CREATE INDEX IF NOT EXISTS idx_documents_upload_date ON documents_metadata(upload_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_processed_date ON documents_metadata(processed_date DESC);
CREATE INDEX IF NOT EXISTS idx_documents_user_id ON documents_metadata(user_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_document_id ON document_chunks(document_id);
CREATE INDEX IF NOT EXISTS idx_document_chunks_chunk_index ON document_chunks(chunk_index);

-- Update RLS policies to work with new schema
-- (Existing policies should continue to work, but we'll ensure they're compatible)

-- Add helpful view for RAG pipeline
CREATE OR REPLACE VIEW rag_documents AS
SELECT 
  id,
  filename,
  safe_filename,
  file_size,
  content_type,
  upload_date,
  processed_date,
  embedding_status,
  chunk_count,
  content,
  summary,
  metadata,
  user_id,
  (CASE WHEN embedding_status = 'COMPLETED' THEN true ELSE false END) as is_ready_for_search
FROM documents_metadata;

-- Grant access to the view
GRANT SELECT ON rag_documents TO authenticated;
GRANT SELECT ON rag_documents TO service_role;