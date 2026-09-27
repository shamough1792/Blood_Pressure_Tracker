const express = require('express');
const defaultDb = require('../db');
const { buildHealthOverview } = require('../lib/health');
const { createUserActionToken } = require('../lib/user-action-token');
module.exports = function createPortalRouter(db = defaultDb) {
const router = express.Router();

// 使用者選擇頁
router.get('/', (req, res, next) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, users) => {
        if (err) return next(err);
        res.render('portal', { users, titleSuffix: process.env.TITLE_SUFFIX || '' });
    });
});

// 血壓記錄頁
router.get('/bp/:userId', (req, res) => {
    const userId = req.params.userId;
    db.query('SELECT name FROM users WHERE id = ?', [userId], (err, users) => {
        if (err || !users.length) return res.redirect('/');
        res.render('index', {
            successMessage: null,
            titleSuffix: process.env.TITLE_SUFFIX || '',
            userId,
            userName: users[0].name,
            actionToken: createUserActionToken(process.env.SESSION_SECRET, userId)
        });
    });
});

// 記錄頁（月曆檢視）
router.get('/records', (req, res, next) => {
    const userId = req.query.userId || 1;
    const monthSql = "SELECT DISTINCT DATE_FORMAT(recorded_at, '%Y-%m') AS record_month FROM records WHERE user_id = ? ORDER BY record_month DESC";
    db.query(monthSql, [userId], (monthErr, monthRows) => {
        if (monthErr) return next(monthErr);
        const months = monthRows.map(row => row.record_month);
        const selectedMonth = months.includes(req.query.yearMonth) ? req.query.yearMonth : (months[0] || null);
        const groupedRecords = Object.fromEntries(months.map(month => [month, []]));
        const userName = req.query.name || '';
        if (!selectedMonth) return res.render('records', { groupedRecords, selectedMonth: null, titleSuffix: process.env.TITLE_SUFFIX || '', userId, userName });

        const nextMonth = new Date(`${selectedMonth}-01T00:00:00`);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        const nextMonthValue = `${nextMonth.getFullYear()}-${String(nextMonth.getMonth() + 1).padStart(2, '0')}-01`;
        const recordsSql = 'SELECT * FROM records WHERE user_id = ? AND recorded_at >= ? AND recorded_at < ? ORDER BY recorded_at DESC';
        db.query(recordsSql, [userId, `${selectedMonth}-01`, nextMonthValue], (recordErr, results) => {
            if (recordErr) return next(recordErr);
            groupedRecords[selectedMonth] = results.map(record => {
                const date = new Date(record.recorded_at);
                return {
                    ...record,
                    formattedDate: date.toLocaleDateString('zh-HK', {
                        year: 'numeric', month: 'long', day: 'numeric'
                    }) + ' ' + (date.getHours() < 12 ? '上午' : '下午')
                };
            });
            res.render('records', { groupedRecords, selectedMonth, titleSuffix: process.env.TITLE_SUFFIX || '', userId, userName });
        });
    });
});

// 單日詳細記錄頁
router.get('/records/day', (req, res, next) => {
    const userId = req.query.userId || 1;
    const date = req.query.date || '';
    const nextDate = date ? new Date(`${date}T00:00:00`) : null;
    if (nextDate) nextDate.setDate(nextDate.getDate() + 1);
    const nextDateValue = nextDate ? `${nextDate.getFullYear()}-${String(nextDate.getMonth() + 1).padStart(2, '0')}-${String(nextDate.getDate()).padStart(2, '0')}` : '';
    db.query('SELECT * FROM records WHERE user_id = ? AND recorded_at >= ? AND recorded_at < ? ORDER BY recorded_at ASC', [userId, `${date} 00:00:00`, `${nextDateValue} 00:00:00`], (err, records) => {
        if (err) return next(err);
        const userName = req.query.name || '';
        const day = date ? new Date(`${date}T12:00:00`) : null;
        res.render('day-detail', {
            records,
            date,
            day,
            titleSuffix: process.env.TITLE_SUFFIX || '',
            userId,
            userName,
            actionToken: createUserActionToken(process.env.SESSION_SECRET, userId)
        });
    });
});

// 統計頁：趨勢圖 + 每月摘要
router.get('/stats', (req, res, next) => {
    const userId = req.query.userId || 1;
    const range = req.query.range === '0' ? 0 : (parseInt(req.query.range) || 6);
    const userName = req.query.name || '';
    const now = new Date();
    const cutoff = range === 0 ? null : new Date(now.getFullYear(), now.getMonth() - (range - 1), 1);
    const dateClause = cutoff ? ' AND recorded_at >= ?' : '';
    const baseParams = cutoff ? [userId, cutoff] : [userId];
    const summarySql = `SELECT COUNT(*) AS total, ROUND(AVG(high_pressure)) AS avg_high, ROUND(AVG(low_pressure)) AS avg_low, ROUND(AVG(heartbeat)) AS avg_heart, SUM(high_pressure >= 140 OR low_pressure >= 90) AS high_count, SUM(high_pressure < 90 OR low_pressure < 60) AS low_count, SUM(high_pressure < 140 AND low_pressure < 90 AND high_pressure >= 90 AND low_pressure >= 60) AS normal_count FROM records WHERE user_id = ?${dateClause}`;
    const chartSql = `SELECT DATE_FORMAT(recorded_at, '%c/%e') AS label, ROUND(AVG(high_pressure)) AS high, ROUND(AVG(low_pressure)) AS low, ROUND(AVG(heartbeat)) AS heart FROM records WHERE user_id = ?${dateClause} GROUP BY DATE(recorded_at) ORDER BY DATE(recorded_at) ASC`;
    const recentSql = `SELECT high_pressure, low_pressure, heartbeat, recorded_at FROM records WHERE user_id = ?${dateClause} ORDER BY recorded_at DESC LIMIT 7`;

    db.query(summarySql, baseParams, (summaryErr, summaryRows) => {
        if (summaryErr) return next(summaryErr);
        db.query(chartSql, baseParams, (chartErr, chartRows) => {
            if (chartErr) return next(chartErr);
            db.query(recentSql, baseParams, (recentErr, recentRows) => {
                if (recentErr) return next(recentErr);
                const summary = summaryRows[0] || {};
                const total = Number(summary.total) || 0;
                const normalCount = Number(summary.normal_count) || 0;
                const stats = {
                    total,
                    avgHigh: Number(summary.avg_high) || 0,
                    avgLow: Number(summary.avg_low) || 0,
                    avgHeart: Number(summary.avg_heart) || 0,
                    highCount: Number(summary.high_count) || 0,
                    lowCount: Number(summary.low_count) || 0,
                    normalCount,
                    normalRate: total ? Math.round(normalCount / total * 100) : 0
                };
                let chartData = chartRows.map(row => ({ label: row.label, high: Number(row.high) || 0, low: Number(row.low) || 0, heart: Number(row.heart) || 0 }));
                if (chartData.length > 90) {
                    const stride = Math.ceil(chartData.length / 90);
                    chartData = chartData.filter((_, i) => i % stride === 0 || i === chartData.length - 1);
                }
                const healthOverview = recentRows.length ? buildHealthOverview(recentRows.reverse()) : null;
                res.render('stats', { stats, chartData, healthOverview, range, userId, userName, titleSuffix: process.env.TITLE_SUFFIX || '' });
            });
        });
    });
});

return router;
};
