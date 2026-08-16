const mysql = require('mysql2');

// 單一連線（家用場景，量極細；毋需 pool）
const db = mysql.createConnection({
    host: process.env.DB_HOST || '192.168.1.222',
    user: process.env.DB_USER || 'tracker_user',
    password: process.env.DB_PASSWORD || '!Lkw988667',
    database: process.env.DB_NAME || 'blood_test'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to database');
});

// 每 10 分鐘檢查連線，斷線自動重連（唔 log 成功，避免洗 log）
setInterval(() => {
    db.query('SELECT 1', (err) => {
        if (err) {
            console.error('Database connection lost, reconnecting:', err);
            db.connect((err2) => {
                if (err2) {
                    console.error('Error reconnecting to database:', err2);
                } else {
                    console.log('Reconnected to database');
                }
            });
        }
    });
}, 600000);

module.exports = db;
