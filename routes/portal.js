const express = require('express');
const db = require('../db');
const router = express.Router();

// 使用者選擇頁
router.get('/', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, users) => {
        if (err) throw err;
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
            userName: users[0].name
        });
    });
});

// 記錄頁（月曆檢視）
router.get('/records', (req, res) => {
    const userId = req.query.userId || 1;
    db.query('SELECT * FROM records WHERE user_id = ? ORDER BY recorded_at DESC', [userId], (err, results) => {
        if (err) throw err;

        // Group records by year and month
        const groupedRecords = results.reduce((acc, record) => {
            const date = new Date(record.recorded_at);
            const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!acc[yearMonth]) {
                acc[yearMonth] = [];
            }
            acc[yearMonth].push({
                ...record,
                formattedDate: date.toLocaleDateString('zh-HK', {
                    year: 'numeric', month: 'long', day: 'numeric'
                }) + ' ' + (date.getHours() < 12 ? '上午' : '下午')
            });
            return acc;
        }, {});

        const selectedMonth = req.query.yearMonth || (Object.keys(groupedRecords).length ? Object.keys(groupedRecords)[0] : null);
        const userName = req.query.name || '';

        // Determine selected day: query param, or today (if current month), or first day with records
        let selectedDay = parseInt(req.query.day) || null;
        if (!selectedDay && selectedMonth) {
            const now = new Date();
            const [y, m] = selectedMonth.split('-').map(Number);
            const isCurrentMonth = now.getFullYear() === y && now.getMonth() + 1 === m;
            const monthRecords = groupedRecords[selectedMonth] || [];
            if (isCurrentMonth && monthRecords.some(r => new Date(r.recorded_at).getDate() === now.getDate())) {
                selectedDay = now.getDate();
            } else if (monthRecords.length) {
                selectedDay = new Date(monthRecords[0].recorded_at).getDate();
            }
        }

        res.render('records', { groupedRecords, selectedMonth, titleSuffix: process.env.TITLE_SUFFIX || '', userId, userName, selectedDay });
    });
});

// 統計頁：趨勢圖 + 每月摘要
router.get('/stats', (req, res) => {
    const userId = req.query.userId || 1;
    const range = req.query.range === '0' ? 0 : (parseInt(req.query.range) || 6);
    const userName = req.query.name || '';

    db.query('SELECT * FROM records WHERE user_id = ? ORDER BY recorded_at ASC', [userId], (err, results) => {
        if (err) throw err;

        const now = new Date();
        const cutoff = range === 0
            ? new Date(0) // 全部：唔限時
            : new Date(now.getFullYear(), now.getMonth() - (range - 1), 1);

        const filtered = results.filter(r => new Date(r.recorded_at) >= cutoff);

        // 摘要統計
        const stats = {
            total: filtered.length,
            avgHigh: 0, avgLow: 0, avgHeart: 0,
            highCount: 0, lowCount: 0, normalCount: 0
        };
        filtered.forEach(r => {
            stats.avgHigh += r.high_pressure;
            stats.avgLow += r.low_pressure;
            stats.avgHeart += r.heartbeat;
            if (r.high_pressure >= 140 || r.low_pressure >= 90) stats.highCount++;
            else if (r.high_pressure < 90 || r.low_pressure < 60) stats.lowCount++;
            else stats.normalCount++;
        });
        if (stats.total > 0) {
            stats.avgHigh = Math.round(stats.avgHigh / stats.total);
            stats.avgLow = Math.round(stats.avgLow / stats.total);
            stats.avgHeart = Math.round(stats.avgHeart / stats.total);
        }
        stats.normalRate = stats.total > 0 ? Math.round(stats.normalCount / stats.total * 100) : 0;

        // 圖表資料：按日聚合平均（早/晚平均成 1 日 1 點）
        const dayMap = {};
        filtered.forEach(r => {
            const d = new Date(r.recorded_at);
            const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
            if (!dayMap[key]) {
                dayMap[key] = { label: `${d.getMonth() + 1}/${d.getDate()}`, sumH: 0, sumL: 0, sumB: 0, n: 0 };
            }
            dayMap[key].sumH += r.high_pressure;
            dayMap[key].sumL += r.low_pressure;
            dayMap[key].sumB += r.heartbeat;
            dayMap[key].n++;
        });
        let chartData = Object.values(dayMap).map(x => ({
            label: x.label,
            high: Math.round(x.sumH / x.n),
            low: Math.round(x.sumL / x.n),
            heart: Math.round(x.sumB / x.n)
        }));

        // 日數仍太多：平均抽樣至最多 90 點（保留最後一點）
        if (chartData.length > 90) {
            const stride = Math.ceil(chartData.length / 90);
            chartData = chartData.filter((_, i) => i % stride === 0 || i === chartData.length - 1);
        }

        res.render('stats', {
            stats, chartData, range, userId, userName,
            titleSuffix: process.env.TITLE_SUFFIX || ''
        });
    });
});

module.exports = router;
