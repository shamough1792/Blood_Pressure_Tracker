const express = require('express');

module.exports = function createHealthRouter(db) {
    const router = express.Router();
    router.get('/health', (req, res) => res.json({ status: 'ok' }));
    router.get('/ready', (req, res, next) => {
        db.query('SELECT 1 AS ready', error => {
            if (error) {
                error.statusCode = 503;
                return next(error);
            }
            res.json({ status: 'ready' });
        });
    });
    return router;
};
