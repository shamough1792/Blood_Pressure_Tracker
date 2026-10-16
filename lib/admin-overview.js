function statusOf(record) {
    if (record.high_pressure >= 140 || record.low_pressure >= 90) return 'high';
    if (record.high_pressure < 90 || record.low_pressure < 60) return 'low';
    return 'normal';
}

function buildAdminOverview(records, now = new Date()) {
    if (!records.length) {
        return { latest: null, sevenDay: { total: 0, highRate: 0, normalRate: 0, lowRate: 0 }, alerts: [], userRates: [] };
    }
    const current = new Date(now);
    const cutoff = new Date(current.getTime() - 7 * 24 * 60 * 60 * 1000);
    const sorted = [...records].sort((a, b) => new Date(a.recorded_at) - new Date(b.recorded_at));
    const latestRecord = sorted.at(-1);
    const recent = sorted.filter(record => new Date(record.recorded_at) >= cutoff && new Date(record.recorded_at) <= current);
    const counts = { high: 0, normal: 0, low: 0 };
    recent.forEach(record => { counts[statusOf(record)]++; });
    const byUser = new Map();
    recent.forEach(record => {
        const key = record.user_id || record.user_name;
        if (!byUser.has(key)) byUser.set(key, { userId: record.user_id, userName: record.user_name || '已移除使用者', total: 0, high: 0 });
        const user = byUser.get(key);
        user.total++;
        if (statusOf(record) === 'high') user.high++;
    });
    const userRates = [...byUser.values()].filter(user => user.high > 0).map(user => ({ ...user, highRate: Math.round(user.high / user.total * 100) })).sort((a, b) => b.highRate - a.highRate || b.total - a.total).slice(0, 3);
    const rate = count => recent.length ? Math.round(count / recent.length * 100) : 0;
    const alerts = recent.filter(record => statusOf(record) !== 'normal').slice(-5).reverse().map(record => ({
        userId: record.user_id,
        day: `${new Date(record.recorded_at).getFullYear()}-${String(new Date(record.recorded_at).getMonth() + 1).padStart(2, '0')}-${String(new Date(record.recorded_at).getDate()).padStart(2, '0')}`,
        userName: record.user_name || '已移除使用者',
        high: record.high_pressure,
        low: record.low_pressure,
        recordedAt: record.recorded_at,
        status: statusOf(record)
    }));
    return {
        latest: {
            userName: latestRecord.user_name || '已移除使用者',
            high: latestRecord.high_pressure,
            low: latestRecord.low_pressure,
            heart: latestRecord.heartbeat,
            recordedAt: latestRecord.recorded_at,
            status: statusOf(latestRecord)
        },
        sevenDay: {
            total: recent.length,
            highRate: rate(counts.high),
            normalRate: rate(counts.normal),
            lowRate: rate(counts.low)
        },
        alerts,
        userRates
    };
}

function buildAdminOverviewQuery(userId) {
    const select = 'SELECT r.user_id, r.high_pressure, r.low_pressure, r.heartbeat, r.recorded_at, u.name AS user_name FROM records r LEFT JOIN users u ON u.id = r.user_id';
    const order = 'ORDER BY r.recorded_at ASC';
    if (!userId) {
        return {
            sql: `${select} WHERE r.recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY) OR r.id = (SELECT id FROM records ORDER BY recorded_at DESC, id DESC LIMIT 1) ${order}`,
            params: []
        };
    }
    return {
        sql: `${select} WHERE (r.user_id = ? AND r.recorded_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) OR r.id = (SELECT id FROM records WHERE user_id = ? ORDER BY recorded_at DESC, id DESC LIMIT 1) ${order}`,
        params: [Number(userId), Number(userId)]
    };
}

module.exports = { buildAdminOverview, buildAdminOverviewQuery };
