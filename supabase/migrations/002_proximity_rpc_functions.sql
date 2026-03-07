-- ═══════════════════════════════════════════════════════════════════════════════
-- PROXIMITY RPC FUNCTIONS - Efficient geographic queries using PostGIS
-- ═══════════════════════════════════════════════════════════════════════════════

-- ═══════════════════════════════════════════════════════════════════════════════
-- FIND_NEARBY_USERS - Get all users within radius using PostGIS
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION find_nearby_users(
  user_lat DOUBLE PRECISION,
  user_lng DOUBLE PRECISION,
  radius_meters INTEGER,
  exclude_session TEXT DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  session_id TEXT,
  language TEXT,
  status TEXT,
  distance DOUBLE PRECISION
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    p.session_id,
    p.language,
    p.status,
    ST_Distance(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography
    ) AS distance
  FROM proximity_presence p
  WHERE
    -- Only available users
    p.status = 'available'
    -- Not expired
    AND p.expires_at > NOW()
    -- Within radius using PostGIS ST_DWithin (efficient indexed query)
    AND ST_DWithin(
      p.location::geography,
      ST_SetSRID(ST_MakePoint(user_lng, user_lat), 4326)::geography,
      radius_meters
    )
    -- Exclude self
    AND (exclude_session IS NULL OR p.session_id != exclude_session)
  ORDER BY distance ASC;
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION find_nearby_users TO anon, authenticated;

-- ═══════════════════════════════════════════════════════════════════════════════
-- GET_PRESENCE_STATS - Analytics query for monitoring
-- ═══════════════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION get_presence_stats()
RETURNS TABLE (
  total_active INTEGER,
  available_count INTEGER,
  busy_count INTEGER,
  in_call_count INTEGER,
  pending_requests INTEGER,
  accepted_today INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::INTEGER AS total_active,
    COUNT(*) FILTER (WHERE status = 'available')::INTEGER AS available_count,
    COUNT(*) FILTER (WHERE status = 'busy')::INTEGER AS busy_count,
    COUNT(*) FILTER (WHERE status = 'in_call')::INTEGER AS in_call_count,
    (SELECT COUNT(*)::INTEGER FROM proximity_requests WHERE status = 'pending') AS pending_requests,
    (SELECT COUNT(*)::INTEGER FROM proximity_requests WHERE status = 'accepted' AND created_at > NOW() - INTERVAL '24 hours') AS accepted_today
  FROM proximity_presence
  WHERE expires_at > NOW();
END;
$$ LANGUAGE plpgsql STABLE;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_presence_stats TO anon, authenticated;
