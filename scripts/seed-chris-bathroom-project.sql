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
     'https://images.unsplash.com/photo-1607990281513-2c110a25bd8c?w=600&q=80', 18, 'active',
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
-- 6b) Enrich the 5 RELEVANT recommendations so the builder profile page
--    (/builders/[id]) and the mobile redesign render with realistic data.
--    Adds:
--      - tradesmen.company_number (so Google JOIN via cv.companyNumber works)
--      - recommendations: comment / phone / email
--      - company_verifications row (status='verified' + companyNumber match)
--      - recommendation_photos (4-6 portfolio shots per rec)
--      - builder_summaries row (AI-style bullets per company)
--    Re-run safe: tradesmen via UPDATE, photos via DELETE-then-INSERT,
--    verifications + summaries via ON DUPLICATE KEY UPDATE.
-- ---------------------------------------------------------------------------

-- Tradesmen: company_number powers the JOIN that surfaces Google rating/count.
UPDATE tradesmen SET company_number = '12345601' WHERE user_id = 'sim-bath-rel-1';
UPDATE tradesmen SET company_number = '12345602' WHERE user_id = 'sim-bath-rel-2';
UPDATE tradesmen SET company_number = '12345603' WHERE user_id = 'sim-bath-rel-3';
UPDATE tradesmen SET company_number = '12345604' WHERE user_id = 'sim-bath-rel-4';
UPDATE tradesmen SET company_number = '12345605' WHERE user_id = 'sim-bath-rel-5';

-- Pre-populate google_place_id so the chip links somewhere realistic in dev.
UPDATE tradesmen SET google_place_id = 'ChIJSparkleBathFakePlaceID' WHERE user_id = 'sim-bath-rel-1';
UPDATE tradesmen SET google_place_id = 'ChIJAquaPlumbFakePlaceID'  WHERE user_id = 'sim-bath-rel-2';
UPDATE tradesmen SET google_place_id = 'ChIJTileMastersFakeID'     WHERE user_id = 'sim-bath-rel-3';
UPDATE tradesmen SET google_place_id = 'ChIJLondonBathroomFakeID'  WHERE user_id = 'sim-bath-rel-4';
UPDATE tradesmen SET google_place_id = 'ChIJPremierPlumbFakeID'    WHERE user_id = 'sim-bath-rel-5';

-- Recommendations: full write-up + contact details (recommender supplied).
UPDATE recommendations
   SET comment = 'Sparkle did a complete refit on our family bathroom. Tidy team, communicated well throughout, and finished a day early. Tile work in particular was outstanding.',
       phone = '07700 900 101',
       email = 'hello@sparklebathrooms.co.uk'
 WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-1';

UPDATE recommendations
   SET comment = 'Aqua sorted out a stubborn boiler issue plus repiped our airing cupboard. Fair quote, no surprises. Would use again for any plumbing work.',
       phone = '07700 900 102',
       email = 'jobs@aquaplumbing.co.uk'
 WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-2';

UPDATE recommendations
   SET comment = 'Tile Masters tiled our entire ground-floor extension. Brilliant attention to detail on the metro tile grouting around the boiler box.',
       phone = '07700 900 103',
       email = 'info@tilemasters.london'
 WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-3';

UPDATE recommendations
   SET comment = 'London Bathroom Co designed and installed a wet-room en-suite from scratch. Project ran 6 weeks, came in on budget. Genuinely friendly team.',
       phone = '07700 900 104',
       email = 'enquiries@londonbathroom.co'
 WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-4';

UPDATE recommendations
   SET comment = 'Premier replumbed a 1930s semi for us. Honest about what could be done in stages and what couldn''t. No mess left behind, fully recommend.',
       phone = '07700 900 105',
       email = 'office@premierplumbing.com'
 WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-5';

-- Resolve recommendation IDs once per company so we can attach
-- photos + verifications without relying on auto-increment ordering.
SET @rec1 := (SELECT id FROM recommendations WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-1' LIMIT 1);
SET @rec2 := (SELECT id FROM recommendations WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-2' LIMIT 1);
SET @rec3 := (SELECT id FROM recommendations WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-3' LIMIT 1);
SET @rec4 := (SELECT id FROM recommendations WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-4' LIMIT 1);
SET @rec5 := (SELECT id FROM recommendations WHERE projectId = @bath_pid AND linked_tradesman_uid = 'sim-bath-rel-5' LIMIT 1);

-- company_verifications — verified status with CH-style metadata.
INSERT INTO company_verifications
  (recommendationId, status, companyNumber, companyName, score, sicCodes, checkedAt)
VALUES
  (@rec1, 'verified', '12345601', 'SPARKLE BATHROOMS LTD',         95, '["43320"]', NOW()),
  (@rec2, 'verified', '12345602', 'AQUA PLUMBING SERVICES LTD',    92, '["43220"]', NOW()),
  (@rec3, 'verified', '12345603', 'TILE MASTERS LONDON LTD',       91, '["43330"]', NOW()),
  (@rec4, 'verified', '12345604', 'LONDON BATHROOM CO LTD',        96, '["43320","43330"]', NOW()),
  (@rec5, 'verified', '12345605', 'PREMIER PLUMBING GROUP LTD',    88, '["43220"]', NOW())
ON DUPLICATE KEY UPDATE
  status        = VALUES(status),
  companyNumber = VALUES(companyNumber),
  companyName   = VALUES(companyName),
  score         = VALUES(score),
  sicCodes      = VALUES(sicCodes),
  checkedAt     = VALUES(checkedAt);

-- Portfolio photos — 4-6 per recommendation. DELETE first so re-runs don't
-- accumulate duplicates (no UNIQUE constraint on this table).
DELETE FROM recommendation_photos WHERE recommendationId IN (@rec1,@rec2,@rec3,@rec4,@rec5);

INSERT INTO recommendation_photos (recommendationId, filePath, mime, sizeBytes, createdAt) VALUES
  -- Sparkle Bathrooms (sim-bath-rel-1)
  (@rec1, 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec1, 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec1, 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec1, 'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec1, 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=80', 'image/jpeg', 0, NOW()),
  -- Aqua Plumbing (sim-bath-rel-2)
  (@rec2, 'https://images.unsplash.com/photo-1601564921647-b446839a013f?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec2, 'https://images.unsplash.com/photo-1604709177595-ee9c2580e9a3?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec2, 'https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec2, 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80', 'image/jpeg', 0, NOW()),
  -- Tile Masters (sim-bath-rel-3)
  (@rec3, 'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec3, 'https://images.unsplash.com/photo-1565623833408-d77e39b88af6?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec3, 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec3, 'https://images.unsplash.com/photo-1556909195-4d27d7a23b06?w=1200&q=80', 'image/jpeg', 0, NOW()),
  -- London Bathroom Co (sim-bath-rel-4) — the one Chris is testing
  (@rec4, 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec4, 'https://images.unsplash.com/photo-1564540583246-934409427776?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec4, 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec4, 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec4, 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec4, 'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=1200&q=80', 'image/jpeg', 0, NOW()),
  -- Premier Plumbing (sim-bath-rel-5)
  (@rec5, 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec5, 'https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=1200&q=80', 'image/jpeg', 0, NOW()),
  (@rec5, 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 'image/jpeg', 0, NOW());

-- Extra recommendation rows for "London Bathroom Co" so the builder profile
-- aggregates more than one review. Different `name` values simulate
-- different recommenders even though the recommenderUserId stays sim-neighbour-001.
-- Each is matched against a unique linked_tradesman_uid alias so the existing
-- WHERE NOT EXISTS guards don't collapse them down to a single row.
INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, comment, source, linked_tradesman_uid, createdAt, isAnonymous, phone)
SELECT @bath_pid, 'sim-neighbour-001', 'Priya from Walthamstow', 'priya.dev@example.com',
       'London Bathroom Co', 5,
       'They tackled an awkward corner basin install in our terraced house. Honest about timings, kept us in the loop the whole way. The tiling was beautiful.',
       'friend', 'sim-bath-rel-4-rec2', NOW(), 0, '07700 900 201'
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-4-rec2');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, comment, source, linked_tradesman_uid, createdAt, isAnonymous, phone)
SELECT @bath_pid, 'sim-neighbour-001', 'Marcus from E4', 'marcus.dev@example.com',
       'London Bathroom Co', 5,
       'Full bathroom + en-suite refit on a tight 4-week timeline. They hit it. Dust sheets everywhere, no damage to our hallway, and the snagging list was sorted in 2 days.',
       'friend', 'sim-bath-rel-4-rec3', NOW(), 0, '07700 900 202'
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-4-rec3');

INSERT INTO recommendations
  (projectId, recommenderUserId, name, email, company, rating, comment, source, linked_tradesman_uid, createdAt, isAnonymous, phone)
SELECT @bath_pid, 'sim-neighbour-001', 'Hannah from N17', 'hannah.dev@example.com',
       'London Bathroom Co', 5,
       'We needed a wet room that worked for our elderly father. They quoted lower than two other firms, picked the right materials, and the result is genuinely accessible. Highly recommend.',
       'community', 'sim-bath-rel-4-rec4', NOW(), 0, '07700 900 203'
WHERE NOT EXISTS (SELECT 1 FROM recommendations WHERE projectId=@bath_pid AND linked_tradesman_uid='sim-bath-rel-4-rec4');

-- External review links — Trustpilot, Bark, Checkatrade, MyBuilder, Houzz.
-- Stored on tradesmen.review_links_json and surfaced via the recommendation
-- endpoint so the builder profile can render them too.
UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','trustpilot','url','https://uk.trustpilot.com/review/sparklebathrooms.co.uk'),
       JSON_OBJECT('platform','bark','url','https://www.bark.com/en/gb/company/sparkle-bathrooms-ltd/sparkleldn'),
       JSON_OBJECT('platform','checkatrade','url','https://www.checkatrade.com/trades/sparkle-bathrooms-ltd')
   )
 WHERE user_id = 'sim-bath-rel-1';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','trustpilot','url','https://uk.trustpilot.com/review/aquaplumbing.co.uk'),
       JSON_OBJECT('platform','mybuilder','url','https://www.mybuilder.com/profile/view/aqua_plumbing_services')
   )
 WHERE user_id = 'sim-bath-rel-2';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','houzz','url','https://www.houzz.co.uk/professionals/tilers/tile-masters-london-pfvwgb-pf~123'),
       JSON_OBJECT('platform','checkatrade','url','https://www.checkatrade.com/trades/tile-masters-london')
   )
 WHERE user_id = 'sim-bath-rel-3';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','trustpilot','url','https://uk.trustpilot.com/review/londonbathroom.co'),
       JSON_OBJECT('platform','bark','url','https://www.bark.com/en/gb/company/london-bathroom-co/lbcuk'),
       JSON_OBJECT('platform','checkatrade','url','https://www.checkatrade.com/trades/london-bathroom-co'),
       JSON_OBJECT('platform','mybuilder','url','https://www.mybuilder.com/profile/view/london_bathroom_co'),
       JSON_OBJECT('platform','houzz','url','https://www.houzz.co.uk/professionals/general-contractors/london-bathroom-co-pfvwgb-pf~456')
   )
 WHERE user_id = 'sim-bath-rel-4';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','trustpilot','url','https://uk.trustpilot.com/review/premierplumbing.com'),
       JSON_OBJECT('platform','yell','url','https://www.yell.com/biz/premier-plumbing-group-london')
   )
 WHERE user_id = 'sim-bath-rel-5';

-- ---------------------------------------------------------------------------
-- 6c) Enrich the 5 SUBSCRIBED tradesmen so /tradesman/sim-bath-sub-* pages
--    surface the same depth of data as the recommendation profiles. Adds:
--      - tradesmen_photos rows (real Unsplash portfolio shots)
--      - tradesmen.review_links_json (Trustpilot / Bark / etc.)
--      - tradesmen.likes_count + wins_count so the stat row isn't all zeros
--    Re-run safe: photos via DELETE-then-INSERT, links + counts via UPDATE.
-- ---------------------------------------------------------------------------

DELETE FROM tradesmen_photos
 WHERE tradesman_user_id IN (
   'sim-bath-sub-1','sim-bath-sub-2','sim-bath-sub-3','sim-bath-sub-4','sim-bath-sub-5'
 );

INSERT INTO tradesmen_photos (tradesman_user_id, url, sort_order, created_at) VALUES
  -- Bathworks Build & Tile (sim-bath-sub-1)
  ('sim-bath-sub-1', 'https://images.unsplash.com/photo-1564540583246-934409427776?w=1200&q=80', 1, NOW()),
  ('sim-bath-sub-1', 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 2, NOW()),
  ('sim-bath-sub-1', 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&q=80', 3, NOW()),
  ('sim-bath-sub-1', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80', 4, NOW()),
  ('sim-bath-sub-1', 'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=1200&q=80', 5, NOW()),
  -- Northside Plumbing Co (sim-bath-sub-2)
  ('sim-bath-sub-2', 'https://images.unsplash.com/photo-1604709177595-ee9c2580e9a3?w=1200&q=80', 1, NOW()),
  ('sim-bath-sub-2', 'https://images.unsplash.com/photo-1601564921647-b446839a013f?w=1200&q=80', 2, NOW()),
  ('sim-bath-sub-2', 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1200&q=80', 3, NOW()),
  ('sim-bath-sub-2', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80', 4, NOW()),
  -- Capital Tile Studio (sim-bath-sub-3)
  ('sim-bath-sub-3', 'https://images.unsplash.com/photo-1565623833408-d77e39b88af6?w=1200&q=80', 1, NOW()),
  ('sim-bath-sub-3', 'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=1200&q=80', 2, NOW()),
  ('sim-bath-sub-3', 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 3, NOW()),
  ('sim-bath-sub-3', 'https://images.unsplash.com/photo-1556909195-4d27d7a23b06?w=1200&q=80', 4, NOW()),
  -- Drainflow Plumbers (sim-bath-sub-4) — the one Chris is testing
  ('sim-bath-sub-4', 'https://images.unsplash.com/photo-1604709177595-ee9c2580e9a3?w=1200&q=80', 1, NOW()),
  ('sim-bath-sub-4', 'https://images.unsplash.com/photo-1581094271901-8022df4466f9?w=1200&q=80', 2, NOW()),
  ('sim-bath-sub-4', 'https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=1200&q=80', 3, NOW()),
  ('sim-bath-sub-4', 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 4, NOW()),
  ('sim-bath-sub-4', 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&q=80', 5, NOW()),
  ('sim-bath-sub-4', 'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=1200&q=80', 6, NOW()),
  -- Mira Build & Bathroom (sim-bath-sub-5)
  ('sim-bath-sub-5', 'https://images.unsplash.com/photo-1556909114-f6e7ad7d3136?w=1200&q=80', 1, NOW()),
  ('sim-bath-sub-5', 'https://images.unsplash.com/photo-1564540583246-934409427776?w=1200&q=80', 2, NOW()),
  ('sim-bath-sub-5', 'https://images.unsplash.com/photo-1556909195-4d27d7a23b06?w=1200&q=80', 3, NOW());

-- External review links for the subscribed builders.
UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','trustpilot','url','https://uk.trustpilot.com/review/bathworksbuild.co.uk'),
       JSON_OBJECT('platform','checkatrade','url','https://www.checkatrade.com/trades/bathworks-build-and-tile')
   )
 WHERE user_id = 'sim-bath-sub-1';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','trustpilot','url','https://uk.trustpilot.com/review/northsideplumbing.co.uk'),
       JSON_OBJECT('platform','mybuilder','url','https://www.mybuilder.com/profile/view/northside_plumbing'),
       JSON_OBJECT('platform','bark','url','https://www.bark.com/en/gb/company/northside-plumbing-co/nspl1')
   )
 WHERE user_id = 'sim-bath-sub-2';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','houzz','url','https://www.houzz.co.uk/professionals/tilers/capital-tile-studio-pfvwgb-pf~789'),
       JSON_OBJECT('platform','checkatrade','url','https://www.checkatrade.com/trades/capital-tile-studio')
   )
 WHERE user_id = 'sim-bath-sub-3';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','trustpilot','url','https://uk.trustpilot.com/review/drainflow.co.uk'),
       JSON_OBJECT('platform','bark','url','https://www.bark.com/en/gb/company/drainflow-plumbers/dpuk'),
       JSON_OBJECT('platform','checkatrade','url','https://www.checkatrade.com/trades/drainflow-plumbers'),
       JSON_OBJECT('platform','mybuilder','url','https://www.mybuilder.com/profile/view/drainflow_plumbers'),
       JSON_OBJECT('platform','yell','url','https://www.yell.com/biz/drainflow-plumbers-london')
   )
 WHERE user_id = 'sim-bath-sub-4';

UPDATE tradesmen
   SET review_links_json = JSON_ARRAY(
       JSON_OBJECT('platform','mybuilder','url','https://www.mybuilder.com/profile/view/mira_build_bathroom'),
       JSON_OBJECT('platform','yell','url','https://www.yell.com/biz/mira-build-and-bathroom')
   )
 WHERE user_id = 'sim-bath-sub-5';

-- Stat counts so the profile doesn't show "0 Likes / 0 Completed".
UPDATE tradesmen SET likes_count = 24, wins_count = 18 WHERE user_id = 'sim-bath-sub-1';
UPDATE tradesmen SET likes_count = 12, wins_count =  9 WHERE user_id = 'sim-bath-sub-2';
UPDATE tradesmen SET likes_count = 19, wins_count = 14 WHERE user_id = 'sim-bath-sub-3';
UPDATE tradesmen SET likes_count = 31, wins_count = 26 WHERE user_id = 'sim-bath-sub-4';
UPDATE tradesmen SET likes_count =  8, wins_count =  6 WHERE user_id = 'sim-bath-sub-5';

-- Same enrichment for the relevant tradesmen so /tradesman/sim-bath-rel-N
-- pages render a real gallery (not placehold.co fallbacks).
DELETE FROM tradesmen_photos
 WHERE tradesman_user_id IN (
   'sim-bath-rel-1','sim-bath-rel-2','sim-bath-rel-3','sim-bath-rel-4','sim-bath-rel-5'
 );

INSERT INTO tradesmen_photos (tradesman_user_id, url, sort_order, created_at) VALUES
  ('sim-bath-rel-1', 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&q=80', 1, NOW()),
  ('sim-bath-rel-1', 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 2, NOW()),
  ('sim-bath-rel-1', 'https://images.unsplash.com/photo-1620626011761-996317b8d101?w=1200&q=80', 3, NOW()),
  ('sim-bath-rel-2', 'https://images.unsplash.com/photo-1601564921647-b446839a013f?w=1200&q=80', 1, NOW()),
  ('sim-bath-rel-2', 'https://images.unsplash.com/photo-1604709177595-ee9c2580e9a3?w=1200&q=80', 2, NOW()),
  ('sim-bath-rel-3', 'https://images.unsplash.com/photo-1615874959474-d609969a20ed?w=1200&q=80', 1, NOW()),
  ('sim-bath-rel-3', 'https://images.unsplash.com/photo-1565623833408-d77e39b88af6?w=1200&q=80', 2, NOW()),
  ('sim-bath-rel-4', 'https://images.unsplash.com/photo-1552321554-5fefe8c9ef14?w=1200&q=80', 1, NOW()),
  ('sim-bath-rel-4', 'https://images.unsplash.com/photo-1564540586988-aa4e53c3d799?w=1200&q=80', 2, NOW()),
  ('sim-bath-rel-5', 'https://images.unsplash.com/photo-1521587760476-6c12a4b040da?w=1200&q=80', 1, NOW()),
  ('sim-bath-rel-5', 'https://images.unsplash.com/photo-1604014237800-1c9102c219da?w=1200&q=80', 2, NOW());

UPDATE tradesmen SET likes_count = 18, wins_count = 14 WHERE user_id = 'sim-bath-rel-1';
UPDATE tradesmen SET likes_count =  9, wins_count =  7 WHERE user_id = 'sim-bath-rel-2';
UPDATE tradesmen SET likes_count = 11, wins_count =  8 WHERE user_id = 'sim-bath-rel-3';
UPDATE tradesmen SET likes_count = 27, wins_count = 22 WHERE user_id = 'sim-bath-rel-4';
UPDATE tradesmen SET likes_count =  5, wins_count =  4 WHERE user_id = 'sim-bath-rel-5';

-- builder_summaries — three short bullets per company. Renders in the
-- "What the community says" card on the builder profile.
INSERT INTO builder_summaries
  (company, bullets, recommendation_count, recommendation_ids, classifier_version)
VALUES
  ('Sparkle Bathrooms Ltd',
    JSON_ARRAY(
      'Tidy, low-disruption bathroom installs',
      'Strong tile work — particularly metro and herringbone',
      'Reliable timekeeping; jobs typically finish on schedule'
    ), 1, JSON_ARRAY(@rec1), 'seed-v1'),
  ('Aqua Plumbing Services',
    JSON_ARRAY(
      'Clear, honest quoting',
      'Solid heating + plumbing diagnostics',
      'Communicates well during multi-day jobs'
    ), 1, JSON_ARRAY(@rec2), 'seed-v1'),
  ('Tile Masters London',
    JSON_ARRAY(
      'Specialist tilers — high-end finishes',
      'Patient with tricky cuts and awkward layouts',
      'Particularly strong on grouting detail'
    ), 1, JSON_ARRAY(@rec3), 'seed-v1'),
  ('London Bathroom Co',
    JSON_ARRAY(
      'Full design + installation — wet-rooms a speciality',
      'Long-running team; finishes consistently to spec',
      'Friendly homeowner-facing project management'
    ), 1, JSON_ARRAY(@rec4), 'seed-v1'),
  ('Premier Plumbing Group',
    JSON_ARRAY(
      'Honest about staged vs. one-shot jobs',
      'Experienced with older properties (1930s+ housing)',
      'Tidy worksite — no mess left behind'
    ), 1, JSON_ARRAY(@rec5), 'seed-v1')
ON DUPLICATE KEY UPDATE
  bullets              = VALUES(bullets),
  recommendation_count = VALUES(recommendation_count),
  recommendation_ids   = VALUES(recommendation_ids),
  classifier_version   = VALUES(classifier_version),
  computed_at          = CURRENT_TIMESTAMP;

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
