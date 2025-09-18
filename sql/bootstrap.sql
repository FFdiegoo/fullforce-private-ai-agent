-- pgvector
create extension if not exists vector;

-- ===== CHAT SESSIES & BERICHTEN =====
create table if not exists chat_sessions (
  id uuid primary key default gen_random_uuid(),
  session_key text unique not null,
  user_id uuid null,
  created_at timestamptz not null default now()
);

create index if not exists chat_sessions_session_key_idx on chat_sessions (session_key);

create table if not exists chat_messages (
  id bigserial primary key,
  session_id uuid not null references chat_sessions(id) on delete cascade,
  role text not null check (role in ('user','assistant','system')),
  content text not null,
  tokens_in int null,
  tokens_out int null,
  sources jsonb null,
  created_at timestamptz not null default now()
);

create index if not exists chat_messages_session_id_created_at_idx on chat_messages(session_id, created_at);

-- ===== DOCUMENTEN / RAG (alleen aanmaken als ze niet bestaan) =====
-- Document-metadata (verwacht in project; maak indien nodig)
create table if not exists documents_metadata (
  id uuid primary key default gen_random_uuid(),
  filename text not null,
  storage_path text not null,
  bucket text null,
  mime_type text null,
  ready_for_indexing boolean not null default false,
  processed boolean not null default false,
  processed_at timestamptz null,
  chunk_count int not null default 0,
  needs_ocr boolean not null default false,
  retry_count int not null default 0,
  last_error text null,
  last_updated timestamptz not null default now()
);

-- Chunks + embeddings
-- Gebruik 1536 dimensies (text-embedding-3-small)
create table if not exists document_chunks (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references documents_metadata(id) on delete cascade,
  chunk_index int not null,
  content text not null,
  embedding vector(1536) null,
  created_at timestamptz not null default now()
);

create index if not exists document_chunks_doc_id_idx on document_chunks(doc_id);
create unique index if not exists document_chunks_doc_id_chunk_index_idx on document_chunks(doc_id, chunk_index);
create index if not exists document_chunks_gin on document_chunks using ivfflat (embedding);

-- Similarity search helper
create or replace function match_documents(
  query_embedding vector(1536),
  similarity_threshold float,
  match_count int
) returns table(
  doc_id uuid,
  chunk_index int,
  content text,
  similarity float
) language sql stable as $$
  select
    dc.doc_id,
    dc.chunk_index,
    dc.content,
    1 - (dc.embedding <=> query_embedding) as similarity
  from document_chunks dc
  where dc.embedding is not null
    and 1 - (dc.embedding <=> query_embedding) >= similarity_threshold
  order by dc.embedding <=> query_embedding
  limit match_count
$$;
