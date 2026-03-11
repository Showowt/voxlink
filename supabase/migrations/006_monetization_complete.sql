-- ═══════════════════════════════════════════════════════════════════════════
-- VOXXO MONETIZATION SCHEMA - COMPLETE
-- Run this in Supabase SQL editor
-- ═══════════════════════════════════════════════════════════════════════════

-- Drop existing if migrating
DROP VIEW IF EXISTS public.user_limits CASCADE;
DROP TABLE IF EXISTS public.stripe_events CASCADE;
DROP TABLE IF EXISTS public.daily_usage CASCADE;
DROP TABLE IF EXISTS public.streaks CASCADE;
DROP TABLE IF EXISTS public.usage_events CASCADE;

-- Extend profiles table (if exists, alter; if not, create)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'stripe_customer_id') THEN
    ALTER TABLE public.profiles ADD COLUMN stripe_customer_id TEXT UNIQUE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'plan') THEN
    ALTER TABLE public.profiles ADD COLUMN plan TEXT DEFAULT 'free' CHECK (plan IN ('free', 'pro', 'enterprise'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'plan_expires_at') THEN
    ALTER TABLE public.profiles ADD COLUMN plan_expires_at TIMESTAMPTZ;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'trial_ends_at') THEN
    ALTER TABLE public.profiles ADD COLUMN trial_ends_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'display_name') THEN
    ALTER TABLE public.profiles ADD COLUMN display_name TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'email') THEN
    ALTER TABLE public.profiles ADD COLUMN email TEXT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'profiles' AND column_name = 'primary_language') THEN
    ALTER TABLE public.profiles ADD COLUMN primary_language TEXT DEFAULT 'en';
  END IF;
END $$;

-- Usage events table
CREATE TABLE IF NOT EXISTS public.usage_events (
  id           UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id      UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id   TEXT,
  event_type   TEXT NOT NULL,
  mode         TEXT,
  language_pair TEXT,
  duration_sec INT,
  metadata     JSONB DEFAULT '{}',
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_usage_events_user ON usage_events(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_usage_events_session ON usage_events(session_id);

-- Streaks table (habit loop)
CREATE TABLE IF NOT EXISTS public.streaks (
  user_id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  current_streak  INT DEFAULT 0,
  longest_streak  INT DEFAULT 0,
  last_active_date DATE,
  total_sessions  INT DEFAULT 0,
  total_minutes   INT DEFAULT 0,
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- Daily usage limits
CREATE TABLE IF NOT EXISTS public.daily_usage (
  id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  session_id  TEXT,
  date        DATE DEFAULT CURRENT_DATE,
  wingman_sessions INT DEFAULT 0,
  translation_chars INT DEFAULT 0,
  video_minutes INT DEFAULT 0,
  UNIQUE(user_id, date),
  UNIQUE(session_id, date)
);

-- Stripe events log (idempotency)
CREATE TABLE IF NOT EXISTS public.stripe_events (
  id            TEXT PRIMARY KEY,
  type          TEXT NOT NULL,
  data          JSONB,
  processed_at  TIMESTAMPTZ DEFAULT NOW()
);

-- RLS Policies
ALTER TABLE public.usage_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.streaks      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.daily_usage  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stripe_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "usage_own" ON public.usage_events;
DROP POLICY IF EXISTS "usage_insert_anon" ON public.usage_events;
DROP POLICY IF EXISTS "streaks_own" ON public.streaks;
DROP POLICY IF EXISTS "daily_own" ON public.daily_usage;
DROP POLICY IF EXISTS "daily_insert_anon" ON public.daily_usage;
DROP POLICY IF EXISTS "stripe_service" ON public.stripe_events;

-- Usage: users can read their own, anyone can insert
CREATE POLICY "usage_own" ON public.usage_events
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "usage_insert_anon" ON public.usage_events
  FOR INSERT WITH CHECK (true);

-- Streaks: own only
CREATE POLICY "streaks_own" ON public.streaks
  FOR ALL USING (auth.uid() = user_id);

-- Daily usage: own only + anonymous insert
CREATE POLICY "daily_own" ON public.daily_usage
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY "daily_insert_anon" ON public.daily_usage
  FOR INSERT WITH CHECK (true);

-- Stripe events: service role only
CREATE POLICY "stripe_service" ON public.stripe_events
  FOR ALL USING (auth.role() = 'service_role');

-- User limits view
CREATE OR REPLACE VIEW public.user_limits AS
SELECT
  p.id,
  p.plan,
  p.trial_ends_at,
  CASE
    WHEN p.plan = 'pro' OR p.plan = 'enterprise' THEN true
    WHEN p.trial_ends_at > NOW() THEN true
    ELSE false
  END AS is_paid,
  COALESCE(d.wingman_sessions, 0) as today_wingman_sessions,
  COALESCE(d.translation_chars, 0) as today_translation_chars,
  COALESCE(d.video_minutes, 0) as today_video_minutes,
  CASE
    WHEN p.plan IN ('pro','enterprise') THEN 9999
    WHEN p.trial_ends_at > NOW() THEN 9999
    ELSE 10
  END AS wingman_limit,
  CASE
    WHEN p.plan IN ('pro','enterprise') THEN 999999
    WHEN p.trial_ends_at > NOW() THEN 999999
    ELSE 5000
  END AS translation_char_limit,
  CASE
    WHEN p.plan IN ('pro','enterprise') THEN 9999
    WHEN p.trial_ends_at > NOW() THEN 9999
    ELSE 5
  END AS video_minute_limit
FROM public.profiles p
LEFT JOIN public.daily_usage d ON d.user_id = p.id AND d.date = CURRENT_DATE;

-- RPC Functions
CREATE OR REPLACE FUNCTION increment_daily_usage(
  p_user_id UUID, p_date DATE,
  p_wingman_delta INT, p_translation_delta INT, p_video_delta INT
) RETURNS void AS $$
BEGIN
  INSERT INTO daily_usage (user_id, date, wingman_sessions, translation_chars, video_minutes)
  VALUES (p_user_id, p_date, p_wingman_delta, p_translation_delta, p_video_delta)
  ON CONFLICT (user_id, date) DO UPDATE SET
    wingman_sessions  = daily_usage.wingman_sessions  + p_wingman_delta,
    translation_chars = daily_usage.translation_chars + p_translation_delta,
    video_minutes     = daily_usage.video_minutes     + p_video_delta;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION update_streak(p_user_id UUID) RETURNS void AS $$
DECLARE
  last_date DATE;
  today DATE := CURRENT_DATE;
BEGIN
  SELECT last_active_date INTO last_date FROM streaks WHERE user_id = p_user_id;

  IF last_date IS NULL THEN
    INSERT INTO streaks (user_id, current_streak, longest_streak, last_active_date, total_sessions)
    VALUES (p_user_id, 1, 1, today, 1)
    ON CONFLICT (user_id) DO NOTHING;
  ELSIF last_date = today THEN
    UPDATE streaks SET total_sessions = total_sessions + 1 WHERE user_id = p_user_id;
  ELSIF last_date = today - 1 THEN
    UPDATE streaks SET
      current_streak  = current_streak + 1,
      longest_streak  = GREATEST(longest_streak, current_streak + 1),
      last_active_date = today,
      total_sessions  = total_sessions + 1
    WHERE user_id = p_user_id;
  ELSE
    UPDATE streaks SET
      current_streak   = 1,
      last_active_date = today,
      total_sessions   = total_sessions + 1
    WHERE user_id = p_user_id;
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Grant access to view
GRANT SELECT ON public.user_limits TO authenticated;
