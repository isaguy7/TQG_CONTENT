/**
 * Hadith types — corpus rows, verification rows, junction entries.
 *
 * The attach flow (§7 commit 3) treats `hadith_verifications` as an
 * org-scoped verification record: when a user attaches a corpus hadith
 * to a post, we find-or-create a verification row for that
 * (organization_id, hadith_corpus_id) pair. The verification starts
 * `verified=false` per the product rule and flips to true when a user
 * confirms via sunnah.com (§7 commit 4).
 *
 * post_hadith_refs links posts → verifications (not posts → corpus
 * directly), which is intentional: the reference carries a verification
 * state, not just a hadith body.
 */

export type HadithCollection =
  | "bukhari"
  | "muslim"
  | "abudawud"
  | "ibnmajah"
  | "nasai";

/** Grade label as stored in the corpus. Known values include
 *  sahih / hasan / daif / mawdu, but the DB column is a free text so
 *  we don't narrow the type. */
export type HadithGrade = string;

/** Canonical hadith_corpus row shape as returned by
 *  /api/hadith/search and /api/hadith-corpus/* routes. */
export interface HadithCorpus {
  id: string;
  collection: HadithCollection;
  collection_name: string;
  hadith_number: number;
  chapter_number: number | null;
  chapter_title_en: string | null;
  chapter_title_ar: string | null;
  arabic_text: string;
  english_text: string;
  narrator: string | null;
  grade: HadithGrade | null;
  sunnah_com_url: string | null;
  in_book_reference: string | null;
  created_at: string;
}

/** hadith_verifications row post-§7 migration. hadith_corpus_id is
 *  nullable because 2 legacy rows predate the corpus link; all new
 *  rows are corpus-linked. organization_id is always set (NOT NULL)
 *  and `verified` defaults to false. */
export interface HadithVerification {
  id: string;
  reference_text: string;
  sunnah_com_url: string | null;
  narrator: string | null;
  arabic_text: string | null;
  translation_en: string | null;
  grade: HadithGrade | null;
  verified: boolean;
  verification_notes: string | null;
  created_at: string;
  verified_at: string | null;
  hadith_corpus_id: string | null;
  organization_id: string;
  verified_by: string | null;
}

export interface PostHadithRef {
  post_id: string;
  hadith_id: string;
  position: number;
}

/** Denormalized shape the attach flow + AttachedHadithPanel render.
 *  Legacy rows may have corpus=null. */
export interface AttachedHadith {
  ref: PostHadithRef;
  verification: HadithVerification;
  corpus: HadithCorpus | null;
}
