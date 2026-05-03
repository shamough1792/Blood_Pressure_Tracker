CREATE TABLE IF NOT EXISTS records (
    id int(11) NOT NULL AUTO_INCREMENT,
    high_pressure int(11) NOT NULL,
    low_pressure int(11) NOT NULL,
    heartbeat int(11) NOT NULL,
    recorded_at timestamp NOT NULL DEFAULT current_timestamp(),
    PRIMARY KEY (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_general_ci;
