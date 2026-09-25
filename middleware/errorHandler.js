function createErrorHandler({ logger = console } = {}) {
    return function errorHandler(error, req, res, next) {
        logger.error('Unhandled request error:', error);
        if (res.headersSent) return next(error);
        const statusCode = Number.isInteger(error.statusCode) ? error.statusCode : 500;
        if (req.originalUrl.startsWith('/api/') || req.originalUrl === '/ready') {
            return res.status(statusCode).json({ error: statusCode === 503 ? '資料庫尚未就緒' : '伺服器暫時無法處理請求' });
        }
        return res.status(statusCode).send('伺服器暫時無法處理請求');
    };
}

module.exports = { createErrorHandler };
