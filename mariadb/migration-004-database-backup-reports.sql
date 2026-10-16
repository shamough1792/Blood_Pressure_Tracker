-- 外部資料庫備份回報；不代表應用程式已讀取或驗證外部備份檔案。
CREATE TABLE IF NOT EXISTS database_backup_reports (
    id bigint unsigned NOT NULL AUTO_INCREMENT,
    actor varchar(255) NOT NULL,
    source varchar(100) NOT NULL,
    completed_at datetime NOT NULL,
    status varchar(10) NOT NULL,
    reference varchar(250) NOT NULL,
    checksum char(64) DEFAULT NULL,
    note text NOT NULL,
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id),
    KEY idx_db_backup_completed (completed_at, id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
