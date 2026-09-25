const mysql = require('mysql2');

const db = mysql.createPool({
    host: process.env.DB_HOST || '192.168.1.222',
    user: process.env.DB_USER || 'tracker_user',
    password: process.env.DB_PASSWORD || 'mypassword',
    database: process.env.DB_NAME || 'blood_test',
    waitForConnections: true,
    connectionLimit: Math.max(2, Number.parseInt(process.env.DB_POOL_SIZE, 10) || 10),
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0
});

db.on('connection', connection => {
    connection.query("SET time_zone = '+08:00'", error => {
        if (error) console.error('設定資料庫時區失敗：', error.message);
    });
});

module.exports = db;
