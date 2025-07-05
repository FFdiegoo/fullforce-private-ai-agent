/*
  # Add error tracking to documents_metadata

  1. New Columns
    - `last_error` (text, nullable) - Stores the last error message
    - `chunk_count` (integer, default 0) - Stores the number of chunks created
    
  2. Indexes
    - Add index on last_error for filtering documents with errors
*/

-- Add last_error column to documents_metadata if it doesn't exist
ALTER TABLE documents_metadata 
ADD COLUMN IF NOT EXISTS last_error text;

-- Add chunk_count column to documents_metadata if it doesn't exist
ALTER TABLE documents_metadata 
ADD COLUMN IF NOT EXISTS chunk_count integer DEFAULT 0;

-- Create index for better performance when filtering errors
CREATE INDEX IF NOT EXISTS idx_documents_metadata_last_error 
ON documents_metadata (last_error)
WHERE last_error IS NOT NULL;

-- Create index for better performance when filtering by chunk count
CREATE INDEX IF NOT EXISTS idx_documents_metadata_chunk_count 
ON documents_metadata (chunk_count);