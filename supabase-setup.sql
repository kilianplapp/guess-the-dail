-- ============================================================================
-- Guess the Dáil — Supabase Database Setup
-- ============================================================================
-- Run this entire script in your Supabase SQL Editor to set up the database.
--
-- Steps:
-- 1. Create a free project at https://supabase.com
-- 2. Go to SQL Editor → New Query
-- 3. Paste this entire file and run it
-- 4. Go to Project Settings → API
-- 5. Copy the "Project URL" and "anon public key"
-- 6. Paste them into config.js (replace the placeholder values)
-- ============================================================================

-- The guesses table stores every anonymous guess made in the game
CREATE TABLE IF NOT EXISTS guesses (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  session_id      UUID        NOT NULL,
  candidate_id    TEXT        NOT NULL,
  actual_party    TEXT        NOT NULL,
  guessed_party   TEXT        NOT NULL,
  time_to_guess_ms INTEGER,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for the stats queries we run most often
CREATE INDEX IF NOT EXISTS idx_guesses_session     ON guesses (session_id);
CREATE INDEX IF NOT EXISTS idx_guesses_actual_party ON guesses (actual_party);
CREATE INDEX IF NOT EXISTS idx_guesses_candidate    ON guesses (candidate_id);
CREATE INDEX IF NOT EXISTS idx_guesses_created_at   ON guesses (created_at);

-- Enable Row Level Security
ALTER TABLE guesses ENABLE ROW LEVEL SECURITY;

-- Allow anyone to insert guesses (anonymous, no auth needed)
CREATE POLICY "anon_can_insert"
  ON guesses FOR INSERT
  TO anon
  WITH CHECK (true);

-- Allow anyone to read guesses (needed for the stats page)
CREATE POLICY "anon_can_select"
  ON guesses FOR SELECT
  TO anon
  USING (true);


-- ============================================================================
-- Helper functions for the stats page
-- These let us query aggregate data efficiently from the client.
-- ============================================================================

-- Count unique sessions
CREATE OR REPLACE FUNCTION count_unique_sessions()
RETURNS BIGINT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COUNT(DISTINCT session_id) FROM public.guesses;
$$;

-- Overall accuracy (0–1)
CREATE OR REPLACE FUNCTION overall_accuracy()
RETURNS FLOAT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(
    COUNT(*) FILTER (WHERE actual_party = guessed_party)::FLOAT / NULLIF(COUNT(*), 0),
    0
  ) FROM public.guesses;
$$;

-- Average guess time in milliseconds
CREATE OR REPLACE FUNCTION avg_guess_time()
RETURNS FLOAT
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(AVG(time_to_guess_ms), 0)
  FROM public.guesses
  WHERE time_to_guess_ms IS NOT NULL;
$$;

-- Per-candidate stats grouped by party
-- Returns: candidate_id, actual_party, total guesses, accuracy (0–1)
CREATE OR REPLACE FUNCTION candidate_stats_by_party()
RETURNS TABLE (
  candidate_id TEXT,
  actual_party TEXT,
  total        BIGINT,
  accuracy     FLOAT
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    g.candidate_id,
    g.actual_party,
    COUNT(*)::BIGINT AS total,
    COUNT(*) FILTER (WHERE g.actual_party = g.guessed_party)::FLOAT / COUNT(*)::FLOAT AS accuracy
  FROM public.guesses g
  GROUP BY g.candidate_id, g.actual_party
  ORDER BY g.actual_party, accuracy DESC;
$$;

-- Grant anonymous access to execute these functions
GRANT EXECUTE ON FUNCTION count_unique_sessions() TO anon;
GRANT EXECUTE ON FUNCTION overall_accuracy() TO anon;
GRANT EXECUTE ON FUNCTION avg_guess_time() TO anon;
GRANT EXECUTE ON FUNCTION candidate_stats_by_party() TO anon;
GRANT EXECUTE ON FUNCTION count_unique_sessions() TO authenticated;
GRANT EXECUTE ON FUNCTION overall_accuracy() TO authenticated;
GRANT EXECUTE ON FUNCTION avg_guess_time() TO authenticated;
GRANT EXECUTE ON FUNCTION candidate_stats_by_party() TO authenticated;
