USE `vetmybuilder_test_s1_4_w0`;

CREATE TABLE IF NOT EXISTS _migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
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

CREATE TABLE recommendation_links (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INTEGER NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recommendations (
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

  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_recs_project ON recommendations(projectId);
CREATE INDEX idx_recs_user ON recommendations(recommenderUserId);
CREATE INDEX idx_recs_project_createdAt ON recommendations(projectId, createdAt DESC);
CREATE TABLE notifications (
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
CREATE TABLE user_profiles (
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
CREATE TABLE recommendation_votes (
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
CREATE TABLE recommendation_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recommendationId INTEGER NOT NULL,
  filePath TEXT NOT NULL,       -- relative path under /uploads
  mime TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rec_photos_rec ON recommendation_photos(recommendationId);
CREATE TABLE users (
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
CREATE TABLE favourites (
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
CREATE TABLE project_closures (
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
CREATE TABLE project_closure_photos (
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
CREATE TABLE user_roles (
  uid VARCHAR(255) PRIMARY KEY,
  role VARCHAR(50) NOT NULL DEFAULT 'user'         -- 'user' | 'tradesman' | 'admin'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen (
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
  likes_count INTEGER DEFAULT 0,
  wins_count INTEGER DEFAULT 0,

  status VARCHAR(50) DEFAULT 'draft',
  plan_updated_at DATETIME NULL,

  -- NEW: Google Places enrichment (admin activate flow)
  google_place_id VARCHAR(255) DEFAULT NULL,
  google_rating DECIMAL(3,2) DEFAULT NULL,
  google_reviews_count INT NOT NULL DEFAULT 0,

  -- migration 028
  profile_picture_url TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_service_areas ON tradesmen(service_areas);
CREATE INDEX idx_tradesmen_trade_types   ON tradesmen(trade_types);
CREATE TABLE tradesmen_offers (
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
CREATE TABLE tradesmen_warranties (
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

CREATE TABLE tradesmen_service_options (
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

CREATE TABLE tradesmen_payment_methods (
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
CREATE TABLE tradesmen_memberships (
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

CREATE TABLE tradesmen_insurance_policies (
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

CREATE TABLE tradesmen_certifications (
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

CREATE TABLE tradesmen_background_checks (
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

CREATE TABLE subscriptions_history (
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
CREATE TABLE favourite_tradesmen (
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
CREATE TABLE tradesmen_flags (
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
CREATE TABLE company_verifications (
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
CREATE TABLE project_contact_unlocks (
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


CREATE TABLE trade_shares (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      tradesman_uid VARCHAR(255) NOT NULL,
      photos_json TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, tradesman_uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen_photos (
      id                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tradesman_user_id VARCHAR(255) NOT NULL,
      url               TEXT NOT NULL,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_photos_user
      ON tradesmen_photos(tradesman_user_id, sort_order)
  ;
CREATE TABLE tradesman_interests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId INTEGER NOT NULL,
      fromUid VARCHAR(255) NOT NULL,
      recommendationId INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, fromUid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments_subscription (
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

CREATE TABLE payments_oneoff (
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

CREATE TABLE tradesmen_spotlight_views (
        tradesman_user_id VARCHAR(255) PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        last_viewed_at TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_oneoff_user_type_entity
         ON payments_oneoff (user_id, type, entity_id, status);
USE `vetmybuilder_test_s1_4_w1`;

CREATE TABLE IF NOT EXISTS _migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
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

CREATE TABLE recommendation_links (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INTEGER NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recommendations (
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

  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_recs_project ON recommendations(projectId);
CREATE INDEX idx_recs_user ON recommendations(recommenderUserId);
CREATE INDEX idx_recs_project_createdAt ON recommendations(projectId, createdAt DESC);
CREATE TABLE notifications (
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
CREATE TABLE user_profiles (
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
CREATE TABLE recommendation_votes (
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
CREATE TABLE recommendation_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recommendationId INTEGER NOT NULL,
  filePath TEXT NOT NULL,       -- relative path under /uploads
  mime TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rec_photos_rec ON recommendation_photos(recommendationId);
CREATE TABLE users (
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
CREATE TABLE favourites (
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
CREATE TABLE project_closures (
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
CREATE TABLE project_closure_photos (
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
CREATE TABLE user_roles (
  uid VARCHAR(255) PRIMARY KEY,
  role VARCHAR(50) NOT NULL DEFAULT 'user'         -- 'user' | 'tradesman' | 'admin'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen (
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
  likes_count INTEGER DEFAULT 0,
  wins_count INTEGER DEFAULT 0,

  status VARCHAR(50) DEFAULT 'draft',
  plan_updated_at DATETIME NULL,

  -- NEW: Google Places enrichment (admin activate flow)
  google_place_id VARCHAR(255) DEFAULT NULL,
  google_rating DECIMAL(3,2) DEFAULT NULL,
  google_reviews_count INT NOT NULL DEFAULT 0,

  -- migration 028
  profile_picture_url TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_service_areas ON tradesmen(service_areas);
CREATE INDEX idx_tradesmen_trade_types   ON tradesmen(trade_types);
CREATE TABLE tradesmen_offers (
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
CREATE TABLE tradesmen_warranties (
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

CREATE TABLE tradesmen_service_options (
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

CREATE TABLE tradesmen_payment_methods (
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
CREATE TABLE tradesmen_memberships (
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

CREATE TABLE tradesmen_insurance_policies (
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

CREATE TABLE tradesmen_certifications (
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

CREATE TABLE tradesmen_background_checks (
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

CREATE TABLE subscriptions_history (
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
CREATE TABLE favourite_tradesmen (
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
CREATE TABLE tradesmen_flags (
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
CREATE TABLE company_verifications (
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
CREATE TABLE project_contact_unlocks (
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


CREATE TABLE trade_shares (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      tradesman_uid VARCHAR(255) NOT NULL,
      photos_json TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, tradesman_uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen_photos (
      id                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tradesman_user_id VARCHAR(255) NOT NULL,
      url               TEXT NOT NULL,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_photos_user
      ON tradesmen_photos(tradesman_user_id, sort_order)
  ;
CREATE TABLE tradesman_interests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId INTEGER NOT NULL,
      fromUid VARCHAR(255) NOT NULL,
      recommendationId INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, fromUid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments_subscription (
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

CREATE TABLE payments_oneoff (
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

CREATE TABLE tradesmen_spotlight_views (
        tradesman_user_id VARCHAR(255) PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        last_viewed_at TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_oneoff_user_type_entity
         ON payments_oneoff (user_id, type, entity_id, status);
USE `vetmybuilder_test_s1_4_w2`;

CREATE TABLE IF NOT EXISTS _migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
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

CREATE TABLE recommendation_links (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INTEGER NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recommendations (
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

  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_recs_project ON recommendations(projectId);
CREATE INDEX idx_recs_user ON recommendations(recommenderUserId);
CREATE INDEX idx_recs_project_createdAt ON recommendations(projectId, createdAt DESC);
CREATE TABLE notifications (
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
CREATE TABLE user_profiles (
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
CREATE TABLE recommendation_votes (
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
CREATE TABLE recommendation_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recommendationId INTEGER NOT NULL,
  filePath TEXT NOT NULL,       -- relative path under /uploads
  mime TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rec_photos_rec ON recommendation_photos(recommendationId);
CREATE TABLE users (
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
CREATE TABLE favourites (
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
CREATE TABLE project_closures (
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
CREATE TABLE project_closure_photos (
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
CREATE TABLE user_roles (
  uid VARCHAR(255) PRIMARY KEY,
  role VARCHAR(50) NOT NULL DEFAULT 'user'         -- 'user' | 'tradesman' | 'admin'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen (
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
  likes_count INTEGER DEFAULT 0,
  wins_count INTEGER DEFAULT 0,

  status VARCHAR(50) DEFAULT 'draft',
  plan_updated_at DATETIME NULL,

  -- NEW: Google Places enrichment (admin activate flow)
  google_place_id VARCHAR(255) DEFAULT NULL,
  google_rating DECIMAL(3,2) DEFAULT NULL,
  google_reviews_count INT NOT NULL DEFAULT 0,

  -- migration 028
  profile_picture_url TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_service_areas ON tradesmen(service_areas);
CREATE INDEX idx_tradesmen_trade_types   ON tradesmen(trade_types);
CREATE TABLE tradesmen_offers (
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
CREATE TABLE tradesmen_warranties (
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

CREATE TABLE tradesmen_service_options (
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

CREATE TABLE tradesmen_payment_methods (
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
CREATE TABLE tradesmen_memberships (
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

CREATE TABLE tradesmen_insurance_policies (
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

CREATE TABLE tradesmen_certifications (
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

CREATE TABLE tradesmen_background_checks (
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

CREATE TABLE subscriptions_history (
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
CREATE TABLE favourite_tradesmen (
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
CREATE TABLE tradesmen_flags (
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
CREATE TABLE company_verifications (
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
CREATE TABLE project_contact_unlocks (
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


CREATE TABLE trade_shares (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      tradesman_uid VARCHAR(255) NOT NULL,
      photos_json TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, tradesman_uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen_photos (
      id                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tradesman_user_id VARCHAR(255) NOT NULL,
      url               TEXT NOT NULL,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_photos_user
      ON tradesmen_photos(tradesman_user_id, sort_order)
  ;
CREATE TABLE tradesman_interests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId INTEGER NOT NULL,
      fromUid VARCHAR(255) NOT NULL,
      recommendationId INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, fromUid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments_subscription (
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

CREATE TABLE payments_oneoff (
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

CREATE TABLE tradesmen_spotlight_views (
        tradesman_user_id VARCHAR(255) PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        last_viewed_at TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_oneoff_user_type_entity
         ON payments_oneoff (user_id, type, entity_id, status);
USE `vetmybuilder_test_s1_4_w3`;

CREATE TABLE IF NOT EXISTS _migrations (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(255) NOT NULL UNIQUE,
      appliedAt TEXT NOT NULL
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE projects (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  type VARCHAR(100) NOT NULL,
  location VARCHAR(255) NOT NULL,
  description TEXT NOT NULL,
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

CREATE TABLE recommendation_links (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  projectId INTEGER NOT NULL,
  token VARCHAR(255) NOT NULL UNIQUE,
  createdAt DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expiresAt DATETIME NULL,
  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE recommendations (
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

  FOREIGN KEY(projectId) REFERENCES projects(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_recs_project ON recommendations(projectId);
CREATE INDEX idx_recs_user ON recommendations(recommenderUserId);
CREATE INDEX idx_recs_project_createdAt ON recommendations(projectId, createdAt DESC);
CREATE TABLE notifications (
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
CREATE TABLE user_profiles (
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
CREATE TABLE recommendation_votes (
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
CREATE TABLE recommendation_photos (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  recommendationId INTEGER NOT NULL,
  filePath TEXT NOT NULL,       -- relative path under /uploads
  mime TEXT NOT NULL,
  sizeBytes INTEGER NOT NULL,
  createdAt TEXT NOT NULL,
  FOREIGN KEY (recommendationId) REFERENCES recommendations(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_rec_photos_rec ON recommendation_photos(recommendationId);
CREATE TABLE users (
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
CREATE TABLE favourites (
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
CREATE TABLE project_closures (
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
CREATE TABLE project_closure_photos (
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
CREATE TABLE user_roles (
  uid VARCHAR(255) PRIMARY KEY,
  role VARCHAR(50) NOT NULL DEFAULT 'user'         -- 'user' | 'tradesman' | 'admin'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen (
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
  likes_count INTEGER DEFAULT 0,
  wins_count INTEGER DEFAULT 0,

  status VARCHAR(50) DEFAULT 'draft',
  plan_updated_at DATETIME NULL,

  -- NEW: Google Places enrichment (admin activate flow)
  google_place_id VARCHAR(255) DEFAULT NULL,
  google_rating DECIMAL(3,2) DEFAULT NULL,
  google_reviews_count INT NOT NULL DEFAULT 0,

  -- migration 028
  profile_picture_url TEXT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_service_areas ON tradesmen(service_areas);
CREATE INDEX idx_tradesmen_trade_types   ON tradesmen(trade_types);
CREATE TABLE tradesmen_offers (
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
CREATE TABLE tradesmen_warranties (
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

CREATE TABLE tradesmen_service_options (
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

CREATE TABLE tradesmen_payment_methods (
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
CREATE TABLE tradesmen_memberships (
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

CREATE TABLE tradesmen_insurance_policies (
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

CREATE TABLE tradesmen_certifications (
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

CREATE TABLE tradesmen_background_checks (
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

CREATE TABLE subscriptions_history (
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
CREATE TABLE favourite_tradesmen (
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
CREATE TABLE tradesmen_flags (
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
CREATE TABLE company_verifications (
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
CREATE TABLE project_contact_unlocks (
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


CREATE TABLE trade_shares (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      project_id INTEGER NOT NULL,
      tradesman_uid VARCHAR(255) NOT NULL,
      photos_json TEXT NOT NULL,
      message TEXT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE(project_id, tradesman_uid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tradesmen_photos (
      id                INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      tradesman_user_id VARCHAR(255) NOT NULL,
      url               TEXT NOT NULL,
      sort_order        INTEGER NOT NULL DEFAULT 0,
      created_at        DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_tradesmen_photos_user
      ON tradesmen_photos(tradesman_user_id, sort_order)
  ;
CREATE TABLE tradesman_interests (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      projectId INTEGER NOT NULL,
      fromUid VARCHAR(255) NOT NULL,
      recommendationId INTEGER NOT NULL,
      note TEXT,
      createdAt TEXT NOT NULL,
      UNIQUE(projectId, fromUid)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE payments_subscription (
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

CREATE TABLE payments_oneoff (
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

CREATE TABLE tradesmen_spotlight_views (
        tradesman_user_id VARCHAR(255) PRIMARY KEY,
        views INTEGER NOT NULL DEFAULT 0,
        last_viewed_at TEXT
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE INDEX idx_oneoff_user_type_entity
         ON payments_oneoff (user_id, type, entity_id, status);
