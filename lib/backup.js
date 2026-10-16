const crypto = require('node:crypto');
const { validMeasurement, inputError } = require('./admin-records');

const FORMAT = 'blood-pressure-tracker-backup';
const SCHEMA_VERSION = 1;

function checksumPayload(payload) {
    return crypto.createHash('sha256').update(JSON.stringify(payload)).digest('hex');
}

function createBackup({ users, records, exportedAt, appVersion }) {
    const payload = {
        format: FORMAT,
        schemaVersion: SCHEMA_VERSION,
        appVersion,
        exportedAt,
        users,
        records
    };
    return { ...payload, checksum: checksumPayload(payload) };
}

function parseBackup(content) {
    let backup;
    try {
        backup = JSON.parse(content);
    } catch {
        throw new Error('備份不是有效的 JSON 格式');
    }
    if (!backup || backup.format !== FORMAT || backup.schemaVersion !== SCHEMA_VERSION) {
        throw new Error('不支援的備份格式或版本');
    }
    if (!Array.isArray(backup.users) || !Array.isArray(backup.records)) {
        throw new Error('備份缺少 users 或 records 資料');
    }
    const { checksum, ...payload } = backup;
    if (typeof checksum !== 'string' || checksumPayload(payload) !== checksum) {
        throw new Error('備份 checksum 驗證失敗');
    }
    return backup;
}

function previewBackup(backup, targetUserId) {
    const validRows = [];
    let skipped = 0;
    for (const record of backup.records) {
        if (!record || typeof record !== 'object') { skipped++; continue; }
        const high = Number.parseInt(record.high_pressure, 10);
        const low = Number.parseInt(record.low_pressure, 10);
        const heart = Number.parseInt(record.heartbeat, 10);
        const timestamp = new Date(record.recorded_at);
        const valid = validMeasurement(record)
            && !Number.isNaN(timestamp.getTime());
        if (!valid) {
            skipped++;
            continue;
        }
        validRows.push([high, low, heart, timestamp, targetUserId]);
    }
    return {
        validRows,
        skipped,
        total: backup.records.length,
        exportedAt: backup.exportedAt,
        sourceVersion: backup.appVersion
    };
}

function previewFullBackup(backup) {
    const ids = new Set(), names = new Set();
    for (const user of backup.users) {
        if (!user || !Number.isSafeInteger(Number(user.id)) || Number(user.id) <= 0 || ids.has(Number(user.id))
            || typeof user.name !== 'string' || !user.name.trim() || user.name.trim().length > 50
            || names.has(user.name.trim()) || !/^#[a-f0-9]{6}$/i.test(user.color)) throw inputError('備份使用者資料無效或重複');
        ids.add(Number(user.id)); names.add(user.name.trim());
    }
    const userById = new Map(backup.users.map(user => [Number(user.id), user]));
    const validRows = [];
    let skipped = 0;
    for (const record of backup.records) {
        if (!record || typeof record !== 'object') { skipped++; continue; }
        const sourceUser = userById.get(Number(record.user_id));
        const high = Number.parseInt(record.high_pressure, 10);
        const low = Number.parseInt(record.low_pressure, 10);
        const heart = Number.parseInt(record.heartbeat, 10);
        const timestamp = new Date(record.recorded_at);
        const valid = sourceUser && validMeasurement(record) && !Number.isNaN(timestamp.getTime());
        if (!valid) {
            skipped++;
            continue;
        }
        validRows.push({ sourceUser, row: [high, low, heart, timestamp] });
    }
    return { validRows, skipped, total: backup.records.length, users: backup.users };
}

module.exports = { createBackup, parseBackup, previewBackup, previewFullBackup };
