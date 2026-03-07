-- ═══════════════════════════════════════════════════════════════════════════════
-- PROXIMITY CONNECT SCHEMA - Location-based user discovery and connection requests
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable PostGIS extension for geographic queries
CREATE EXTENSION IF NOT EXISTS postgis;

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROXIMITY_PRESENCE TABLE - Stores active user locations with TTL
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS proximity_presence (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id TEXT NOT NULL UNIQUE,
  language TEXT NOT NULL CHECK (language IN ('en', 'es', 'fr', 'de', 'it', 'pt', 'zh', 'ja', 'ko', 'ar', 'ru', 'hi')),
  location GEOGRAPHY(POINT, 4326) NOT NULL,
  lat DOUBLE PRECISION NOT NULL,
  lng DOUBLE PRECISION NOT NULL,
  status TEXT NOT NULL DEFAULT 'available' CHECK (status IN ('available', 'busy', 'in_call')),
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 minutes'),
  last_heartbeat TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for fast queries
CREATE INDEX idx_proximity_presence_location ON proximity_presence USING GIST(location);
CREATE INDEX idx_proximity_presence_expires_at ON proximity_presence(expires_at);
CREATE INDEX idx_proximity_presence_language ON proximity_presence(language);
CREATE INDEX idx_proximity_presence_status ON proximity_presence(status);
CREATE INDEX idx_proximity_presence_session ON proximity_presence(session_id);

-- ═══════════════════════════════════════════════════════════════════════════════
-- PROXIMITY_REQUESTS TABLE - Connection requests between users
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS proximity_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_session_id TEXT NOT NULL,
  to_session_id TEXT NOT NULL,
  message TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'expired')),
  room_code TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  responded_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '5 minutes')
);

-- Indexes for fast lookups
CREATE INDEX idx_proximity_requests_to_session ON proximity_requests(to_session_id);
CREATE INDEX idx_proximity_requests_from_session ON proximity_requests(from_session_id);
CREATE INDEX idx_proximity_requests_status ON proximity_requests(status);
CREATE INDEX idx_proximity_requests_expires_at ON proximity_requests(expires_at);

-- ═══════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY - Enable RLS on all tables (MachineMind standard)
-- ═══════════════════════════════════════════════════════════════════════════════
ALTER TABLE proximity_presence ENABLE ROW LEVEL SECURITY;
ALTER TABLE proximity_requests ENABLE ROW LEVEL SECURITY;

-- Allow all operations for now (anonymous users)
-- In production, implement proper auth policies
CREATE POLICY "Allow all access to proximity_presence" ON proximity_presence
  FOR ALL USING (true) WITH CHECK (true);

CREATE POLICY "Allow all access to proximity_requests" ON proximity_requests
  FOR ALL USING (true) WITH CHECK (true);

-- ═══════════════════════════════════════════════════════════════════════════════
-- AUTOMATIC CLEANUP FUNCTION - Remove expired records every minute
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION cleanup_expired_proximity_data()
RETURNS void AS $$
BEGIN
  -- Remove expired presence records
  DELETE FROM proximity_presence WHERE expires_at < NOW();

  -- Update expired requests
  UPDATE proximity_requests
  SET status = 'expired'
  WHERE status = 'pending' AND expires_at < NOW();
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════════════
-- HELPER FUNCTIONS FOR DISTANCE CALCULATIONS
-- ═══════════════════════════════════════════════════════════════════════════════

-- Calculate distance between two points in meters using PostGIS
CREATE OR REPLACE FUNCTION calculate_distance_meters(lat1 DOUBLE PRECISION, lng1 DOUBLE PRECISION, lat2 DOUBLE PRECISION, lng2 DOUBLE PRECISION)
RETURNS DOUBLE PRECISION AS $$
BEGIN
  RETURN ST_Distance(
    ST_SetSRID(ST_MakePoint(lng1, lat1), 4326)::geography,
    ST_SetSRID(ST_MakePoint(lng2, lat2), 4326)::geography
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- ═══════════════════════════════════════════════════════════════════════════════
-- REALTIME SUBSCRIPTION SETUP - Enable for live updates
-- ═══════════════════════════════════════════════════════════════════════════════

-- Enable realtime for proximity_requests (users get notified of incoming requests)
ALTER PUBLICATION supabase_realtime ADD TABLE proximity_requests;

-- ═══════════════════════════════════════════════════════════════════════════════
-- GRANT PERMISSIONS
-- ═══════════════════════════════════════════════════════════════════════════════
GRANT ALL ON proximity_presence TO anon, authenticated;
GRANT ALL ON proximity_requests TO anon, authenticated;
