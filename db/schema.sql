CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE content_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  webflow_item_id  text UNIQUE,
  title            text NOT NULL,
  description      text NOT NULL,
  media_type       text NOT NULL CHECK (media_type IN ('audio','video','pdf')),
  use_cases        text NOT NULL DEFAULT '',
  modality         text,
  mood_tags        text NOT NULL DEFAULT '',
  duration_seconds integer,
  r2_key           text NOT NULL,
  public_url       text NOT NULL,
  content_page_url text,
  embedding        vector(1536) NOT NULL,
  program_id       uuid,
  sequence_order   integer,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX content_items_embedding_idx
  ON content_items USING hnsw (embedding vector_cosine_ops);

CREATE INDEX content_items_media_type_idx ON content_items (media_type);
CREATE INDEX content_items_program_id_idx ON content_items (program_id);

CREATE OR REPLACE FUNCTION match_content_items(
  query_embedding vector(1536),
  match_threshold float,
  match_count     int
)
RETURNS TABLE (
  id               uuid,
  webflow_item_id  text,
  title            text,
  description      text,
  media_type       text,
  use_cases        text,
  modality         text,
  mood_tags        text,
  duration_seconds integer,
  public_url       text,
  content_page_url text,
  similarity       float
)
LANGUAGE sql STABLE AS $$
  SELECT
    ci.id,
    ci.webflow_item_id,
    ci.title,
    ci.description,
    ci.media_type,
    ci.use_cases,
    ci.modality,
    ci.mood_tags,
    ci.duration_seconds,
    ci.public_url,
    ci.content_page_url,
    1 - (ci.embedding <=> query_embedding) AS similarity
  FROM content_items ci
  WHERE 1 - (ci.embedding <=> query_embedding) > match_threshold
  ORDER BY ci.embedding <=> query_embedding ASC
  LIMIT match_count;
$$;
