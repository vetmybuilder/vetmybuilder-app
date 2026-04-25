-- scripts/seed-chris-bathroom-project.sql
--
-- Seeds Chris's homeowner account ('chris-morris-homeowner-dev') with a
-- bathroom-fitting project plus a substantial cast of tradesmen + recommendations
-- + builder_subscriptions so the AI ranker has real data to operate on.
--
-- Cast:
--   * 5 RELEVANT-trade tradesmen   (Bathroom Fitter / Plumber / Tiler / etc.)
--                                   recommended on the bathroom project (Tier 1)
--   * 5 IRRELEVANT-trade tradesmen (Cleaner / Painter / Gardener / Roofer / Locksmith)
--                                   also recommended (the ranker should deprioritise them)
--   * 5 SUBSCRIBED relevant-trade tradesmen  (Tier 2 — paid placements)
--   * 1 published bathroom project owned by Chris
--   * 1 project_classifications row with structured.recommended_trades
--   * 10 recommendation rows (one per recommended tradesman) from sim-neighbour-001
--   * 5 active builder_subscriptions for the subscribed tradesmen
--
-- Idempotent — uses INSERT ... ON DUPLICATE KEY UPDATE / WHERE NOT EXISTS guards.
-- Run against the dev DB:
--   mysql -h 127.0.0.1 -u root -p1ntoxt12 vetmybuilder_test_s1_4_w0 \
--         < scripts/seed-chris-bathroom-project.sql

SET @chris = CONVERT('chris-morris-homeowner-dev' USING utf8mb4) COLLATE utf8mb4_unicode_ci;

-- ---------------------------------------------------------------------------
-- 1) Users (minimal rows — just enough to satisfy any FK / display lookups).
-- ---------------------------------------------------------------------------

INSERT INTO users (uid, firstName, lastName, createdAt) VALUES
  ('sim-bath-rel-1', 'Sparkle',   'Bathrooms',     NOW()),
  ('sim-bath-rel-2', 'Aqua',      'Plumbing',      NOW()),
  ('sim-bath-rel-3', 'Tile',      'Masters',       NOW()),
  ('sim-bath-rel-4', 'London',    'Bathroom',      NOW()),
  ('sim-bath-rel-5', 'Premier',   'Plumbing',      NOW()),
  ('sim-bath-irr-1', 'GreenLawns','Garden',        NOW()),
  ('sim-bath-irr-2', 'Brushstroke','Painters',     NOW()),
  ('sim-bath-irr-3', 'Sparkle',   'Cleaning',      NOW()),
  ('sim-bath-irr-4', 'RoofPro',   'Restoration',   NOW()),
  ('sim-bath-irr-5', 'Locksmith', 'Express',       NOW()),
  ('sim-bath-sub-1', 'Bathworks', 'Build',         NOW()),
  ('sim-bath-sub-2', 'Northside', 'Plumbing',      NOW()),
  ('sim-bath-sub-3', 'Capital',   'Tile',          NOW()),
  ('sim-bath-sub-4', 'Drainflow', 'Plumbers',      NOW()),
  ('sim-bath-sub-5', 'Mira',      'Build',         NOW())
ON DUPLICATE KEY UPDATE
  firstName = VALUES(firstName),
  lastName  = VALUES(lastName);

-- ---------------------------------------------------------------------------
-- 2) Tradesmen — 15 rows: 5 relevant, 5 irrelevant, 5 subscribed-relevant.
--    vmb_score varied 60-95 so the ranker has signal to differentiate.
--    Badge: >=85 platinum, >=70 gold, >=50 silver, else bronze.
--    ch_status: 'verified' for relevant + subscribed, 'unverified' for irrelevant.
--    google_rating 3.8-4.9, google_reviews_count 20-200.
--    created_at staggered 6-60 months ago so yearsTrading differs.
-- ---------------------------------------------------------------------------

-- ---- 5 RELEVANT-trade tradesmen ------------------------------------------
INSERT INTO tradesmen
  (user_id, company_name, trade_types, service_areas,
   vmb_score, vmb_badge, ch_status,
   google_rating, google_reviews_count, profile_picture_url,
   photo_count, status, created_at)
VALUES
  ('sim-bath-rel-1', 'Sparkle Bathrooms Ltd',     'Bathroom Fitter,Tiler',
     'E4,E17,N17',  88, 'platinum', 'verified', 4.7, 142,
     'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80', 12, 'active',
     DATE_SUB(NOW(), INTERVAL 36 MONTH)),
  ('sim-bath-rel-2', 'Aqua Plumbing Services',    'Plumber,Heating Engineer,Bathroom Fitter',
     'E4,E17,N1',   76, 'gold',     'verified', 4.5, 98,
     'https://images.unsplash.com/photo-1601564921647-b446839a013f?w=600&q=80',  8, 'active',
     DATE_SUB(NOW(), INTERVAL 48 MONTH)),
  ('sim-bath-rel-3', 'Tile Masters London',       'Tiler,Bathroom Fitter',
     'E4,E17,E11',  82, 'gold',     'verified', 4.8, 76,
     'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=600&q=80', 15, 'active',
     DATE_SUB(NOW(), INTERVAL 24 MONTH)),
  ('sim-bath-rel-4', 'London Bathroom Co',        'Bathroom Fitter,Plasterer,Tiler',
     'E4,N1,N17',   91, 'platinum', 'verified', 4.9, 187,
     'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=600&q=80', 22, 'active',
     DATE_SUB(NOW(), INTERVAL 60 MONTH)),
  ('sim-bath-rel-5', 'Premier Plumbing Group',    'Plumber,Bathroom Fitter,Electrician',
     'E4,E17,E15',  68, 'silver',   'verified', 4.2, 54,
     'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=600&q=80',  6, 'active',
     DATE_SUB(NOW(), INTERVAL 18 MONTH))
ON DUPLICATE KEY UPDATE
  company_name = VALUES(company_name),
  trade_types  = VALUES(trade_types),
  service_areas = VALUES(service_areas),
  vmb_score    = VALUES(vmb_score),
  vmb_badge    = VALUES(vmb_badge),
  ch_status    = VALUES(ch_status),
  google_rating = VALUES(google_rating),
  google_reviews_count = VALUES(google_reviews_count),
  profile_picture_url = VALUES(profile_picture_url),
  photo_count  = VALUES(photo_count),
  status       = VALUES(status),
  created_at   = VALUES(created_at);

-- ---- 5 IRRELEVANT-trade tradesmen ----------------------------------------
INSERT INTO tradesmen
  (user_id, company_name, trade_types, service_areas,
   vmb_score, vmb_badge, ch_status,
   google_rating, google_reviews_count, profile_picture_url,
   photo_count, status, created_at)
VALUES
  ('sim-bath-irr-1', 'GreenLawns Garden Care',    'Gardener,Landscaper',
     'E4,E17',     72, 'gold',   'unverified', 4.4, 65,
     'https://images.unsplash.com/photo-1416879595882-3373a0480b5b?w=600&q=80',  4, 'active',
     DATE_SUB(NOW(), INTERVAL 30 MONTH)),
  ('sim-bath-irr-2', 'Brushstroke Painters',      'Painter / Decorator',
     'E4',         64, 'silver', 'unverified', 4.0, 38,
     'https://images.unsplash.com/photo-1562259949-e8e7689d7828?w=600&q=80',  3, 'active',
     DATE_SUB(NOW(), INTERVAL 12 MONTH)),
  ('sim-bath-irr-3', 'Sparkle & Shine Cleaning',  'Cleaner',
     'E4,E17',     60, 'silver', 'unverified', 3.8, 22,
     'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=600&q=80',  2, 'active',
     DATE_SUB(NOW(), INTERVAL  6 MONTH)),
  ('sim-bath-irr-4', 'RoofPro Restoration',       'Roofer,Skylights / Rooflights',
     'E4,E17',     78, 'gold',   'unverified', 4.3, 89,
     'https://images.unsplash.com/photo-1632935190491-a86f87da3134?w=600&q=80',  9, 'active',
     DATE_SUB(NOW(), INTERVAL 42 MONTH)),
  ('sim-bath-irr-5', 'Locksmith Express',         'Locksmith',
     'E4',         70, 'gold',   'unverified', 4.1, 31,
     'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=600&q=80',  1, 'active',
     DATE_SUB(NOW(), INTERVAL  9 MONTH))
ON DUPLICATE KEY UPDATE
  company_name = VALUES(company_name),
  trade_types  = VALUES(trade_types),
  service_areas = VALUES(service_areas),
  vmb_score    = VALUES(vmb_score),
  vmb_badge    = VALUES(vmb_badge),
  ch_status    = VALUES(ch_status),
  google_rating = VALUES(google_rating),
  google_reviews_count = VALUES(google_reviews_count),
  profile_picture_url = VALUES(profile_picture_url),
  photo_count  = VALUES(photo_count),
  status       = VALUES(status),
  created_at   = VALUES(created_at);

-- ---- 5 SUBSCRIBED relevant-trade tradesmen -------------------------------
INSERT INTO tradesmen
  (user_id, company_name, trade_types, service_areas,
   vmb_score, vmb_badge, ch_status,
   google_rating, google_reviews_count, profile_picture_url,
   photo_count, status, created_at)
VALUES
  ('sim-bath-sub-1', 'Bathworks Build & Tile',    'Bathroom Fitter,Tiler,Plumber',
     'E4,E17',     85, 'platinum','verified', 4.6, 112,
     'https://images.unsplash.com/photo-1564540583246-934409427776?w=600&q=80', 11, 'active',
     DATE_SUB(NOW(), INTERVAL 54 MONTH)),
  ('sim-bath-sub-2', 'Northside Plumbing Co',     'Plumber,Heating Engineer',
     'E4,N17,N1',  74, 'gold',    'verified', 4.5, 67,
     'https://images.unsplash.com/photo-1604709177595-ee9c2580e9a3?w=600&q=80',  7, 'active',
     DATE_SUB(NOW(), INTERVAL 27 MONTH)),
  ('sim-bath-sub-3', 'Capital Tile Studio',       'Tiler,Bathroom Fitter',
     'E4,E11,E17', 80, 'gold',    'verified', 4.7, 95,
     'https://images.unsplash.com/photo-1565623833408-d77e39b88af6?w=600&q=80', 14, 'active',
     DATE_SUB(NOW(), INTERVAL 21 MONTH)),
  ('sim-bath-sub-4', 'Drainflow Plumbers',        'Plumber,Bathroom Fitter',
     'E4,E15,E17', 95, 'platinum','verified', 4.9, 200,
     'https://images.unsplash.com/photo-1629189458438-2e76b6db5b25?w=600&q=80', 18, 'active',
     DATE_SUB(NOW(), INTERVAL 60 MONTH)),
  ('sim-bath-sub-5', 'Mira Build & Bathroom',     'Bathroom Fitter,General Builder',
     'E4,E17,N17', 66, 'silver',  'verified', 4.3, 45,
     'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=600&q=80',  5, 'active',
     DATE_SUB(NOW(), INTERVAL 15 MONTH))
ON DUPLICATE KEY UPDATE
  company_name = VALUES(company_name),
  trade_types  = VALUES(trade_types),
  service_areas = VALUES(service_areas),
  vmb_score    = VALUES(vmb_score),
  vmb_badge    = VALUES(vmb_badge),
  ch_status    = VALUES(ch_status),
  google_rating = VALUES(google_rating),
  google_reviews_count = VALUES(google_reviews_count),
  profile_picture_url = VALUES(profile_picture_url),
  photo_count  = VALUES(photo_count),
  status       = VALUES(status),
  created_at   = VALUES(created_at);

-- ---------------------------------------------------------------------------
-- 3) Bathroom project (idempotent via name-match guard).
-- ---------------------------------------------------------------------------

INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, status)
SELECT
  'Bathroom fitting',
  'bathroom',
  'E4 6AB',
  'Need a full bathroom refit — strip out, new tiling, walk-in shower, vanity unit, toilet swap. House is a 1930s semi, so plumbing is older. Looking for a bathroom specialist who can manage all trades.',
  'house',
  3,
  @chris,
  'live'
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM projects
  WHERE ownerUserId = @chris AND name = 'Bathroom fitting'
);

SELECT id INTO @bath_pid FROM projects
  WHERE ownerUserId = @chris AND name = 'Bathroom fitting' LIMIT 1;

-- ---------------------------------------------------------------------------
-- 4) project_classifications row.
--    Schema: id PK, project_id MUL (no unique), classifier_version + raw_description NOT NULL.
--    No unique key on project_id — guard with WHERE NOT EXISTS for idempotency.
-- ---------------------------------------------------------------------------

INSERT INTO project_classifications
  (project_id, classified_at, classifier_version, raw_description, structured)
SELECT
  @bath_pid,
  NOW(),
  'seed-bathroom-v1',
  'Need a full bathroom refit — strip out, new tiling, walk-in shower, vanity unit, toilet swap. House is a 1930s semi, so plumbing is older. Looking for a bathroom specialist who can manage all trades.',
  JSON_OBJECT(
    'type',               'bathroom_renovation',
    'scope',              'medium',
    'price_band',         '5k-10k',
    'recommended_trades', JSON_ARRAY('Bathroom Fitter', 'Plumber', 'Tiler', 'Electrician'),
    'urgency',            'normal'
  )
FROM DUAL
WHERE NOT EXISTS (
  SELECT 1 FROM project_classifications
  WHERE project_id = @bath_pid AND classifier_version = 'seed-bathroom-v1'
);

-- ---------------------------------------------------------------------------
-- 5) Recommendations — 10 rows (5 relevant + 5 irrelevant).
--    Recommender: sim-neighbour-001 (already seeded by the sim).
--    source = 'friend' for relevant, 'community' for irrelevant.
--    rating = 5 across the board (the ranker doesn't use rating directly).
--    Re-run safe: WHERE NOT EXISTS guards on (projectId, linked_tradesman_uid).
-- ---------------------------------------------------------------------------

-- Relevant trades (source='friend')
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'Sparkle Bathrooms Ltd', NULL, 'Sparkle Bathrooms Ltd', 5, 'friend', 'sim-bath-rel-1', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-1');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'Aqua Plumbing Services', NULL, 'Aqua Plumbing Services', 5, 'friend', 'sim-bath-rel-2', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-2');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'Tile Masters London', NULL, 'Tile Masters London', 5, 'friend', 'sim-bath-rel-3', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-3');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'London Bathroom Co', NULL, 'London Bathroom Co', 5, 'friend', 'sim-bath-rel-4', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-4');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'Premier Plumbing Group', NULL, 'Premier Plumbing Group', 5, 'friend', 'sim-bath-rel-5', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-5');

-- Irrelevant trades (source='community')
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'GreenLawns Garden Care', NULL, 'GreenLawns Garden Care', 5, 'community', 'sim-bath-irr-1', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-irr-1');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'Brushstroke Painters', NULL, 'Brushstroke Painters', 5, 'community', 'sim-bath-irr-2', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-irr-2');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'Sparkle & Shine Cleaning', NULL, 'Sparkle & Shine Cleaning', 5, 'community', 'sim-bath-irr-3', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-irr-3');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'RoofPro Restoration', NULL, 'RoofPro Restoration', 5, 'community', 'sim-bath-irr-4', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-irr-4');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, source, linked_tradesman_uid, createdAt, isAnonymous)
SELECT @bath_pid, 'sim-neighbour-001', 'Locksmith Express', NULL, 'Locksmith Express', 5, 'community', 'sim-bath-irr-5', NOW(), 0
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-irr-5');

-- ---------------------------------------------------------------------------
-- 6) Builder subscriptions — 5 active rows for sim-bath-sub-*.
--    Column is `tier_id` (not `tier`). `stripe_subscription_id` is UNIQUE,
--    so we use it as the upsert key.
-- ---------------------------------------------------------------------------

INSERT INTO builder_subscriptions
  (user_id, tier_id, stripe_subscription_id, status, current_period_start, current_period_end)
VALUES
  ('sim-bath-sub-1', 'month_1', 'sub_test_sim_bath_sub_1', 'active', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY)),
  ('sim-bath-sub-2', 'month_1', 'sub_test_sim_bath_sub_2', 'active', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY)),
  ('sim-bath-sub-3', 'week_2',  'sub_test_sim_bath_sub_3', 'active', NOW(), DATE_ADD(NOW(), INTERVAL 14 DAY)),
  ('sim-bath-sub-4', 'month_1', 'sub_test_sim_bath_sub_4', 'active', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY)),
  ('sim-bath-sub-5', 'week_1',  'sub_test_sim_bath_sub_5', 'active', NOW(), DATE_ADD(NOW(), INTERVAL  7 DAY))
ON DUPLICATE KEY UPDATE
  user_id              = VALUES(user_id),
  tier_id              = VALUES(tier_id),
  status               = VALUES(status),
  current_period_start = VALUES(current_period_start),
  current_period_end   = VALUES(current_period_end);

-- ---------------------------------------------------------------------------
-- 7) Verification block.
-- ---------------------------------------------------------------------------

SELECT 'project' AS section, id, name, status, location FROM projects
  WHERE ownerUserId = @chris AND name = 'Bathroom fitting';

SELECT 'tradesmen' AS section, user_id, company_name, trade_types, vmb_score, vmb_badge, ch_status
  FROM tradesmen WHERE user_id LIKE 'sim-bath-%' ORDER BY user_id;

SELECT 'recs' AS section, id, projectId, company, source, linked_tradesman_uid
  FROM recommendations WHERE projectId = @bath_pid ORDER BY id;

SELECT 'subs' AS section, user_id, tier_id, status, current_period_end
  FROM builder_subscriptions WHERE user_id LIKE 'sim-bath-sub-%' ORDER BY user_id;

SELECT 'classification' AS section, project_id, classifier_version, classified_at,
       JSON_EXTRACT(structured, '$.recommended_trades') AS recommended_trades
  FROM project_classifications WHERE project_id = @bath_pid;

-- Sanity-check counts (matches /api/projects/:id/matches expectations)
SELECT 'rec_count'  AS section, COUNT(*) AS n FROM recommendations
  WHERE projectId = @bath_pid AND linked_tradesman_uid IS NOT NULL;
SELECT 'active_subs' AS section, COUNT(*) AS n FROM builder_subscriptions
  WHERE status = 'active' AND current_period_end > NOW();
