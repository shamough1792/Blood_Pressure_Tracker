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
  ADD KEY `user_id` (`user_id`);


--
-- 外鍵
--
ALTER TABLE `records`
  ADD CONSTRAINT `records_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`);
COMMIT;

/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
