-- 建立 users 表
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#4CAF50',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 新增預設使用者
INSERT INTO users (name, color) VALUES ('使用者', '#4CAF50');

-- records 表加入 user_id
ALTER TABLE records ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE records ADD FOREIGN KEY (user_id) REFERENCES users(id);
