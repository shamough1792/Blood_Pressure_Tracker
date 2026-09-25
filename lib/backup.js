const crypto = require('node:crypto');

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
        const high = Number.parseInt(record.high_pressure, 10);
        const low = Number.parseInt(record.low_pressure, 10);
        const heart = Number.parseInt(record.heartbeat, 10);
        const timestamp = new Date(record.recorded_at);
        const valid = high >= 50 && high <= 250
            && low >= 30 && low <= 150
            && heart >= 30 && heart <= 200
            && low < high
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

module.exports = { createBackup, parseBackup, previewBackup };
