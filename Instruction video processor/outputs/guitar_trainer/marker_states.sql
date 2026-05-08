-- Parameterized import template.
-- Use the application import command instead of embedding raw JSON strings.
INSERT INTO marker_states (content_path, content_type, marker_state, updated_at)
VALUES (?, 'local', ?, ?)
ON CONFLICT(content_path) DO UPDATE SET
  content_type = excluded.content_type,
  marker_state = excluded.marker_state,
  updated_at = excluded.updated_at;
