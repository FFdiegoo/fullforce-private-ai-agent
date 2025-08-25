CREATE TABLE IF NOT EXISTS document_processing_queue (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES documents_metadata(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  processed BOOLEAN DEFAULT FALSE,
  processed_at TIMESTAMPTZ
);

-- Optional index for faster lookups
CREATE INDEX IF NOT EXISTS idx_document_processing_queue_processed ON document_processing_queue(processed, created_at);
