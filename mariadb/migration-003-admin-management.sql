-- 升級前請先備份資料庫。可重複執行；不修改既有使用者或血壓資料。
CREATE TABLE IF NOT EXISTS admin_audit_logs (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    actor varchar(255) NOT NULL,
    action varchar(50) NOT NULL,
    target_id int DEFAULT NULL,
    affected_count int NOT NULL DEFAULT 0,
    status varchar(10) NOT NULL,
    details mediumtext NOT NULL,
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_audit_created (created_at, id),
    KEY idx_audit_target (target_id, action, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS backup_logs (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    actor varchar(255) NOT NULL,
    format varchar(10) NOT NULL,
    record_count int NOT NULL,
    user_count int NOT NULL,
    checksum char(64) DEFAULT NULL,
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
