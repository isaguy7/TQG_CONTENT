-- TQG Content Studio — V3 refinements
-- Adds figure → hadith and figure → quran junctions, plus posts.labels.
-- RLS disabled in line with the rest of the schema.

create table if not exists figure_hadith_refs (
  figure_id uuid not null references islamic_figures(id) on delete cascade,
  hadith_corpus_id uuid not null references hadith_corpus(id) on delete cascade,
  relevance_note text,
  created_at timestamptz not null default now(),
  primary key (figure_id, hadith_corpus_id)
);

create table if not exists figure_quran_refs (
  figure_id uuid not null references islamic_figures(id) on delete cascade,
  verse_key text not null,
  surah int4 not null,
  ayah int4 not null,
  relevance_note text,
  tafseer_note text,
  created_at timestamptz not null default now(),
  primary key (figure_id, verse_key)
);

create index if not exists figure_hadith_refs_hadith_idx
  on figure_hadith_refs (hadith_corpus_id);
create index if not exists figure_quran_refs_surah_idx
  on figure_quran_refs (surah, ayah);

alter table figure_hadith_refs disable row level security;
alter table figure_quran_refs disable row level security;

alter table posts add column if not exists labels text[] not null default '{}';
create index if not exists posts_labels_idx on posts using gin (labels);
