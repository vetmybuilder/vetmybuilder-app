-- 002_sales_script.sql
-- One-row singleton holding the admin sales script: a primer the LLM
-- consumes as context plus the generated/edited script markdown.

CREATE TABLE sales_script (
  id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
  primer TEXT NOT NULL,
  script_json TEXT NULL,
  generated_at DATETIME NULL,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
