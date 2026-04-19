-- TQG Content Studio — Phase 3.5
-- Local hadith corpus. ~34k rows imported once from the six major collections.
-- Full-text + trigram indexes drive instant search. RLS disabled.

create extension if not exists "pg_trgm";

create table if not exists hadith_corpus (
  id uuid primary key default gen_random_uuid(),
  collection text not null,
  collection_name text not null,
  hadith_number int4 not null,
  chapter_number int4,
  chapter_title_en text,
  chapter_title_ar text,
  arabic_text text not null,
  english_text text not null,
  narrator text,
  grade text,
  sunnah_com_url text,
  in_book_reference text,
  created_at timestamptz not null default now()
);

create index if not exists hadith_corpus_english_fts_idx
  on hadith_corpus using gin (to_tsvector('english', english_text));

create index if not exists hadith_corpus_english_trgm_idx
  on hadith_corpus using gin (english_text gin_trgm_ops);

create index if not exists hadith_corpus_collection_num_idx
  on hadith_corpus (collection, hadith_number);

alter table hadith_corpus disable row level security;
