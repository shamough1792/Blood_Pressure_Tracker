CREATE TABLE IF NOT EXISTS users (
    id int(11) NOT NULL AUTO_INCREMENT,
    name varchar(50) NOT NULL,
    color varchar(7) NOT NULL DEFAULT '#4CAF50',
    created_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;

INSERT IGNORE INTO users (id, name, color) VALUES (1, '使用者', '#4CAF50');

CREATE TABLE IF NOT EXISTS records (
    id int(11) NOT NULL AUTO_INCREMENT,
    high_pressure int(11) NOT NULL,
    low_pressure int(11) NOT NULL,
    heartbeat int(11) NOT NULL,
    recorded_at timestamp NOT NULL DEFAULT current_timestamp(),
    user_id int(11) NOT NULL DEFAULT 1,
    PRIMARY KEY (id),
    KEY user_id (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
