<?php
declare(strict_types=1);
// Additive, repeatable migration. DDL is journalled only after all steps succeed.
function migrateTerritories(PDO $db): void {
    if (!$db->query("SHOW TABLES LIKE 'campaigns'")->fetchColumn()) return;
    $db->exec('CREATE TABLE IF NOT EXISTS schema_migrations (version VARCHAR(40) PRIMARY KEY, applied_at DATETIME NOT NULL) ENGINE=InnoDB');
    if ($db->query("SELECT version FROM schema_migrations WHERE version='territories-v3.0'")->fetchColumn()) return;
    $lock=$db->query("SELECT GET_LOCK('fulx-territories-v3',15)")->fetchColumn();
    if ((int)$lock!==1) throw new RuntimeException('Migration lock unavailable');
    try {
        if (!$db->query("SHOW COLUMNS FROM campaigns LIKE 'inventory_mode'")->fetch())
            $db->exec("ALTER TABLE campaigns ADD inventory_mode VARCHAR(16) NOT NULL DEFAULT 'LEGACY', ADD catalog_complete TINYINT NOT NULL DEFAULT 0");
        if (!$db->query("SHOW COLUMNS FROM records LIKE 'partition_id'")->fetch())
            $db->exec('ALTER TABLE records ADD partition_id CHAR(32) NULL, ADD INDEX record_partition(campaign_id,partition_id)');
        $db->exec("CREATE TABLE IF NOT EXISTS regions (
            campaign_id CHAR(32) NOT NULL,id CHAR(32) NOT NULL,parent_id CHAR(32) NULL,
            level VARCHAR(16) NOT NULL,code VARCHAR(32) NOT NULL,name VARCHAR(160) NOT NULL,recipe_json TEXT NOT NULL,
            PRIMARY KEY(campaign_id,id),INDEX region_parent(campaign_id,parent_id),
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS partitions (
            campaign_id CHAR(32) NOT NULL,id CHAR(32) NOT NULL,region_id CHAR(32) NOT NULL,parent_id CHAR(32) NULL,
            recipe_json TEXT NOT NULL,state VARCHAR(24) NOT NULL DEFAULT 'NEW',source_total INT NULL,observed_total INT NOT NULL DEFAULT 0,
            boundary VARCHAR(24) NULL,worker_id CHAR(32) NULL,session_id VARCHAR(80) NULL,lease_until DATETIME(6) NULL,
            PRIMARY KEY(campaign_id,id),INDEX partition_queue(campaign_id,state),
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        if (!$db->query("SHOW COLUMNS FROM partitions LIKE 'sample_json'")->fetch())$db->exec('ALTER TABLE partitions ADD sample_json LONGTEXT NULL');
        $db->exec("CREATE TABLE IF NOT EXISTS territory_pages (
            campaign_id CHAR(32) NOT NULL,partition_id CHAR(32) NOT NULL,revision INT UNSIGNED NOT NULL,
            local_page INT UNSIGNED NOT NULL,page_no INT UNSIGNED NOT NULL,
            PRIMARY KEY(campaign_id,partition_id,revision,local_page),UNIQUE KEY territory_page(campaign_id,page_no),
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("CREATE TABLE IF NOT EXISTS record_locations (
            campaign_id CHAR(32) NOT NULL,identity_key VARCHAR(255) COLLATE utf8mb4_bin NOT NULL,
            partition_id CHAR(32) NOT NULL,local_page INT UNSIGNED NOT NULL,
            PRIMARY KEY(campaign_id,partition_id,identity_key),INDEX location_key(campaign_id,identity_key),
            FOREIGN KEY(campaign_id) REFERENCES campaigns(id) ON DELETE CASCADE
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4");
        $db->exec("INSERT IGNORE INTO schema_migrations VALUES('territories-v3.0',UTC_TIMESTAMP())");
    } finally { $db->query("SELECT RELEASE_LOCK('fulx-territories-v3')"); }
}
if (PHP_SAPI==='cli' && realpath($_SERVER['SCRIPT_FILENAME']??'')===__FILE__) {
    $config=require (getenv('FASIH_CONFIG')?:__DIR__.'/config.php');
    $db=new PDO($config['dsn'],$config['db_user'],$config['db_password'],[PDO::ATTR_ERRMODE=>PDO::ERRMODE_EXCEPTION]);
    migrateTerritories($db);echo "Migrasi wilayah v3 selesai. Data, hasil, dan token dipertahankan.\n";
}
