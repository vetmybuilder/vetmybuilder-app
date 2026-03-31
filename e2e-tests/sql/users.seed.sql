-- Reset users + roles for E2E
DELETE FROM user_roles;
DELETE FROM users;

-- -------------------------------------------------------
-- Seed ADMIN user (TEST_ADMIN_USER_UID)
-- -------------------------------------------------------
INSERT INTO users (
  uid,
  email,
  createdAt,
  locationRaw,
  postcode,
  postcodeSector,
  postcodeOutward,
  city,
  firstName,
  lastName,
  username
) VALUES (
  'BpSvMxVYpnQeG211hiY8cNPbDCW2',
  'admin@test.com',
  '2025-11-16 12:46:31',
  'E4 6JH',
  'E4 6JH',
  'E4 6',
  'E4',
  NULL,
  'Chris',
  'Morris',
  'chrismtest-admin'
);

INSERT INTO user_roles (uid, role)
VALUES ('BpSvMxVYpnQeG211hiY8cNPbDCW2', 'admin');

-- -------------------------------------------------------
-- Seed STANDARD user (TEST_USER_UID)
-- -------------------------------------------------------
INSERT INTO users (
  uid,
  email,
  createdAt,
  locationRaw,
  postcode,
  postcodeSector,
  postcodeOutward,
  city,
  firstName,
  lastName,
  username
) VALUES (
  'E2E_USER_UID_001',
  'user@test.com',
  '2025-11-16 12:46:31',
  'E4 6JH',
  'E4 6JH',
  'E4 6',
  'E4',
  NULL,
  'E2E',
  'User',
  'chrismtest-user'
);

INSERT INTO user_roles (uid, role)
VALUES ('E2E_USER_UID_001', 'user');