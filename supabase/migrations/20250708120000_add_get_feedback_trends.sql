-- Add get_feedback_trends function
CREATE OR REPLACE FUNCTION get_feedback_trends()
RETURNS TABLE (
  month text,
  thumbs_up bigint,
  thumbs_down bigint,
  total bigint
) AS $$
  SELECT
    to_char(date_trunc('month', created_at), 'YYYY-MM') AS month,
    COUNT(*) FILTER (WHERE feedback_type = 'thumbs_up') AS thumbs_up,
    COUNT(*) FILTER (WHERE feedback_type = 'thumbs_down') AS thumbs_down,
    COUNT(*) AS total
  FROM message_feedback
  GROUP BY 1
  ORDER BY 1;
$$ LANGUAGE sql SECURITY DEFINER;
