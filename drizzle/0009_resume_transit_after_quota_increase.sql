-- One-time release of the Retry-After from the previous exhausted quota.
-- Owner confirmed a new 1,000,000/day quota on 2026-09-12.
-- Preserve all snapshots, user settings and any other refresh state.
UPDATE app_settings SET value = 'quota_changed', updated_at = 0
WHERE key = 'transit_provider_refresh' AND value = 'rate_limited';
