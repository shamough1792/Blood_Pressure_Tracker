-- phpMyAdmin SQL Dump
-- version 5.2.2
-- https://www.phpmyadmin.net/
--
-- 主機： localhost
-- 產生時間： 2026 年 07 月 22 日
-- 伺服器版本： 10.11.11-MariaDB
-- PHP 版本： 8.2.28

SET SQL_MODE = "NO_AUTO_VALUE_ON_ZERO";
START TRANSACTION;
SET time_zone = "+00:00";

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!40101 SET NAMES utf8mb4 */;

-- --------------------------------------------------------

--
-- 資料表結構 `users`
--

CREATE TABLE `users` (
  `id` int(11) NOT NULL,
  `name` varchar(50) NOT NULL,
  `color` varchar(7) NOT NULL DEFAULT '#4CAF50',
  `created_at` timestamp NOT NULL DEFAULT current_timestamp()
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- 資料表索引 `users`
--
ALTER TABLE `users`
  ADD PRIMARY KEY (`id`);

ALTER TABLE `users`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

-- --------------------------------------------------------

--
-- 資料表結構 `records`
--

CREATE TABLE `records` (
  `id` int(11) NOT NULL,
  `high_pressure` int(11) NOT NULL,
  `low_pressure` int(11) NOT NULL,
  `heartbeat` int(11) NOT NULL,
  `recorded_at` timestamp NOT NULL DEFAULT current_timestamp(),
  `user_id` int(11) NOT NULL DEFAULT 1
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

--
-- 資料表索引 `records`
--
ALTER TABLE `records`
  ADD PRIMARY KEY (`id`),
  ADD KEY `user_id` (`user_id`),
  ADD KEY `idx_records_user_recorded_at` (`user_id`, `recorded_at`),
  ADD KEY `idx_records_recorded_at` (`recorded_at`);

ALTER TABLE `records`
  MODIFY `id` int(11) NOT NULL AUTO_INCREMENT;

--
-- 外鍵
--
ALTER TABLE `records`
  ADD CONSTRAINT `records_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;

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
