/*
  # Harmonise RAG document schema

  - Ensure documents_metadata contains processing status columns with sane defaults
  - Align document_chunks to use doc_id as foreign key and enforce referential integrity
  - Clean up orphaned chunks and guarantee embedding column dimensions
  - Refresh the match_documents RPC to rely on doc_id and cosine similarity
  - Trigger a PostgREST schema cache reload so new columns are immediately available
*/

BEGIN;

-- Required extensions for UUID generation and pgvector
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS vector;

-- documents_metadata required columns
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS processed boolean DEFAULT false;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS processed_at timestamptz;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS needs_ocr boolean DEFAULT false;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS chunk_count integer DEFAULT 0;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS last_error text;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS storage_path text;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS mime_type text;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS filename text;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS ready_for_indexing boolean DEFAULT false;
ALTER TABLE public.documents_metadata
  ADD COLUMN IF NOT EXISTS last_updated timestamptz DEFAULT now();

-- Ensure sensible defaults and non-null values
UPDATE public.documents_metadata
SET
  processed = COALESCE(processed, false),
  needs_ocr = COALESCE(needs_ocr, false),
  chunk_count = COALESCE(chunk_count, 0),
  retry_count = COALESCE(retry_count, 0),
  ready_for_indexing = COALESCE(ready_for_indexing, false),
  last_updated = COALESCE(last_updated, now());

ALTER TABLE public.documents_metadata
  ALTER COLUMN processed SET DEFAULT false,
  ALTER COLUMN needs_ocr SET DEFAULT false,
  ALTER COLUMN chunk_count SET DEFAULT 0,
  ALTER COLUMN retry_count SET DEFAULT 0,
  ALTER COLUMN ready_for_indexing SET DEFAULT false,
  ALTER COLUMN last_updated SET DEFAULT now();

-- Prefer not-null semantics where possible
ALTER TABLE public.documents_metadata
  ALTER COLUMN processed SET NOT NULL,
  ALTER COLUMN needs_ocr SET NOT NULL,
  ALTER COLUMN chunk_count SET NOT NULL,
  ALTER COLUMN retry_count SET NOT NULL,
  ALTER COLUMN ready_for_indexing SET NOT NULL;

-- document_chunks column alignment
DO
$$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_chunks'
      AND column_name = 'document_id'
  ) THEN
    EXECUTE 'ALTER TABLE public.document_chunks RENAME COLUMN document_id TO doc_id';
  END IF;
END
$$;

ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS doc_id uuid;

-- Ensure doc_id column type is UUID
DO
$$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'document_chunks'
      AND column_name = 'doc_id'
      AND data_type <> 'uuid'
  ) THEN
    EXECUTE 'ALTER TABLE public.document_chunks ALTER COLUMN doc_id TYPE uuid USING doc_id::uuid';
  END IF;
END
$$;

-- Guarantee chunk_index defaults
ALTER TABLE public.document_chunks
  ALTER COLUMN chunk_index SET DEFAULT 0;
UPDATE public.document_chunks SET chunk_index = 0 WHERE chunk_index IS NULL;
ALTER TABLE public.document_chunks
  ALTER COLUMN chunk_index SET NOT NULL;

-- Ensure id has a default generator
ALTER TABLE public.document_chunks
  ALTER COLUMN id SET DEFAULT gen_random_uuid();

-- Ensure embedding column exists and has correct dimension
ALTER TABLE public.document_chunks
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

DO
$$
DECLARE
  current_dim integer;
BEGIN
  SELECT atttypmod - 4
    INTO current_dim
  FROM pg_attribute
  WHERE attrelid = 'public.document_chunks'::regclass
    AND attname = 'embedding'
    AND NOT attisdropped;

  IF current_dim IS NOT NULL AND current_dim <> 1536 THEN
    EXECUTE 'ALTER TABLE public.document_chunks ALTER COLUMN embedding TYPE vector(1536)';
  END IF;
END
$$;

-- Remove orphaned chunks and enforce FK integrity
DELETE FROM public.document_chunks dc
WHERE dc.doc_id IS NULL
   OR NOT EXISTS (
     SELECT 1 FROM public.documents_metadata dm WHERE dm.id = dc.doc_id
   );

ALTER TABLE public.document_chunks
  ALTER COLUMN doc_id SET NOT NULL;

DO
$$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.document_chunks'::regclass
      AND conname = 'document_chunks_doc_id_fkey'
  ) THEN
    EXECUTE 'ALTER TABLE public.document_chunks
      ADD CONSTRAINT document_chunks_doc_id_fkey
      FOREIGN KEY (doc_id)
      REFERENCES public.documents_metadata(id)
      ON DELETE CASCADE';
  END IF;
END
$$;

-- Index for fast lookup / idempotent creation
CREATE INDEX IF NOT EXISTS document_chunks_doc_id_idx
  ON public.document_chunks (doc_id);

CREATE UNIQUE INDEX IF NOT EXISTS document_chunks_doc_id_chunk_index_key
  ON public.document_chunks (doc_id, chunk_index);

-- Refresh the vector search RPC to emit doc_id
CREATE OR REPLACE FUNCTION public.match_documents(
  query_embedding vector(1536),
  similarity_threshold double precision DEFAULT 0.7,
  match_count integer DEFAULT 5
)
RETURNS TABLE (
  doc_id uuid,
  chunk_index integer,
  content text,
  similarity double precision
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    dc.doc_id,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) AS similarity
  FROM public.document_chunks dc
  WHERE dc.embedding IS NOT NULL
    AND (
      similarity_threshold IS NULL
      OR 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
    )
  ORDER BY dc.embedding <=> query_embedding
  LIMIT GREATEST(1, COALESCE(match_count, 5));
END;
$$;

GRANT EXECUTE ON FUNCTION public.match_documents(vector(1536), double precision, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_documents(vector(1536), double precision, integer) TO service_role;

-- Ask PostgREST to refresh its schema cache so new columns show up immediately
NOTIFY pgrst, 'reload schema';

COMMIT;
