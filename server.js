require('dotenv').config();
const { createApp } = require('./app');
const db = require('./db');
const { runMigrations } = require('./lib/migrations');
const port = process.env.PORT || 3000;
let server;
async function start() {
    const app = createApp();
    await runMigrations(db);
    server = app.listen(port, () => console.log(`Server running at http://localhost:${port}`));
}
start().catch(async error => {
    console.error('服務啟動失敗：', error.message);
    await db.promise().end();
    process.exitCode = 1;
});

function shutdown(signal) {
    console.log(`收到 ${signal}，正在停止服務…`);
    if (!server) return process.exit(0);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
