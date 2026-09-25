require('dotenv').config();
const { createApp } = require('./app');
const port = process.env.PORT || 3000;
const server = createApp().listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});

function shutdown(signal) {
    console.log(`收到 ${signal}，正在停止服務…`);
    server.close(() => process.exit(0));
    setTimeout(() => process.exit(1), 10000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
