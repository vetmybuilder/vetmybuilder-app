-- 019_project_closures_add_winner.sql
-- Adds winnerRecommendationId to project_closures to record who completed the work
ALTER TABLE project_closures ADD COLUMN winnerRecommendationId INTEGER NULL;
