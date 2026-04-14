-- 031_project_answers_json.sql
-- Structured, category-specific homeowner answers captured at job post time.
-- Nullable so existing projects and categories without a dynamic form are unaffected.

ALTER TABLE projects
  ADD COLUMN answers_json JSON NULL AFTER description;
