CREATE TABLE IF NOT EXISTS admins (
 id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY, username VARCHAR(100) NOT NULL UNIQUE,
 password_hash VARCHAR(255) NOT NULL, created_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS campaigns (
 id CHAR(32) PRIMARY KEY, scope VARCHAR(255) NOT NULL UNIQUE, name VARCHAR(160) NOT NULL,
 source_url TEXT NOT NULL, context_json LONGTEXT NOT NULL, prefix VARCHAR(16) NOT NULL,
 link_host VARCHAR(255) NOT NULL, expected_total INT UNSIGNED NOT NULL DEFAULT 0,
 state VARCHAR(24) NOT NULL DEFAULT 'CREATED', import_worker CHAR(32) NULL,
 filter_stamp TEXT NULL, generation INT UNSIGNED NOT NULL DEFAULT 1,
 created_at DATETIME(6) NOT NULL, updated_at DATETIME(6) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS workers (
 id CHAR(32) PRIMARY KEY, campaign_id CHAR(32) NOT NULL, name VARCHAR(100) NOT NULL,
 token_hash CHAR(64) NOT NULL UNIQUE, role VARCHAR(20) NOT NULL DEFAULT 'WORKER',
 enabled TINYINT NOT NULL DEFAULT 1, last_seen DATETIME(6) NULL, session_id VARCHAR(80) NULL,
 state VARCHAR(30) NOT NULL DEFAULT 'IDLE', activity VARCHAR(255) NOT NULL DEFAULT '',
 INDEX worker_campaign(campaign_id), FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS pages (
 campaign_id CHAR(32) NOT NULL, page_no INT UNSIGNED NOT NULL,
 signature_json LONGTEXT NOT NULL, state VARCHAR(24) NOT NULL DEFAULT 'PENDING',
 worker_id CHAR(32) NULL, session_id VARCHAR(80) NULL, claim_token CHAR(48) NULL,
 lease_until DATETIME(6) NULL, working_key VARCHAR(255) NULL,
 PRIMARY KEY(campaign_id,page_no), INDEX page_queue(campaign_id,state,page_no),
 FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS records (
 campaign_id CHAR(32) NOT NULL, identity_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
 page_no INT UNSIGNED NOT NULL, ordinal_no INT UNSIGNED NOT NULL,
 fields_json LONGTEXT NOT NULL, initial_mode VARCHAR(16) NOT NULL,
 result VARCHAR(24) NOT NULL DEFAULT 'PENDING', stage VARCHAR(40) NOT NULL DEFAULT 'DATA_TERSIMPAN',
 link TEXT NULL, link_hash CHAR(64) NULL, error TEXT NULL, attempts INT UNSIGNED NOT NULL DEFAULT 0,
 worker_id CHAR(32) NULL, captured_at DATETIME(6) NOT NULL,
 link_at DATETIME(6) NULL, finished_at DATETIME(6) NULL, updated_at DATETIME(6) NOT NULL,
 PRIMARY KEY(campaign_id,identity_key), UNIQUE KEY unique_link(campaign_id,link_hash),
 INDEX record_page(campaign_id,page_no,ordinal_no), INDEX record_result(campaign_id,result),
 INDEX record_worker(campaign_id,worker_id,finished_at),
 FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS events (
 id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY, campaign_id CHAR(32) NULL,
 worker_id CHAR(32) NULL, kind VARCHAR(40) NOT NULL, message VARCHAR(600) NOT NULL,
 created_at DATETIME(6) NOT NULL, INDEX event_campaign(campaign_id,id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
CREATE TABLE IF NOT EXISTS login_limits (
 bucket CHAR(64) PRIMARY KEY, hits INT UNSIGNED NOT NULL, expires_at DATETIME NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
