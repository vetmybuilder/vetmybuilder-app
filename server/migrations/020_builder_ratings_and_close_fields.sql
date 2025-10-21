-- 020_builder_ratings_and_close_fields.sql
-- Adds "wouldUseAgain" to project_closures and creates a scoring view
-- for ranking recommendations (builders). Uses existing tables:
--   recommendations (expects a "source" column from 010_recommendations_source.sql)
--   recommendation_votes, recommendation_photos,
--   project_closures (expects winnerRecommendationId from 019_*),
--   project_closure_photos.

-- 1) Close-flow: wouldUseAgain flag (nullable)
ALTER TABLE project_closures
  ADD COLUMN wouldUseAgain INTEGER DEFAULT NULL;

-- 2) Helpful indexes for fast scoring lookups
CREATE INDEX IF NOT EXISTS idx_pclosures_winner_did
  ON project_closures(winnerRecommendationId, didGoAhead);

CREATE INDEX IF NOT EXISTS idx_reco_votes_recoId
  ON recommendation_votes(recommendationId);

CREATE INDEX IF NOT EXISTS idx_reco_photos_recoId
  ON recommendation_photos(recommendationId);

CREATE INDEX IF NOT EXISTS idx_closure_photos_project
  ON project_closure_photos(projectId);

-- 3) Scoring View
-- Note: We derive "fromCommunity" from recommendations.source = 'magic'
-- to avoid depending on a non-existent "fromCommunity" column.
DROP VIEW IF EXISTS v_recommendation_scores;

CREATE VIEW v_recommendation_scores AS
WITH
  likes AS (
    SELECT recommendationId, COUNT(*) AS likes_count
    FROM recommendation_votes
    GROUP BY recommendationId
  ),
  rec_photos AS (
    SELECT recommendationId, COUNT(*) AS rec_photo_count
    FROM recommendation_photos
    GROUP BY recommendationId
  ),
  completed AS (
    SELECT
      winnerRecommendationId AS recommendationId,
      COUNT(*) AS completed_count,
      MAX(createdAt) AS lastCompletedAt
    FROM project_closures
    WHERE didGoAhead = 1 AND winnerRecommendationId IS NOT NULL
    GROUP BY winnerRecommendationId
  ),
  positive AS (
    SELECT
      winnerRecommendationId AS recommendationId,
      COUNT(*) AS positive_count
    FROM project_closures
    WHERE didGoAhead = 1
      AND wouldUseAgain = 1
      AND winnerRecommendationId IS NOT NULL
    GROUP BY winnerRecommendationId
  ),
  closure_photos AS (
    SELECT
      pc.winnerRecommendationId AS recommendationId,
      COUNT(*) AS closure_photo_count
    FROM project_closure_photos pcp
    JOIN project_closures pc ON pc.projectId = pcp.projectId
    WHERE pc.winnerRecommendationId IS NOT NULL
    GROUP BY pc.winnerRecommendationId
  )
SELECT
  r.id                                       AS recommendationId,
  r.company                                  AS company,
  CASE WHEN LOWER(IFNULL(r.source,'')) = 'magic' THEN 1 ELSE 0 END
                                             AS fromCommunity,

  -- Raw components
  COALESCE(l.likes_count, 0)                 AS likes_count,
  COALESCE(c.completed_count, 0)             AS completed_count,
  COALESCE(p.positive_count, 0)              AS positive_count,
  (COALESCE(rp.rec_photo_count, 0) +
   COALESCE(cp.closure_photo_count, 0))      AS photos_count,
  CASE WHEN (COALESCE(rp.rec_photo_count, 0) + COALESCE(cp.closure_photo_count, 0)) >= 2
       THEN 1 ELSE 0 END                     AS has_2plus_photos,
  c.lastCompletedAt                          AS lastCompletedAt,

  -- Composite score:
  --  baseline (1) + 5*completed + 2*positive + 0.5*likes + 0.25*photos + 0.5*community_bonus
  (1.0
   + 5.0 * COALESCE(c.completed_count, 0)
   + 2.0 * COALESCE(p.positive_count, 0)
   + 0.5 * COALESCE(l.likes_count, 0)
   + 0.25 * (COALESCE(rp.rec_photo_count, 0) + COALESCE(cp.closure_photo_count, 0))
   + CASE WHEN LOWER(IFNULL(r.source,'')) = 'magic' THEN 0.5 ELSE 0.0 END
  ) AS score
FROM recommendations r
LEFT JOIN likes           l  ON l.recommendationId = r.id
LEFT JOIN rec_photos      rp ON rp.recommendationId = r.id
LEFT JOIN completed       c  ON c.recommendationId = r.id
LEFT JOIN positive        p  ON p.recommendationId = r.id
LEFT JOIN closure_photos  cp ON cp.recommendationId = r.id;
