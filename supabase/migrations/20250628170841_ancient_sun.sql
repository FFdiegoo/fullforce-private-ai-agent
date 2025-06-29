/*
  # Fix documents_metadata table schema

  1. Schema Updates
    - Add missing columns to documents_metadata table
    - Ensure all required columns for RAG functionality exist
    - Set appropriate defaults and constraints

  2. Columns Added
    - file_size (bigint)
    - mime_type (text)
    - safe_filename (text)
    - ready_for_indexing (boolean)
    - processed (boolean)
    - processed_at (timestamptz)
*/

-- Check if documents_metadata table exists, create if not
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_name = 'documents_metadata'
  ) THEN
    CREATE TABLE documents_metadata (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      filename text NOT NULL,
      storage_path text NOT NULL,
      afdeling text,
      categorie text,
      onderwerp text,
      versie text,
      uploaded_by text,
      last_updated timestamptz DEFAULT now(),
      file_size bigint,
      mime_type text,
      safe_filename text,
      ready_for_indexing boolean DEFAULT false,
      processed boolean DEFAULT false,
      processed_at timestamptz
    );

    -- Enable RLS
    ALTER TABLE documents_metadata ENABLE ROW LEVEL SECURITY;

    -- Create policy for reading documents
    CREATE POLICY "Users can read documents"
      ON documents_metadata
      FOR SELECT
      TO authenticated
      USING (true);

    -- Create policy for admins to manage documents
    CREATE POLICY "Admins can manage documents"
      ON documents_metadata
      FOR ALL
      TO authenticated
      USING (
        EXISTS (
          SELECT 1 FROM profiles 
          WHERE email = (
            SELECT email FROM auth.users WHERE id = auth.uid()
          )
          AND role = 'admin'
        )
      );
  ELSE
    -- Add missing columns if they don't exist
    
    -- file_size column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'documents_metadata' AND column_name = 'file_size'
    ) THEN
      ALTER TABLE documents_metadata ADD COLUMN file_size bigint;
    END IF;

    -- mime_type column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'documents_metadata' AND column_name = 'mime_type'
    ) THEN
      ALTER TABLE documents_metadata ADD COLUMN mime_type text;
    END IF;

    -- safe_filename column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'documents_metadata' AND column_name = 'safe_filename'
    ) THEN
      ALTER TABLE documents_metadata ADD COLUMN safe_filename text;
    END IF;

    -- ready_for_indexing column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'documents_metadata' AND column_name = 'ready_for_indexing'
    ) THEN
      ALTER TABLE documents_metadata ADD COLUMN ready_for_indexing boolean DEFAULT false;
    END IF;

    -- processed column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'documents_metadata' AND column_name = 'processed'
    ) THEN
      ALTER TABLE documents_metadata ADD COLUMN processed boolean DEFAULT false;
    END IF;

    -- processed_at column
    IF NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'documents_metadata' AND column_name = 'processed_at'
    ) THEN
      ALTER TABLE documents_metadata ADD COLUMN processed_at timestamptz;
    END IF;
  END IF;
END $$;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_documents_metadata_processed ON documents_metadata(processed);
CREATE INDEX IF NOT EXISTS idx_documents_metadata_ready_for_indexing ON documents_metadata(ready_for_indexing);