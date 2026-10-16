const { previewBackup, previewFullBackup } = require('./backup');
const { inputError } = require('./admin-records');

function recordKey(user, row) {
    return JSON.stringify([user, ...row.slice(0, 3).map(Number), Math.floor(new Date(row[3]).getTime() / 1000)]);
}

async function planImport(connection, backup, mode, targetId, lock = false) {
    if (!['full', 'single'].includes(mode)) throw inputError('匯入模式無效');
    const [existingUsers] = await connection.query(`SELECT id, name FROM users ORDER BY id${lock ? ' FOR UPDATE' : ''}`);
    let preview, users, candidates;
    if (mode === 'full') {
        preview = previewFullBackup(backup);
        users = backup.users.map(source => {
            const matches = existingUsers.filter(user => user.name === source.name.trim());
            if (matches.length > 1) throw inputError(`使用者「${source.name}」有重複名稱，請先整理後再還原`);
            return { sourceId: Number(source.id), name: source.name.trim(), color: source.color, targetId: matches[0]?.id || null };
        });
        candidates = preview.validRows.map(item => ({ user: users.find(user => user.sourceId === Number(item.sourceUser.id)), row: item.row }));
    } else {
        const target = existingUsers.find(user => Number(user.id) === Number(targetId));
        if (!target) throw inputError('找不到指定使用者');
        users = [{ name: target.name, targetId: target.id }];
        preview = previewBackup(backup, target.id);
        candidates = preview.validRows.map(row => ({ user: users[0], row: row.slice(0, 4) }));
    }
    if (backup.records.length > 5000 || users.length > 1000) throw inputError('單次最多匯入 5000 筆記錄及 1000 位使用者', 413);
    const targetIds = users.filter(user => user.targetId).map(user => user.targetId);
    const [existing] = targetIds.length && candidates.length
        ? await connection.query('SELECT high_pressure, low_pressure, heartbeat, recorded_at, user_id FROM records WHERE user_id IN (?) AND recorded_at BETWEEN ? AND ?', [targetIds, new Date(Math.min(...candidates.map(item => item.row[3].getTime())) - 1000), new Date(Math.max(...candidates.map(item => item.row[3].getTime())) + 1000)])
        : [[]];
    const keys = new Set(existing.map(record => recordKey(`id:${record.user_id}`, [record.high_pressure, record.low_pressure, record.heartbeat, record.recorded_at])));
    const rows = [];
    let duplicates = 0;
    for (const item of candidates) {
        const key = recordKey(item.user.targetId ? `id:${item.user.targetId}` : `source:${item.user.sourceId}`, item.row);
        if (keys.has(key)) { duplicates++; continue; }
        keys.add(key);
        rows.push(item);
    }
    return { users, rows, total: preview.total, skipped: preview.skipped, duplicates };
}

async function applyImport(connection, plan) {
    for (const user of plan.users) {
        if (user.targetId) continue;
        const [result] = await connection.query('INSERT INTO users (name, color) VALUES (?, ?)', [user.name, user.color]);
        user.targetId = result.insertId;
    }
    for (const item of plan.rows) {
        await connection.query('INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)', [...item.row, item.user.targetId]);
    }
    return plan.rows.length;
}

module.exports = { planImport, applyImport };
