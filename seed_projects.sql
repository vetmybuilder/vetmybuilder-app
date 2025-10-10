-- Seed demo data for pagination/filtering/header-sorting
-- Run with (choose the DB you want to seed):
--   sqlite3 server/data/app.db < seed_projects.sql
-- or
--   sqlite3 server/data/app.test.db < seed_projects.sql

PRAGMA foreign_keys = ON;
BEGIN;

------------------------------------------------------------
-- 0) Ensure users table has the demo/test users you provided
--    (so communityMembers stats and ownership look right)
------------------------------------------------------------
-- Schema expected by server:
-- users(uid TEXT PRIMARY KEY, email TEXT, createdAt TEXT, firstName TEXT, lastName TEXT, username TEXT)

-- Insert all known UIDs as users (INSERT OR IGNORE keeps existing users intact)
WITH seed(uid) AS (
  VALUES
    ('3X0sH7IACPPqC1LysV2KrXDqF602'),
    ('57QhGQ466TXlIcWWnsGeS44j2r33'),
    ('5UhpBBGGteU4z5TO3QUlK4QO1rs1'),
    ('9TNbg1wEopbuXtR2k6revfKpxU43'),
    ('AkZl58SmCSUevesQovxC7doYwF82'),
    ('D6NECjTRX7PsGZkHaWLtegwQE1L2'),
    ('F2kPfpV2cGVfOiZUMQQIdqwJTDj2'),
    ('Nx5PKj5J2IWZubyBQT5D5mhmGxg1'),
    ('ODaWnaTRijf8pT9uGX4iMnhJGi23'),
    ('T0Oy7mOh0OUPzpliteziG44EDua2'),
    ('Tr18fr1PvgWo8I22xIEx4H7ARMD3'),
    ('UFL7PrCWJ1hVRTA7l0of57gELWE2'),
    ('UVHBuFaK0vdfYPRt78SiZ7LxtDr1'),
    ('Ujuqj5HkxfdAeOnbwV5daLmO2xL2'),
    ('VzZ2D7ZkKgUhuGP3iqo6ZFstukI3'),
    ('X1pRG6eVAjZOkTDFrhVd1cQoip12'),
    ('YXtMeKoE53dRJQv5T4THeojfuc92'),
    ('Zver507dv6deA4R9hrfwiLqpbO23'),
    ('aOzLpxM0XtQjfaeQXUgTrh09A4m2'),
    ('cJCJo05jTBPosxSMRWy9dfpplXk1'),
    ('eqOe4j94GqbdpNvOkzWVnpy7CXb2'),
    ('kbh9K9LPfyQZNDA5wOmTDfH2K4N2'),
    ('l7r9BMOI8aY5epSDQW7SgIAh2Lo2'),
    ('lwc3xkSpDubzVrG6BkK1cEMJ1Vf2'),
    ('mLRdhjtzyacPqcmfc2qF0fl7eh73'),
    ('mvn7LNQEuVP1ZokwA1MS0rd9re83'),
    ('rKi4wGhOROZn9TEFyuAab8GutFz2'),
    ('tp5eRs6MFHeBJQsuMf0S5tsJzFg1'),
    ('vQC8jXwJqbT12i3Ni08rjCQ1RNj2'),
    ('zmv6rSFTCJfd23SA6rKxyhQIlWA2'),
    ('6LJ5Ow7IV2VjkhRNw8i3rieaAtd2'),
    ('K1alL805XLdfaR4OQhk4n2UmYMJ2'),
    ('rMo4lqB5X0fpC8DeiDJMomBAAO22')
)
INSERT OR IGNORE INTO users (uid, email, createdAt, firstName, lastName, username)
SELECT
  uid,
  uid || '@example.test' AS email,
  COALESCE((SELECT createdAt FROM users u WHERE u.uid = seed.uid), datetime('now')) AS createdAt,
  'Demo',
  'User',
  NULL
FROM seed;

------------------------------------------------------------
-- 1) Clean up previous demo rows so this script is idempotent
------------------------------------------------------------
DELETE FROM projects WHERE name LIKE 'Demo - %';

------------------------------------------------------------
-- 2) Choose two of your real UIDs as project owners
--    (use any two from the inserted set above)
------------------------------------------------------------
WITH owners(uid1, uid2) AS (
  SELECT
    '3X0sH7IACPPqC1LysV2KrXDqF602',  -- owner #1
    '57QhGQ466TXlIcWWnsGeS44j2r33'   -- owner #2
)

------------------------------------------------------------
-- 3) Seed projects (pending / live / archived)
--    Columns: projects(name, type, location, description, propertyType, bedrooms, ownerUserId, createdAt, status, archivedAt?)
------------------------------------------------------------

-- Pending (orange) — 12 rows
INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, createdAt, status)
VALUES
('Demo - Kitchen Refresh #01','Kitchen Remodel','E2 7AB','Simple cabinet refresh','Flat',1,(SELECT uid1 FROM owners),'2025-09-01T10:10:00.000Z','pending'),
('Demo - Bathroom Update #02','Bathroom Refurb','E3 4CD','New tiles & shower','Semi-Detached',1,(SELECT uid1 FROM owners),'2025-09-05T12:30:00.000Z','pending'),
('Demo - Loft Conversion #03','Loft Conversion','SW1A 1AA','Dormer with ensuite','Terraced',3,(SELECT uid1 FROM owners),'2025-09-10T09:00:00.000Z','pending'),
('Demo - Garden Studio #04','Outbuilding','N1 9GU','Office pod','Detached',0,(SELECT uid2 FROM owners),'2025-09-12T15:20:00.000Z','pending'),
('Demo - Full Rewire #05','Electrical','E4 6JH','Full house rewire','Bungalow',2,(SELECT uid2 FROM owners),'2025-09-13T08:45:00.000Z','pending'),
('Demo - New Roof #06','Roofing','SE1 2AA','Replace slate roof','Townhouse',4,(SELECT uid2 FROM owners),'2025-09-15T11:05:00.000Z','pending'),
('Demo - Open Plan #07','Structural','W1F 8ZT','RSJ install for open plan','Maisonette',2,(SELECT uid1 FROM owners),'2025-09-18T14:10:00.000Z','pending'),
('Demo - Driveway #08','Landscaping','NW3 2YY','Permeable block paving','Detached',3,(SELECT uid1 FROM owners),'2025-09-20T16:50:00.000Z','pending'),
('Demo - Boiler Swap #09','Plumbing & Heating','N15 5PX','New combi boiler','Flat',2,(SELECT uid2 FROM owners),'2025-09-22T13:33:00.000Z','pending'),
('Demo - Windows #10','Glazing','E14 5AB','Triple glazed units','End of Terrace',3,(SELECT uid2 FROM owners),'2025-09-24T09:12:00.000Z','pending'),
('Demo - Painter #11','Decorating','CR0 1AA','Whole house repaint','Cottage',3,(SELECT uid1 FROM owners),'2025-09-26T18:00:00.000Z','pending'),
('Demo - Patio #12','Landscaping','HA1 1ZZ','Sandstone patio','Semi-Detached',3,(SELECT uid1 FROM owners),'2025-09-28T07:25:00.000Z','pending');

-- Live (green) — 12 rows
INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, createdAt, status)
VALUES
('Demo - Kitchen Extension #13','Extension','E2 8AA','Rear kitchen diner','Semi-Detached',3,(SELECT uid1 FROM owners),'2025-08-01T10:10:00.000Z','live'),
('Demo - Ensuite Add #14','Bathroom Refurb','N10 3AB','Add ensuite in master','Detached',4,(SELECT uid2 FROM owners),'2025-08-03T11:20:00.000Z','live'),
('Demo - Garden Makeover #15','Landscaping','SE15 4CD','Turf + sleepers','Terraced',2,(SELECT uid1 FROM owners),'2025-08-05T12:30:00.000Z','live'),
('Demo - Media Wall #16','Carpentry','E17 6EF','Bespoke media wall','Flat',2,(SELECT uid2 FROM owners),'2025-08-07T13:40:00.000Z','live'),
('Demo - Tiling #17','Tiling','SW6 1ZZ','Porcelain throughout','Maisonette',2,(SELECT uid1 FROM owners),'2025-08-09T14:50:00.000Z','live'),
('Demo - Underfloor Heating #18','Heating','W4 3GH','UFH ground floor','Bungalow',3,(SELECT uid1 FROM owners),'2025-08-11T15:00:00.000Z','live'),
('Demo - Insulation #19','Insulation','NW6 7IJ','Internal wall insulation','Townhouse',5,(SELECT uid2 FROM owners),'2025-08-13T16:10:00.000Z','live'),
('Demo - Staircase #20','Joinery','E1 1AA','Oak staircase','End of Terrace',3,(SELECT uid2 FROM owners),'2025-08-15T09:15:00.000Z','live'),
('Demo - Bathroom Luxury #21','Bathroom Refurb','N1 0AA','Marble + walk-in shower','Terraced',3,(SELECT uid1 FROM owners),'2025-08-17T10:25:00.000Z','live'),
('Demo - Smart Home #22','Electrical','SE10 9AA','Lighting & controls','Detached',4,(SELECT uid1 FROM owners),'2025-08-19T11:35:00.000Z','live'),
('Demo - Brickwork #23','Masonry','E5 9ZZ','Repoint front facade','Cottage',2,(SELECT uid2 FROM owners),'2025-08-21T12:45:00.000Z','live'),
('Demo - Porch #24','Extension','DA1 2BB','New porch & canopy','Semi-Detached',3,(SELECT uid2 FROM owners),'2025-08-23T13:55:00.000Z','live');

-- Archived (red) — 12 rows (with archivedAt)
INSERT INTO projects (name, type, location, description, propertyType, bedrooms, ownerUserId, createdAt, status, archivedAt)
VALUES
('Demo - Roof Repair #25','Roofing','N5 1AB','Valley + felt repair','Terraced',3,(SELECT uid1 FROM owners),'2025-07-01T10:00:00.000Z','archived','2025-09-29T09:00:00.000Z'),
('Demo - Old Boiler #26','Plumbing & Heating','SE3 2BC','System removal','Flat',1,(SELECT uid2 FROM owners),'2025-07-03T11:10:00.000Z','archived','2025-09-15T09:00:00.000Z'),
('Demo - Conservatory #27','Glazing','E11 1CD','Replace poly roof','Semi-Detached',3,(SELECT uid1 FROM owners),'2025-07-05T12:20:00.000Z','archived','2025-09-20T09:00:00.000Z'),
('Demo - Fence #28','Landscaping','N2 2DE','Closeboard fence','Detached',4,(SELECT uid2 FROM owners),'2025-07-07T13:30:00.000Z','archived','2025-09-10T09:00:00.000Z'),
('Demo - Garage Makeover #29','Conversion','RM1 2EF','Garage to utility','Bungalow',2,(SELECT uid1 FROM owners),'2025-07-09T14:40:00.000Z','archived','2025-09-05T09:00:00.000Z'),
('Demo - Patch Plaster #30','Plastering','SW12 0GH','Patch & skim','Cottage',2,(SELECT uid2 FROM owners),'2025-07-11T15:50:00.000Z','archived','2025-08-30T09:00:00.000Z'),
('Demo - Lighting #31','Electrical','E3 3JK','Downlights','Maisonette',2,(SELECT uid1 FROM owners),'2025-07-13T16:00:00.000Z','archived','2025-08-20T09:00:00.000Z'),
('Demo - Bathroom Basic #32','Bathroom Refurb','CR7 8LM','Budget refresh','Townhouse',5,(SELECT uid2 FROM owners),'2025-07-15T09:10:00.000Z','archived','2025-08-18T09:00:00.000Z'),
('Demo - Patio Repair #33','Landscaping','E6 5NO','Lift & relay','End of Terrace',3,(SELECT uid1 FROM owners),'2025-07-17T10:20:00.000Z','archived','2025-08-10T09:00:00.000Z'),
('Demo - Wallpaper #34','Decorating','N7 6PQ','Feature walls','Flat',1,(SELECT uid2 FROM owners),'2025-07-19T11:30:00.000Z','archived','2025-08-05T09:00:00.000Z'),
('Demo - Cladding #35','Exterior','SE4 1RS','Timber cladding','Detached',4,(SELECT uid1 FROM owners),'2025-07-21T12:40:00.000Z','archived','2025-08-01T09:00:00.000Z'),
('Demo - Turf #36','Landscaping','NW1 4TU','Family lawn','Terraced',3,(SELECT uid2 FROM owners),'2025-07-23T13:50:00.000Z','archived','2025-07-30T09:00:00.000Z');

COMMIT;
