function inputError(message, statusCode = 400) {
    return Object.assign(new Error(message), { statusCode });
}

function localDate(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function parseRecordFilters(query, now = new Date()) {
    const integer = (value, fallback) => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) ? Number(value) : fallback;
    const page = Math.max(1, integer(query.page, 1));
    const pageSize = Math.min(100, Math.max(10, integer(query.pageSize, 50)));
    const userId = integer(query.user, 0) > 0 ? String(query.user) : '';
    let from = query.from || '', to = query.to || '';
    if (['today', '7d', '30d', 'month'].includes(query.range)) {
        const start = new Date(now);
        if (query.range === 'month') start.setDate(1);
        else start.setDate(start.getDate() - ({ today: 0, '7d': 6, '30d': 29 }[query.range]));
        from = localDate(start); to = localDate(now);
    }
    for (const date of [from, to]) {
        if (date && (!/^\d{4}-\d{2}-\d{2}$/.test(date) || Number.isNaN(Date.parse(date)) || new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date)) throw inputError('日期無效');
    }
    if (from && to && from > to) throw inputError('開始日期不可晚於結束日期');
    const status = ['normal', 'high', 'low'].includes(query.status) ? query.status : '';
    const sort = query.sort === 'oldest' ? 'oldest' : 'newest';
    const where = [], params = [];
    if (userId) { where.push('r.user_id = ?'); params.push(userId); }
    if (from) { where.push('r.recorded_at >= ?'); params.push(`${from} 00:00:00`); }
    if (to) { where.push('r.recorded_at < DATE_ADD(?, INTERVAL 1 DAY)'); params.push(`${to} 00:00:00`); }
    if (status === 'high') where.push('(r.high_pressure >= 140 OR r.low_pressure >= 90)');
    if (status === 'low') where.push('(r.high_pressure < 90 OR r.low_pressure < 60) AND r.high_pressure < 140 AND r.low_pressure < 90');
    if (status === 'normal') where.push('r.high_pressure < 140 AND r.low_pressure < 90 AND r.high_pressure >= 90 AND r.low_pressure >= 60');
    return { page, pageSize, userId, from, to, status, sort, where: where.length ? `WHERE ${where.join(' AND ')}` : '', params };
}

function validateReason(value) {
    if (typeof value !== 'string' || !value.trim() || value.trim().length > 250) throw inputError('請填寫 1 至 250 字的操作原因');
    return value.trim();
}

function validMeasurement(record) {
    if (!record || typeof record !== 'object') return false;
    const values = [record.high_pressure, record.low_pressure, record.heartbeat].map(value => /^(0|[1-9]\d*)$/.test(String(value)) ? Number(value) : NaN);
    const [high, low, heart] = values;
    return high >= 50 && high <= 250 && low >= 30 && low <= 150 && low < high && heart >= 30 && heart <= 200;
}

function validateRecordEdit(body) {
    if (!validMeasurement(body)) throw inputError('血壓或心跳數值無效（收縮壓 50–250、舒張壓 30–150、心跳 30–200，舒張壓須低於收縮壓）');
    if (typeof body.recorded_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/.test(body.recorded_at) || Number.isNaN(Date.parse(body.recorded_at)) || new Date(body.recorded_at).toISOString().slice(0, 10) !== body.recorded_at.slice(0, 10)) throw inputError('量測時間無效，必須包含 UTC 時區');
    return { high: Number(body.high_pressure), low: Number(body.low_pressure), heart: Number(body.heartbeat), recordedAt: new Date(body.recorded_at), reason: validateReason(body.reason) };
}

module.exports = { parseRecordFilters, validateRecordEdit, validateReason, validMeasurement, inputError };
