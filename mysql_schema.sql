CREATE TABLE IF NOT EXISTS _migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
  answers_json JSON NULL,
  propertyType VARCHAR(100) NOT NULL,
  bedrooms INTEGER NOT NULL DEFAULT 0,
  ownerUserId VARCHAR(255) NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  archivedAt TEXT,
  completedAt TEXT,
  property_type TEXT,
  owner_uid TEXT,
  updatedAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recommendation_links (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INTEGER NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recommendations (
  id                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId         INTEGER NOT NULL,
  recommenderUserId VARCHAR(255),                 -- now nullable
  createdAt         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  name              TEXT,
  email             TEXT,
  company           TEXT,
  rating            INTEGER,
  comment           TEXT,
  isAnonymous       INTEGER DEFAULT 0, source VARCHAR(50) DEFAULT 'magic', phone TEXT,
  companyEmail      TEXT NULL,
  linked_tradesman_uid VARCHAR(255) NULL,
  -- Per-category star ratings (1-5). Nullable so legacy rows stay valid
  -- and the recommender can leave any category un-rated.
  quality_rating       TINYINT NULL,
  reliability_rating   TINYINT NULL,
  communication_rating TINYINT NULL,
  trust_rating         TINYINT NULL,
  value_rating         TINYINT NULL,
  deck_dismissed_at    DATETIME NULL,
  homeowner_unfavourited_at DATETIME NULL,

  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_recs_project ON recommendations(projectId);
CREATE INDEX idx_recs_user ON recommendations(recommenderUserId);
CREATE INDEX idx_recs_project_createdAt ON recommendations(projectId, createdAt DESC);
CREATE INDEX idx_recs_deck_active ON recommendations(projectId, deck_dismissed_at, homeowner_unfavourited_at);
CREATE TABLE IF NOT EXISTS notifications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId VARCHAR(255),                       -- target user
  type VARCHAR(50) NOT NULL,                -- e.g. 'project_live'
  message TEXT NOT NULL,
  projectId INTEGER,
  linkPath TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  readAt DATETIME NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notifications_user_created
  ON notifications(userId, createdAt DESC);
CREATE TABLE IF NOT EXISTS user_profiles (
  userId VARCHAR(255) PRIMARY KEY,
  locationRaw TEXT,
  postcode VARCHAR(16),          -- full postcode e.g. "E4 6JH"
  postcodeSector VARCHAR(16),    -- outward + first inward digit e.g. "E4 6"
  postcodeOutward VARCHAR(16),   -- outward e.g. "E4"
  city VARCHAR(64),              -- freeform city/borough token e.g. "chingford"
  updatedAt TEXT
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_user_profiles_postcode ON user_profiles(postcode);
CREATE INDEX idx_user_profiles_sector ON user_profiles(postcodeSector);
CREATE INDEX idx_user_profiles_outward ON user_profiles(postcodeOutward);
CREATE INDEX idx_user_profiles_city ON user_profiles(city);
CREATE TABLE IF NOT EXISTS recommendation_votes (
  id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recommendationId INTEGER NOT NULL,
  userId          VARCHAR(255) NOT NULL,
  value           INTEGER NOT NULL CHECK (value IN (-1, 1)),
  createdAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updatedAt       DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (recommendationId, userId),
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_recommendation_votes_rec
  ON recommendation_votes (recommendationId);
CREATE INDEX idx_recommendation_votes_user
  ON recommendation_votes (userId);
CREATE TABLE IF NOT EXISTS recommendation_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recommendationId INTEGER NOT NULL,
  filePath TEXT NOT NULL,       -- relative path under /uploads
  mime TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rec_photos_rec ON recommendation_photos(recommendationId);
CREATE TABLE IF NOT EXISTS users (
  uid VARCHAR(255) PRIMARY KEY,
  email TEXT,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  locationRaw TEXT,
  postcode VARCHAR(16),
  postcodeSector VARCHAR(16),
  postcodeOutward VARCHAR(16),
  city VARCHAR(64),
  firstName TEXT,
  lastName TEXT,
  username VARCHAR(255)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_users_createdAt ON users(createdAt);
CREATE TABLE IF NOT EXISTS favourites (
  userId    VARCHAR(255) NOT NULL,
  projectId INTEGER NOT NULL,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (userId, projectId),
  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_favourites_user      ON favourites(userId);
CREATE INDEX idx_favourites_project   ON favourites(projectId);
CREATE INDEX idx_favourites_createdAt ON favourites(createdAt);
CREATE INDEX idx_projects_owner_status     ON projects(ownerUserId, status);
CREATE INDEX idx_projects_status_location  ON projects(status, location);
CREATE INDEX idx_projects_createdAt        ON projects(createdAt);
CREATE INDEX idx_projects_name             ON projects(name(191));
CREATE INDEX idx_projects_type             ON projects(type);
CREATE INDEX idx_projects_propertyType     ON projects(propertyType);
CREATE TABLE IF NOT EXISTS project_closures (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INTEGER NOT NULL UNIQUE,

  didGoAhead INTEGER NOT NULL DEFAULT 1, -- 1=true, 0=false
  reasons TEXT,                          -- JSON array of strings
  otherReason TEXT,

  winnerRecommendationId INTEGER NULL,
  winner_tradesman_uid VARCHAR(255) NULL,
  winner_from_community TINYINT NOT NULL DEFAULT 0,
  wouldUseAgain INTEGER DEFAULT NULL,

  createdBy TEXT,                        -- uid
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE INDEX idx_project_closures_projectId ON project_closures(projectId);
CREATE TABLE IF NOT EXISTS project_closure_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INTEGER NOT NULL,
  filePath TEXT NOT NULL,
  mime TEXT,
  sizeBytes INTEGER,
  createdAt TEXT NOT NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_closure_photos_project ON project_closure_photos(projectId);
CREATE INDEX idx_pclosures_winner_did
  ON project_closures(winnerRecommendationId, didGoAhead);
CREATE INDEX idx_reco_votes_recoId
  ON recommendation_votes(recommendationId);
CREATE INDEX idx_reco_photos_recoId
  ON recommendation_photos(recommendationId);
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
LEFT JOIN closure_photos  cp ON cp.recommendationId = r.id
/* v_recommendation_scores(recommendationId,company,fromCommunity,likes_count,completed_count,positive_count,photos_count,has_2plus_photos,lastCompletedAt,score) */;
CREATE TABLE IF NOT EXISTS user_roles (
  uid VARCHAR(255) PRIMARY KEY,
  role VARCHAR(50) NOT NULL DEFAULT 'user'         -- 'user' | 'tradesman' | 'admin'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tradesmen (
  user_id VARCHAR(255) PRIMARY KEY,                 -- Firebase uid
  company_name VARCHAR(255) NOT NULL,
  contact_name VARCHAR(255),
  phone TEXT,
  email TEXT,
  trade_types VARCHAR(255),                         -- comma-separated for now
  service_areas VARCHAR(255),                       -- comma-separated for now
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  subscription_status VARCHAR(50) DEFAULT 'free',   -- free | trial | pro

  -- NEW: verification status used by admin activation flow
  verification_status VARCHAR(50) NOT NULL DEFAULT 'unverified', -- unverified | approved | rejected

  contact_credits INTEGER DEFAULT 0,
  plan TEXT,
  plan_update_at DATETIME NULL,
  purchased_plan TEXT,

  company_number TEXT,
  ch_status TEXT,
  ch_name VARCHAR(255),
  ch_checked_at DATETIME NULL,
  ch_match_score INTEGER DEFAULT 0,
  photo_count INTEGER DEFAULT 0,
  supporting_doc_count INTEGER DEFAULT 0,
  offers_discount INTEGER DEFAULT 0,
  warranty_months INTEGER DEFAULT 0,
  web_verified INTEGER DEFAULT 0,
  web_url TEXT,
  vmb_score INTEGER DEFAULT 0,
  vmb_badge VARCHAR(20) DEFAULT 'bronze',
  discount_min_percent INTEGER DEFAULT 0,
  discount_max_percent INTEGER DEFAULT 0,
  social_links_json TEXT,
  review_links_json TEXT NULL,
  likes_count INTEGER DEFAULT 0,
  wins_count INTEGER DEFAULT 0,

  status VARCHAR(50) DEFAULT 'draft',
  plan_updated_at DATETIME NULL,

  -- NEW: Google Places enrichment (admin activate flow)
  google_place_id VARCHAR(255) DEFAULT NULL,
  google_rating DECIMAL(3,2) DEFAULT NULL,
  google_reviews_count INT NOT NULL DEFAULT 0,

  -- Profile picture: one of the builder's uploaded work photos chosen as their avatar
  profile_picture_url TEXT NULL,

  -- Public-facing URL-safe ID (UUID) so Firebase UID is never exposed in URLs
  public_id VARCHAR(36) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_service_areas ON tradesmen(service_areas);
CREATE INDEX idx_tradesmen_trade_types   ON tradesmen(trade_types);
CREATE UNIQUE INDEX idx_tradesmen_public_id ON tradesmen(public_id);
CREATE TABLE IF NOT EXISTS tradesmen_offers (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  kind TEXT NOT NULL,                      -- 'discount','bundle','perk','cashback','finance','other'
  title TEXT NOT NULL,
  description TEXT,
  value_type TEXT,                         -- 'percent','amount','text'
  value_numeric REAL,
  value_currency VARCHAR(10) DEFAULT 'GBP',
  min_spend INTEGER,                       -- pennies
  coupon_code TEXT,
  valid_from TEXT,
  valid_until DATETIME NULL,
  new_customers_only INTEGER DEFAULT 0,    -- 0/1
  limited_quantity INTEGER DEFAULT 0,      -- 0/1
  quantity_remaining INTEGER,
  terms_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,    -- 0/1
  priority INTEGER NOT NULL DEFAULT 0,     -- higher shows first
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trd_offers_user ON tradesmen_offers(user_id);
CREATE INDEX idx_trd_offers_active ON tradesmen_offers(is_active, valid_until, priority);
CREATE TABLE IF NOT EXISTS tradesmen_warranties (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  coverage_text TEXT NOT NULL,             -- e.g. "Workmanship warranty"
  duration_months INTEGER,                 -- e.g. 12, 24, 60
  transferable INTEGER DEFAULT 0,          -- 0/1
  terms_url TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,    -- 0/1
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trd_warr_user ON tradesmen_warranties(user_id);

CREATE TABLE IF NOT EXISTS tradesmen_service_options (
  user_id VARCHAR(255) PRIMARY KEY,
  emergency_service INTEGER DEFAULT 0,     -- 0/1
  free_quotes INTEGER DEFAULT 1,           -- 0/1
  callout_fee_pennies INTEGER,             -- e.g. 4500 = £45.00
  response_sla_hours INTEGER,              -- target first-response
  finance_available INTEGER DEFAULT 0,     -- 0/1
  hours_json TEXT,                         -- JSON blob for opening hours
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tradesmen_payment_methods (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  method VARCHAR(50) NOT NULL,                    -- 'visa','mastercard','amex','bank_transfer','cash','apple_pay','klarna','paypal','other'
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trd_pay_user ON tradesmen_payment_methods(user_id);
CREATE INDEX idx_trd_pay_method ON tradesmen_payment_methods(method);
CREATE VIEW vw_tradesmen_marketing AS
SELECT 
  t.user_id,
  s.emergency_service,
  s.free_quotes,
  s.callout_fee_pennies,
  s.response_sla_hours,
  s.finance_available,
  s.hours_json,
  o.id AS offer_id,
  o.kind AS offer_kind,
  o.title AS offer_title,
  o.value_type,
  o.value_numeric,
  o.value_currency,
  o.valid_until
FROM tradesmen t
LEFT JOIN tradesmen_service_options s ON s.user_id = t.user_id
LEFT JOIN tradesmen_offers o
  ON o.user_id = t.user_id
 AND o.is_active = 1
LEFT JOIN (
  SELECT user_id, MAX(priority) AS maxp 
  FROM tradesmen_offers 
  WHERE is_active = 1 
  GROUP BY user_id
) p ON p.user_id = t.user_id AND o.priority = p.maxp
/* vw_tradesmen_marketing(user_id,emergency_service,free_quotes,callout_fee_pennies,response_sla_hours,finance_available,hours_json,offer_id,offer_kind,offer_title,value_type,value_numeric,value_currency,valid_until) */;
CREATE TABLE IF NOT EXISTS tradesmen_memberships (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  organisation VARCHAR(255) NOT NULL,              -- e.g. "Gas Safe Register", "FMB", "NICEIC"
  membership_id VARCHAR(50) DEFAULT '',  -- make NOT NULL so we can use UNIQUE without expressions
  membership_level TEXT,
  join_date TEXT,
  expiry_date TEXT,
  website_url TEXT,
  proof_doc_path TEXT,
  verified_status VARCHAR(50) DEFAULT 'queued',   -- queued|running|verified|expired|failed|manual_ok
  verified_at TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, organisation, membership_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trm_user ON tradesmen_memberships(user_id);
CREATE INDEX idx_trm_org ON tradesmen_memberships(organisation);
CREATE INDEX idx_trm_verify ON tradesmen_memberships(verified_status);

CREATE TABLE IF NOT EXISTS tradesmen_insurance_policies (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  provider TEXT NOT NULL,
  policy_number TEXT,
  coverage_type TEXT,                      -- 'public_liability','employers_liability','professional_indemnity'
  coverage_amount_pennies INTEGER,
  public_liability_pennies INTEGER,
  employer_liability_pennies INTEGER,
  indemnity_pennies INTEGER,
  issued_on TEXT,
  expires_on DATETIME,
  certificate_path TEXT,
  verified_status VARCHAR(50) DEFAULT 'queued',
  verified_at TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tri_user ON tradesmen_insurance_policies(user_id);
CREATE INDEX idx_tri_expires ON tradesmen_insurance_policies(expires_on);
CREATE INDEX idx_tri_verify ON tradesmen_insurance_policies(verified_status);

CREATE TABLE IF NOT EXISTS tradesmen_certifications (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  authority VARCHAR(100) NOT NULL,                 -- issuing body
  name VARCHAR(255) NOT NULL,                      -- cert/course name
  reference_no VARCHAR(100) NOT NULL DEFAULT '',   -- NOT NULL so UNIQUE has no expressions
  issued_on TEXT,
  expires_on DATETIME,
  badge_url TEXT,
  proof_doc_path TEXT,
  verified_status VARCHAR(50) DEFAULT 'queued',
  verified_at TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (user_id, authority, name, reference_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trc_user ON tradesmen_certifications(user_id);
CREATE INDEX idx_trc_verify ON tradesmen_certifications(verified_status);

CREATE TABLE IF NOT EXISTS tradesmen_background_checks (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(255) NOT NULL,
  check_type TEXT NOT NULL,                -- 'dbs_basic','dbs_enhanced','right_to_work', etc.
  reference_no VARCHAR(100),
  result TEXT,                             -- 'clear','notes','failed'
  issued_on TEXT,
  expires_on DATETIME,
  proof_doc_path TEXT,
  verified_status VARCHAR(50) DEFAULT 'queued',
  verified_at TEXT,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_trb_user ON tradesmen_background_checks(user_id);
CREATE INDEX idx_trb_verify ON tradesmen_background_checks(verified_status);

CREATE VIEW vw_tradesmen_trust_signals AS
SELECT
  t.user_id,
  (
    SELECT MAX(expires_on) FROM tradesmen_insurance_policies i
    WHERE i.user_id = t.user_id 
      AND i.verified_status IN ('verified','manual_ok')
      AND (i.expires_on IS NULL OR i.expires_on >= date('now'))
  ) AS insurance_valid_until,
  (
    SELECT MAX(COALESCE(public_liability_pennies, coverage_amount_pennies)) FROM tradesmen_insurance_policies i
    WHERE i.user_id = t.user_id AND i.verified_status IN ('verified','manual_ok')
  ) AS max_public_liability_pennies,
  (
    SELECT COUNT(1) FROM tradesmen_memberships m
    WHERE m.user_id = t.user_id 
      AND m.verified_status IN ('verified','manual_ok')
      AND (m.expiry_date IS NULL OR m.expiry_date >= date('now'))
  ) AS verified_membership_count,
  (
    SELECT COUNT(1) FROM tradesmen_certifications c
    WHERE c.user_id = t.user_id 
      AND c.verified_status IN ('verified','manual_ok')
      AND (c.expires_on IS NULL OR c.expires_on >= date('now'))
  ) AS verified_cert_count
FROM tradesmen t
/* vw_tradesmen_trust_signals(user_id,insurance_valid_until,max_public_liability_pennies,verified_membership_count,verified_cert_count) */;
CREATE INDEX idx_tradesmen_user_id ON tradesmen(user_id);

CREATE TABLE IF NOT EXISTS subscriptions_history (
  id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id         VARCHAR(255) NOT NULL,         -- matches tradesmen.user_id
  event           TEXT NOT NULL,
  from_status     TEXT,
  to_status       TEXT,
  from_plan       TEXT,
  to_plan         TEXT,
  purchased_plan  TEXT,
  actor           TEXT,
  reason          TEXT,
  at              DATETIME NOT NULL              -- timestamp of the event
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_subhist_user_at ON subscriptions_history(user_id, at);
CREATE TABLE IF NOT EXISTS favourite_tradesmen (
  id         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  userId     VARCHAR(255) NOT NULL,
  builderId  VARCHAR(255) NOT NULL,
  createdAt  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  UNIQUE KEY uniq_user_builder (userId, builderId),
  INDEX idx_favourite_user (userId),
  INDEX idx_favourite_builder (builderId)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_notifications_user ON notifications(userId, createdAt DESC);
CREATE INDEX idx_notifications_user_read ON notifications(userId, readAt);
CREATE INDEX idx_users_city ON users(city);
CREATE INDEX idx_users_postcode ON users(postcode);
CREATE INDEX idx_users_postcodeSector ON users(postcodeSector);
CREATE INDEX idx_users_postcodeOutward ON users(postcodeOutward);
CREATE TABLE IF NOT EXISTS tradesmen_flags (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      user_id VARCHAR(255) NOT NULL,          -- the tradesman (t.user_id)
      created_by TEXT NOT NULL,       -- admin/mod uid
      reason TEXT NOT NULL,
      severity VARCHAR(50) NOT NULL DEFAULT 'info', -- info | warn | block
      resolved INTEGER NOT NULL DEFAULT 0,
      notes VARCHAR(255) NOT NULL DEFAULT '',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      resolved_at TEXT
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_flags_user ON tradesmen_flags(user_id);
CREATE INDEX idx_flags_open ON tradesmen_flags(user_id,resolved);
CREATE TABLE IF NOT EXISTS company_verifications (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      recommendationId INTEGER NOT NULL,
      status TEXT NOT NULL,                        -- queued | running | verified | ambiguous | no_match | error
      companyNumber TEXT,
      companyName TEXT,
      score INTEGER,
      sicCodes TEXT,                               -- JSON string array
      raw TEXT,                                    -- raw JSON of best/candidates for support/debug
      errorMessage TEXT,
      checkedAt TEXT NOT NULL,                     -- ISO timestamp
      UNIQUE(recommendationId)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_cv_rec ON company_verifications(recommendationId);
CREATE TABLE IF NOT EXISTS project_contact_unlocks (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      buyer_uid  VARCHAR(255) NOT NULL,
      payment_intent TEXT,
      session_id  TEXT,
      amount      INTEGER NOT NULL DEFAULT 0, -- pence
      currency    VARCHAR(10) NOT NULL DEFAULT 'gbp',
      status      VARCHAR(50) NOT NULL DEFAULT 'pending', -- 'pending' | 'approved' | 'rejected'
      created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      approved_at DATETIME NULL,
      UNIQUE (project_id, buyer_uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS builder_subscriptions (
  id            INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       VARCHAR(128) NOT NULL,
  tier_id       VARCHAR(32) NOT NULL,
  stripe_subscription_id VARCHAR(255) NULL,
  status        ENUM('active', 'past_due', 'canceled', 'incomplete') NOT NULL DEFAULT 'incomplete',
  current_period_start  DATETIME NULL,
  current_period_end    DATETIME NULL,
  canceled_at   DATETIME NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_builder_subscriptions_stripe (stripe_subscription_id),
  KEY idx_builder_subscriptions_user_active (user_id, status, current_period_end)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS swipe_interest (
  id                       INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id               INT NOT NULL,
  homeowner_uid            VARCHAR(128) NOT NULL,
  builder_uid              VARCHAR(128) NOT NULL,
  source                   ENUM('recommended', 'subscribed') NOT NULL,
  status                   ENUM(
    'pending',
    'matched',
    'declined_by_homeowner',
    'declined_by_builder',
    'expired'
  ) NOT NULL DEFAULT 'pending',
  homeowner_swiped_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  builder_swiped_at        DATETIME NULL,
  created_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                           ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_swipe_interest_pair (project_id, builder_uid),
  KEY idx_swipe_interest_builder_pending (builder_uid, status, homeowner_swiped_at),
  KEY idx_swipe_interest_project_status (project_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS inbox_messages (
  id              INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id      INT NOT NULL,
  homeowner_uid   VARCHAR(128) NOT NULL,
  builder_uid     VARCHAR(128) NOT NULL,
  intro_message   TEXT NULL,
  source          ENUM('paid_unlock') NOT NULL DEFAULT 'paid_unlock',
  homeowner_replied_at DATETIME NULL,
  dismissed_at    DATETIME NULL,
  created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
                  ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uq_inbox_pair (project_id, builder_uid),
  KEY idx_inbox_homeowner (homeowner_uid, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS trade_shares (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      tradesman_uid VARCHAR(255) NOT NULL,
      photos_json TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, tradesman_uid),
      CONSTRAINT fk_trade_shares_tradesman
        FOREIGN KEY (tradesman_uid) REFERENCES tradesmen (user_id)
        ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tradesmen_photos (
      id                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tradesman_user_id VARCHAR(255) NOT NULL,
      url               TEXT NOT NULL,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_photos_user
      ON tradesmen_photos(tradesman_user_id, sort_order)
  ;
CREATE TABLE IF NOT EXISTS tradesman_interests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId INTEGER NOT NULL,
      fromUid VARCHAR(255) NOT NULL,
      recommendationId INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, fromUid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments_subscription (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    buyer_uid TEXT NOT NULL,
    plan_id TEXT NOT NULL,
    amount INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status TEXT NOT NULL,
    provider_session_id TEXT,
    provider_customer_id TEXT,
    provider_subscription_id TEXT,
    provider_payment_intent TEXT,
    created_at TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS payments_oneoff (
    id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id VARCHAR(255) NOT NULL,
    type VARCHAR(50) NOT NULL,
    entity_id INTEGER,
    amount INTEGER NOT NULL,
    currency VARCHAR(10) NOT NULL,
    status VARCHAR(50) NOT NULL,
    provider_session_id TEXT,
    provider_payment_intent TEXT,
    expires_at TEXT,
    created_at TEXT NOT NULL
  ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tradesmen_spotlight_views (
        tradesman_user_id VARCHAR(255) PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        last_viewed_at TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_oneoff_user_type_entity
         ON payments_oneoff (user_id, type, entity_id, status);

CREATE TABLE IF NOT EXISTS hires (
  id                    INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId             INT NOT NULL,
  homeownerUid          VARCHAR(255) NOT NULL,
  -- Exactly one of these is set: tradesmanUserId for onboarded tradesmen,
  -- recommendationId for an unjoined recommendation we need to invite.
  tradesmanUserId       VARCHAR(255) NULL,
  recommendationId      INT NULL,
  -- Denormalized snapshot of contact info at hire time, used for the magic-link
  -- invite flow when hiring a recommendation that's not yet onboarded.
  invitedCompanyName    VARCHAR(255) NULL,
  invitedContactEmail   VARCHAR(255) NULL,
  inviteChannel         VARCHAR(20)  NULL,
  inviteToken           VARCHAR(64)  NULL,
  -- pending_invite | pending | accepted | declined | cancelled | expired
  status                VARCHAR(20)  NOT NULL,
  homeownerMessage      TEXT NULL,
  tradesmanMessage      TEXT NULL,
  -- Validated against a known set in app code (server/lib/hireCancelReasons.js)
  cancelReason          VARCHAR(50) NULL,
  hiredAt               DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  respondedAt           DATETIME NULL,
  cancelledAt           DATETIME NULL,
  expiresAt             DATETIME NOT NULL,

  FOREIGN KEY (projectId) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Compound indexes for the route's "already actively hired?" lookup. NOT
-- unique — terminal-status hires (declined/cancelled/expired) are allowed
-- to coexist with a new active hire, so the homeowner can re-hire after a
-- decline. Uniqueness is enforced at the application level on active
-- statuses only (see hires.post.js).
CREATE INDEX idx_hires_project_tradesman
  ON hires (projectId, tradesmanUserId);

CREATE INDEX idx_hires_project_recommendation
  ON hires (projectId, recommendationId);

CREATE INDEX idx_hires_homeowner ON hires (homeownerUid);
CREATE INDEX idx_hires_tradesman ON hires (tradesmanUserId);
CREATE INDEX idx_hires_status    ON hires (status);
CREATE INDEX idx_hires_invite_token ON hires (inviteToken);

-- ─────────────────────────────────────────────────────────────────────
-- Project Lighthouse — AI Phase 2 (Tier 1 schema)
--
-- These four tables exist before any AI code is written. They are the
-- foundation every later AI feature builds on. Capture data now even
-- when nothing is reading it yet — match_observations in particular is
-- the gold dataset for the future re-ranker model.
-- See: project-lighthouse/project-lighthouse-plan.pptx (slide 9)
-- ─────────────────────────────────────────────────────────────────────

-- Structured representation of a free-text project description, produced
-- by an LLM call at submission time. Powers the matcher and decision
-- assistant downstream. The classifier_version column is critical so we
-- can re-run / A-B test prompt revisions without losing the audit trail.
CREATE TABLE IF NOT EXISTS project_classifications (
  id                 BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id         INT NOT NULL,
  classified_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  classifier_version VARCHAR(40) NOT NULL,
  raw_description    TEXT NOT NULL,
  -- {type, scope, complexity, urgency, materials, recommended_trades, price_band_estimate, ...}
  structured         JSON NOT NULL,
  cost_pence         INT NULL,
  latency_ms         INT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  KEY idx_pc_project (project_id),
  KEY idx_pc_version (classifier_version, classified_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- The single most valuable table in this whole schema. Every time a
-- builder is shown to a homeowner — recommendations card, jobs list,
-- search results — we log it here. Every action the homeowner then
-- takes (clicked, hired, dismissed) becomes a labelled training pair.
-- This is the dataset every future ranker is trained on. Log generously.
CREATE TABLE IF NOT EXISTS match_observations (
  id                  BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  project_id          INT NOT NULL,
  -- The unit being surfaced. At least one of these MUST be set:
  --   recommendation_id  : when the surface is the Top Recommendations card
  --                        on the project view (builder is referenced via
  --                        a company-name string, no uid yet)
  --   tradesman_user_id  : when the surface knows the tradesman uid directly
  --                        (jobs list, builder profile click-through, hires)
  -- Both are set when an auto-match links a recommendation to an onboarded
  -- tradesman during the hire flow.
  recommendation_id   INT NULL,
  tradesman_user_id   VARCHAR(255) NULL,
  surfaced_at         DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  -- 'top_recommendations' | 'jobs_list' | 'search' | 'builder_profile_visit' | 'hire_created'
  surface_context     VARCHAR(64) NOT NULL,
  rank_position       INT NOT NULL,
  -- Whatever score we showed at the time (deterministic + later learned)
  match_score         DECIMAL(7,3) NULL,
  -- 'viewed' | 'clicked' | 'hired' | 'dismissed' | NULL (no action yet)
  homeowner_action    VARCHAR(32) NULL,
  homeowner_action_at DATETIME NULL,
  -- 'accepted' | 'declined' | 'cancelled' | 'completed' | NULL
  hire_outcome        VARCHAR(32) NULL,
  hire_outcome_at     DATETIME NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE SET NULL,
  KEY idx_mo_project (project_id),
  KEY idx_mo_recommendation (recommendation_id),
  KEY idx_mo_tradesman (tradesman_user_id),
  KEY idx_mo_surface (surface_context, surfaced_at),
  KEY idx_mo_outcome (hire_outcome, hire_outcome_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Per-recommendation derived signals: how generic the comment is, what
-- themes it touches, sentiment score. Feeds the review summariser and
-- the trust/reputation model. Computed lazily.
CREATE TABLE IF NOT EXISTS recommendation_signals (
  recommendation_id  INT NOT NULL PRIMARY KEY,
  word_count         INT NOT NULL,
  -- 0..1 — how "boilerplate" the comment looks vs distinctive
  generic_score      DECIMAL(3,2) NULL,
  -- -1..+1
  sentiment          DECIMAL(3,2) NULL,
  -- ["price", "tidiness", "communication", ...]
  themes             JSON NULL,
  computed_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  classifier_version VARCHAR(40) NULL,

  FOREIGN KEY (recommendation_id) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Audit log of every LLM call. Required for cost tracking, prompt
-- iteration, and (eventually) retraining smaller models from the
-- larger model's outputs. Hash the prompt so we can dedup expensive
-- repeat calls without comparing entire bodies.
CREATE TABLE IF NOT EXISTS ai_inference_log (
  id           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  -- 'project_classify' | 'review_summary' | 'profile_coach' | ...
  feature      VARCHAR(64) NOT NULL,
  -- 'claude-haiku-4-5-20251001' | 'gpt-4o-mini' | 'llama-3.1-8b-local' ...
  model        VARCHAR(64) NOT NULL,
  prompt_hash  CHAR(64) NOT NULL,
  prompt       TEXT NOT NULL,
  response     TEXT NOT NULL,
  cost_pence   INT NULL,
  latency_ms   INT NULL,
  created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,

  KEY idx_ail_feature (feature, created_at),
  KEY idx_ail_hash (prompt_hash)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reports (
  id INT AUTO_INCREMENT PRIMARY KEY,
  reporter_uid VARCHAR(128) NOT NULL,
  target_type ENUM('profile','recommendation','photo') NOT NULL,
  target_id VARCHAR(255) NOT NULL,
  category ENUM('abuse','spam','fake_review','inappropriate_image','other') NOT NULL,
  detail TEXT DEFAULT NULL,
  status ENUM('open','reviewed','dismissed') NOT NULL DEFAULT 'open',
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME DEFAULT NULL,
  resolved_by VARCHAR(128) DEFAULT NULL,
  KEY idx_reports_status (status, created_at),
  KEY idx_reports_target (target_type, target_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tradesperson_pipeline (
  id INT AUTO_INCREMENT PRIMARY KEY,
  company_name VARCHAR(255) NOT NULL,
  trade_types VARCHAR(255) NULL,
  service_areas VARCHAR(255) NULL,
  google_place_id VARCHAR(255) NULL,
  google_rating DECIMAL(3,2) NULL,
  google_reviews_count INT NULL,
  company_number VARCHAR(20) NULL,
  ch_status VARCHAR(50) NULL,
  ch_name VARCHAR(255) NULL,
  phone VARCHAR(50) NULL,
  email VARCHAR(255) NULL,
  website TEXT NULL,
  ai_review_summary TEXT NULL,
  vetting_score INT DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  discovered_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at DATETIME NULL,
  claimed_by VARCHAR(255) NULL,
  INDEX idx_pipeline_status (status),
  INDEX idx_pipeline_trade_types (trade_types),
  INDEX idx_pipeline_service_areas (service_areas),
  UNIQUE INDEX idx_pipeline_google_place_id (google_place_id),
  INDEX idx_pipeline_company_number (company_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS notification_preferences (
  uid       VARCHAR(128) NOT NULL,
  category  VARCHAR(50)  NOT NULL,
  push_enabled TINYINT   NOT NULL DEFAULT 1,
  PRIMARY KEY (uid, category)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS push_subscriptions (
  id         INT AUTO_INCREMENT PRIMARY KEY,
  uid        VARCHAR(128) NOT NULL,
  endpoint   TEXT         NOT NULL,
  p256dh     TEXT         NOT NULL,
  auth       TEXT         NOT NULL,
  created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_push_uid (uid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS builder_summaries (
  id                  INT AUTO_INCREMENT PRIMARY KEY,
  company             VARCHAR(255) NOT NULL,
  bullets             JSON         NOT NULL,
  recommendation_count INT         NOT NULL,
  recommendation_ids  JSON         NOT NULL,
  classifier_version  VARCHAR(40)  NOT NULL,
  computed_at         DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_company (company)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS google_places_cache (
  cache_key  CHAR(64)  NOT NULL PRIMARY KEY,
  payload    JSON      NULL,
  fetched_at DATETIME  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_fetched_at (fetched_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS checkout_sessions (
  id VARCHAR(64) PRIMARY KEY,
  data JSON NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS pricing_lookup (
  id INT AUTO_INCREMENT PRIMARY KEY,
  subtype VARCHAR(255) NOT NULL,
  subtype_normalised VARCHAR(255) NOT NULL,
  location VARCHAR(20) NOT NULL DEFAULT '',
  min_pence INT NOT NULL,
  max_pence INT NOT NULL,
  source ENUM('ai', 'manual', 'stub') NOT NULL DEFAULT 'ai',
  reviewed TINYINT NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY idx_pricing_subtype_location (subtype_normalised, location)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS feedback (
  id INT AUTO_INCREMENT PRIMARY KEY,
  user_id VARCHAR(128) DEFAULT NULL,
  user_type VARCHAR(50) DEFAULT NULL,
  features_used TEXT DEFAULT NULL,
  rating TINYINT NOT NULL,
  ease_of_use TINYINT DEFAULT NULL,
  positives TEXT DEFAULT NULL,
  improvements TEXT DEFAULT NULL,
  recommend ENUM('yes','maybe','no') DEFAULT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  KEY idx_feedback_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS recommendation_invites (
  id              INT AUTO_INCREMENT PRIMARY KEY,
  recommendationId INT NOT NULL,
  sentToEmail    VARCHAR(255) NOT NULL,
  emailSentAt    DATETIME NULL,
  nudgeCount     INT NOT NULL DEFAULT 0,
  lastNudgedAt   DATETIME NULL,
  createdAt      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uk_recommendation_invites_rec (recommendationId),
  INDEX idx_recommendation_invites_lastnudged (lastNudgedAt)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
