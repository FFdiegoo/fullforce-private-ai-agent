alter table documents_metadata add column if not exists needs_ocr boolean default false;
create index if not exists idx_docs_ready_processed on documents_metadata (ready_for_indexing, processed);
