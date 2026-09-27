const mysql = require('mysql2');

const requiredDbVariables = ['DB_HOST', 'DB_USER', 'DB_PASSWORD', 'DB_NAME'];
const missingDbVariables = requiredDbVariables.filter(name => !String(process.env[name] || '').trim());
if (missingDbVariables.length && process.env.NODE_ENV === 'production') {
    throw new Error(`缺少必要資料庫環境變數：${missingDbVariables.join(', ')}`);
}

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
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
