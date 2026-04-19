-- V10 M1 RLS Remediation
-- Reverses 20260417102416_disable_rls_all_tables and closes remaining gaps.
-- Non-breaking: app uses service-role admin client; service_role_all policies preserve behavior.
-- Defers pg_trgm schema move (needs branch test).

-- Section 1: Enable RLS on all 17 public tables
ALTER TABLE public.api_usage               ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.clip_batch              ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_calendar        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.content_revisions       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.figure_hadith_refs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.figure_quran_refs       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hadith_corpus           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.hadith_verifications    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.islamic_figures         ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oauth_connections       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_hadith_refs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.posts                   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.quran_cache             ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.surah_metadata          ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tafsir_cache            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_profiles           ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.video_projects          ENABLE ROW LEVEL SECURITY;

-- Section 2: service_role full access on every table
CREATE POLICY "service_role_all" ON public.api_usage            FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.clip_batch           FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.content_calendar     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.content_revisions    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.figure_hadith_refs   FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.figure_quran_refs    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.hadith_corpus        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.hadith_verifications FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.islamic_figures      FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.oauth_connections    FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.post_hadith_refs     FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.posts                FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.quran_cache          FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.surah_metadata       FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.tafsir_cache         FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.user_profiles        FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_all" ON public.video_projects       FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Section 3: authenticated-read on shared reference tables
CREATE POLICY "authenticated_read" ON public.hadith_corpus        FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.quran_cache          FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.tafsir_cache         FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.islamic_figures      FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.surah_metadata       FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.figure_hadith_refs   FOR SELECT TO authenticated USING (true);
CREATE POLICY "authenticated_read" ON public.figure_quran_refs    FOR SELECT TO authenticated USING (true);

-- Section 4: Revoke anon/authenticated from oauth_connections (tokens)
REVOKE ALL ON TABLE public.oauth_connections FROM anon;
REVOKE ALL ON TABLE public.oauth_connections FROM authenticated;

-- Section 5: Log
DO $$
BEGIN
  RAISE NOTICE 'V10 RLS remediation complete';
END $$;
