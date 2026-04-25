-- scripts/seed-chris-matches.sql
--
-- Seeds two projects + ~6 swipe_interest rows for Chris's homeowner account
-- (uid = 'chris-morris-homeowner-dev'). Idempotent via uniqueness on
-- swipe_interest (project_id, builder_uid) and name-based project lookup.
--
-- Run against the dev DB:
--   mysql -h 127.0.0.1 -u root -p1ntoxt12 vetmybuilder_test_s1_4_w0 \
--         < scripts/seed-chris-matches.sql

SET @chris = CONVERT('chris-morris-homeowner-dev' USING utf8mb4) COLLATE utf8mb4_unicode_ci;

-- 1) Ensure Chris's user row exists (UPSERT). He's usually already there.
INSERT INTO users (uid, firstName, lastName, email, city, postcodeOutward)
VALUES (@chris, 'Chris', 'Morris', 'morris27sky@googlemail.com', 'Chingford', 'E4')
ON DUPLICATE KEY UPDATE
  firstName = VALUES(firstName),
  lastName  = VALUES(lastName);

-- 2) Create two projects owned by Chris (skip if same name already exists for him).

-- Kitchen extension
INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, status)
SELECT
  'Kitchen extension with bifolds',
  'extension',
  'E4 6AB',
  'Single-storey rear kitchen extension, ~20sqm, with aluminium bifold doors opening onto the garden. Looking for a builder who can handle structural, glazing and finishes.',
  'house',
  3,
  @chris,
  'live'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE ownerUserId = @chris AND name = 'Kitchen extension with bifolds'
);

-- Roof repair
INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, status)
SELECT
  'Roof repair',
  'repair',
  'E17 4BN',
  'Slipped tiles and a small leak above the upstairs bedroom. Need a roofer to inspect, re-bed the ridge and replace missing tiles.',
  'house',
  3,
  @chris,
  'live'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE ownerUserId = @chris AND name = 'Roof repair'
);

-- Capture the project IDs.
SELECT id INTO @kitchen_pid FROM projects
  WHERE ownerUserId = @chris AND name = 'Kitchen extension with bifolds' LIMIT 1;
SELECT id INTO @roof_pid    FROM projects
  WHERE ownerUserId = @chris AND name = 'Roof repair' LIMIT 1;

-- 3) Swipe interest rows.
-- Staggered homeowner_swiped_at timestamps (2h ago → 4d ago) for realistic UI.
-- Uniqueness key: (project_id, builder_uid). ON DUPLICATE KEY UPDATE makes it re-runnable.

-- --- NEW / pending ---------------------------------------------------------

-- Kitchen, recommended, Elegant Building (2h ago)
INSERT INTO swipe_interest
  (project_id, homeowner_uid, builder_uid, source, status, homeowner_swiped_at, builder_swiped_at)
VALUES
  (@kitchen_pid, @chris, 'pLT7RLEYByX6IJWzGAMjAKrW5L93', 'recommended', 'pending',
   DATE_SUB(NOW(), INTERVAL 2 HOUR), NULL)
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  status = VALUES(status),
  homeowner_swiped_at = VALUES(homeowner_swiped_at),
  builder_swiped_at   = VALUES(builder_swiped_at);

-- Kitchen, subscribed, AD House (6h ago)
INSERT INTO swipe_interest
  (project_id, homeowner_uid, builder_uid, source, status, homeowner_swiped_at, builder_swiped_at)
VALUES
  (@kitchen_pid, @chris, 'sim-builder-001', 'subscribed', 'pending',
   DATE_SUB(NOW(), INTERVAL 6 HOUR), NULL)
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  status = VALUES(status),
  homeowner_swiped_at = VALUES(homeowner_swiped_at),
  builder_swiped_at   = VALUES(builder_swiped_at);

-- --- CONTACTED / matched ---------------------------------------------------

-- Kitchen, subscribed, Home Improvements Specialist (1d ago)
INSERT INTO swipe_interest
  (project_id, homeowner_uid, builder_uid, source, status, homeowner_swiped_at, builder_swiped_at)
VALUES
  (@kitchen_pid, @chris, 'sim-builder-004', 'subscribed', 'matched',
   DATE_SUB(NOW(), INTERVAL 1 DAY), DATE_SUB(NOW(), INTERVAL 1 DAY))
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  status = VALUES(status),
  homeowner_swiped_at = VALUES(homeowner_swiped_at),
  builder_swiped_at   = VALUES(builder_swiped_at);

-- Roof, recommended, JB Roofing (2d ago)
INSERT INTO swipe_interest
  (project_id, homeowner_uid, builder_uid, source, status, homeowner_swiped_at, builder_swiped_at)
VALUES
  (@roof_pid, @chris, 'sim-builder-002', 'recommended', 'matched',
   DATE_SUB(NOW(), INTERVAL 2 DAY), DATE_SUB(NOW(), INTERVAL 2 DAY))
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  status = VALUES(status),
  homeowner_swiped_at = VALUES(homeowner_swiped_at),
  builder_swiped_at   = VALUES(builder_swiped_at);

-- --- ARCHIVED / declined_by_builder ---------------------------------------

-- Kitchen, subscribed, Pimlico Plumbers (3d ago)
INSERT INTO swipe_interest
  (project_id, homeowner_uid, builder_uid, source, status, homeowner_swiped_at, builder_swiped_at)
VALUES
  (@kitchen_pid, @chris, 'sim-builder-005', 'subscribed', 'declined_by_builder',
   DATE_SUB(NOW(), INTERVAL 3 DAY), DATE_SUB(NOW(), INTERVAL 3 DAY))
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  status = VALUES(status),
  homeowner_swiped_at = VALUES(homeowner_swiped_at),
  builder_swiped_at   = VALUES(builder_swiped_at);

-- Roof, subscribed, Rooftech Roofing (4d ago)
INSERT INTO swipe_interest
  (project_id, homeowner_uid, builder_uid, source, status, homeowner_swiped_at, builder_swiped_at)
VALUES
  (@roof_pid, @chris, 'sim-builder-003', 'subscribed', 'declined_by_builder',
   DATE_SUB(NOW(), INTERVAL 4 DAY), DATE_SUB(NOW(), INTERVAL 4 DAY))
ON DUPLICATE KEY UPDATE
  source = VALUES(source),
  status = VALUES(status),
  homeowner_swiped_at = VALUES(homeowner_swiped_at),
  builder_swiped_at   = VALUES(builder_swiped_at);

-- 4) Recommendation rows mirroring each swipe pair.
-- Without these, /matches' recommendation-score logic returns null and falls
-- back to tradesmen.vmb_score (93 for everyone). The desktop "Top
-- recommendations" view groups by company name, so we use the actual
-- tradesmen.company_name strings here. recommenderUserId = sim-neighbour-001
-- (already seeded). source mirrors the swipe tier: 'friend' for recommended,
-- 'community' for subscribed.

-- Kitchen + Elegant Building Services Ltd (recommended -> friend)
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source,
   linked_tradesman_uid, createdAt, isAnonymous)
SELECT
  @kitchen_pid, 'sim-neighbour-001',
  'Elegant Building Services Ltd', NULL,
  'Elegant Building Services Ltd', 5, 'friend',
  'pLT7RLEYByX6IJWzGAMjAKrW5L93', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM recommendations
  WHERE projectId = @kitchen_pid
    AND linked_tradesman_uid = 'pLT7RLEYByX6IJWzGAMjAKrW5L93'
);

-- Kitchen + AD House Construction (subscribed -> community)
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source,
   linked_tradesman_uid, createdAt, isAnonymous)
SELECT
  @kitchen_pid, 'sim-neighbour-001',
  'AD House Construction', NULL,
  'AD House Construction', 5, 'community',
  'sim-builder-001', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM recommendations
  WHERE projectId = @kitchen_pid
    AND linked_tradesman_uid = 'sim-builder-001'
);

-- Kitchen + Home Improvements Specialist Ltd (subscribed -> community)
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source,
   linked_tradesman_uid, createdAt, isAnonymous)
SELECT
  @kitchen_pid, 'sim-neighbour-001',
  'Home Improvements Specialist Ltd', NULL,
  'Home Improvements Specialist Ltd', 5, 'community',
  'sim-builder-004', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM recommendations
  WHERE projectId = @kitchen_pid
    AND linked_tradesman_uid = 'sim-builder-004'
);

-- Kitchen + Pimlico Plumbers (subscribed -> community)
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source,
   linked_tradesman_uid, createdAt, isAnonymous)
SELECT
  @kitchen_pid, 'sim-neighbour-001',
  'Pimlico Plumbers', NULL,
  'Pimlico Plumbers', 5, 'community',
  'sim-builder-005', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM recommendations
  WHERE projectId = @kitchen_pid
    AND linked_tradesman_uid = 'sim-builder-005'
);

-- Roof + JB Roofing Solutions Ltd (recommended -> friend)
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source,
   linked_tradesman_uid, createdAt, isAnonymous)
SELECT
  @roof_pid, 'sim-neighbour-001',
  'JB Roofing Solutions Ltd', NULL,
  'JB Roofing Solutions Ltd', 5, 'friend',
  'sim-builder-002', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM recommendations
  WHERE projectId = @roof_pid
    AND linked_tradesman_uid = 'sim-builder-002'
);

-- Roof + Rooftech Roofing And Guttering Ltd (subscribed -> community)
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source,
   linked_tradesman_uid, createdAt, isAnonymous)
SELECT
  @roof_pid, 'sim-neighbour-001',
  'Rooftech Roofing And Guttering Ltd', NULL,
  'Rooftech Roofing And Guttering Ltd', 5, 'community',
  'sim-builder-003', NOW(), 0
WHERE NOT EXISTS (
  SELECT 1 FROM recommendations
  WHERE projectId = @roof_pid
    AND linked_tradesman_uid = 'sim-builder-003'
);

-- 5) Verification output.
SELECT 'projects' AS tbl, id, name, location, status FROM projects WHERE ownerUserId = @chris;
SELECT 'counts'   AS tbl, status, COUNT(*) AS n FROM swipe_interest
  WHERE homeowner_uid = @chris GROUP BY status;
SELECT 'rows'     AS tbl, si.id, si.project_id, p.name AS project_name,
       si.builder_uid, t.company_name, si.source, si.status,
       si.homeowner_swiped_at, si.builder_swiped_at
FROM swipe_interest si
JOIN projects p ON p.id = si.project_id
LEFT JOIN tradesmen t ON t.user_id = si.builder_uid
WHERE si.homeowner_uid = @chris
ORDER BY si.homeowner_swiped_at DESC;
