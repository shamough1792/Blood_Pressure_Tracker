const express = require('express');
const crypto = require('node:crypto');
const { withTransaction } = require('../lib/db-transaction');
const { validateRecordEdit, validateReason, inputError } = require('../lib/admin-records');
const { writeAudit, writeFailure } = require('../lib/admin-audit');

module.exports = function createManagementRouter(db, actor) {
    const router = express.Router();
    const validId = value => /^\d+$/.test(String(value)) && Number.isSafeInteger(Number(value)) && Number(value) > 0;
    function validateIds(ids) {
        if (!Array.isArray(ids) || !ids.length || ids.length > 100 || ids.some(id => !validId(id)) || new Set(ids.map(Number)).size !== ids.length) throw inputError('請選擇 1 至 100 筆不重複的記錄');
        return ids;
    }
    function fingerprint(rows) {
        return crypto.createHash('sha256').update(JSON.stringify([...rows].sort((a, b) => Number(a.id) - Number(b.id)).map(row => [Number(row.id), Number(row.user_id), Number(row.high_pressure), Number(row.low_pressure), Number(row.heartbeat), new Date(row.recorded_at).toISOString()]))).digest('hex');
    }

    router.get('/admin/activity', async (req, res, next) => {
        try {
            const page = Math.min(100000, Math.max(1, Number.parseInt(req.query.page, 10) || 1));
            const [logs] = await db.promise().query('SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 51 OFFSET ?', [(page - 1) * 50]);
            const [backups] = await db.promise().query('SELECT * FROM backup_logs ORDER BY id DESC LIMIT 10');
            const [databaseBackups] = await db.promise().query('SELECT * FROM database_backup_reports ORDER BY completed_at DESC, id DESC LIMIT 10');
            const [lastDatabaseSuccess] = await db.promise().query("SELECT * FROM database_backup_reports WHERE status = 'success' ORDER BY completed_at DESC, id DESC LIMIT 1");
            const [integrity] = await db.promise().query('SELECT COUNT(*) AS total, SUM(u.id IS NULL) AS orphan_count, SUM(r.high_pressure < 50 OR r.high_pressure > 250 OR r.low_pressure < 30 OR r.low_pressure > 150 OR r.low_pressure >= r.high_pressure OR r.heartbeat < 30 OR r.heartbeat > 200) AS invalid_count FROM records r LEFT JOIN users u ON u.id = r.user_id');
            res.render('admin-activity', { logs: logs.slice(0, 50), hasNext: logs.length > 50, page, backups, databaseBackups, lastDatabaseSuccess: lastDatabaseSuccess[0] || null, integrity: integrity[0] || {}, pageTitle: '操作紀錄與系統狀態', pageDescription: '操作歷史與備份狀態。', activePage: 'activity', titleSuffix: process.env.TITLE_SUFFIX || '' });
        } catch (error) { next(error); }
    });

    router.post('/api/database-backups', async (req, res) => {
        try {
            const text = (value, max, label, required = true) => {
                if (typeof value !== 'string' || (required && !value.trim()) || value.trim().length > max) throw inputError(`${label}無效`);
                return value.trim();
            };
            const source = text(req.body.source, 100, '備份來源');
            const reference = text(req.body.reference || '', 250, '檔案或工作識別', req.body.status === 'success');
            const note = text(req.body.note || '', 1000, '備註', false);
            const checksum = req.body.checksum || '';
            if (!['success', 'failure'].includes(req.body.status)) throw inputError('備份結果無效');
            if (checksum && (typeof checksum !== 'string' || !/^[a-f0-9]{64}$/i.test(checksum))) throw inputError('checksum 必須為 SHA-256');
            if (req.body.status === 'failure' && !note) throw inputError('請填寫失敗原因');
            if (typeof req.body.completed_at !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(req.body.completed_at)) throw inputError('完成時間必須包含 UTC 時區');
            const completedAt = new Date(req.body.completed_at);
            if (Number.isNaN(completedAt.getTime()) || completedAt.toISOString() !== req.body.completed_at || completedAt.getTime() > Date.now() || completedAt.getUTCFullYear() < 2000) throw inputError('完成時間無效或晚於現在');
            await withTransaction(db, async connection => {
                await connection.query('INSERT INTO database_backup_reports (actor, source, completed_at, status, reference, checksum, note) VALUES (?, ?, ?, ?, ?, ?, ?)', [actor, source, completedAt, req.body.status, reference, checksum || null, note]);
                await writeAudit(connection, actor, 'database-backup.report', { count: 1, details: { source, completedAt, result: req.body.status, reference, checksum, note, reportedBy: '管理員回報' } });
            });
            res.status(201).json({ success: true });
        } catch (error) {
            await writeFailure(db, actor, 'database-backup.report', error);
            res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : '備份回報失敗，資料已回復' });
        }
    });

    router.post('/api/records/delete-preview', async (req, res) => {
        try {
            const ids = validateIds(req.body.ids);
            const [rows] = await db.promise().query('SELECT r.*, u.name AS user_name FROM records r LEFT JOIN users u ON u.id = r.user_id WHERE r.id IN (?) ORDER BY r.recorded_at DESC, r.id DESC', [ids]);
            if (rows.length !== ids.length) throw inputError('部分記錄不存在，請重新整理後再操作', 404);
            res.json({ records: rows, fingerprint: fingerprint(rows) });
        } catch (error) { res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : '無法取得刪除預覽' }); }
    });

    router.put('/api/records/:id', async (req, res) => {
        try {
            if (!validId(req.params.id)) throw inputError('記錄編號無效');
            const edit = validateRecordEdit(req.body);
            await withTransaction(db, async connection => {
                const [rows] = await connection.query('SELECT * FROM records WHERE id = ? FOR UPDATE', [req.params.id]);
                if (!rows.length) throw inputError('找不到記錄', 404);
                if (!req.body.expected_at || new Date(req.body.expected_at).getTime() !== new Date(rows[0].recorded_at).getTime()
                    || [req.body.expected_high, req.body.expected_low, req.body.expected_heart].some((value, index) => Number(value) !== Number([rows[0].high_pressure, rows[0].low_pressure, rows[0].heartbeat][index]))) throw inputError('記錄已變更，請重新整理後再編輯', 409);
                await connection.query('UPDATE records SET high_pressure = ?, low_pressure = ?, heartbeat = ?, recorded_at = ? WHERE id = ?', [edit.high, edit.low, edit.heart, edit.recordedAt, req.params.id]);
                await writeAudit(connection, actor, 'record.edit', { targetId: Number(req.params.id), count: 1, details: { reason: edit.reason, before: rows[0], after: { ...rows[0], high_pressure: edit.high, low_pressure: edit.low, heartbeat: edit.heart, recorded_at: edit.recordedAt } } });
            });
            res.json({ success: true });
        } catch (error) {
            await writeFailure(db, actor, 'record.edit', error, validId(req.params.id) ? Number(req.params.id) : null);
            res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : '修改失敗，資料已回復' });
        }
    });

    async function deleteRecords(req, res, single) {
        try {
            const ids = single ? [req.params.id] : req.body.ids;
            validateIds(ids);
            const reason = validateReason(req.body.reason);
            await withTransaction(db, async connection => {
                const [rows] = await connection.query('SELECT * FROM records WHERE id IN (?) FOR UPDATE', [ids]);
                if (rows.length !== ids.length) throw inputError('部分記錄不存在，請重新整理後再操作', 404);
                if (!single && req.body.fingerprint !== fingerprint(rows)) throw inputError('記錄已變更或尚未預覽，請重新檢查刪除明細', 409);
                await connection.query('DELETE FROM records WHERE id IN (?)', [ids]);
                await writeAudit(connection, actor, 'record.delete', { targetId: single ? Number(ids[0]) : null, count: rows.length, details: { reason, records: rows } });
            });
            res.json({ success: true, deleted: ids.length });
        } catch (error) {
            await writeFailure(db, actor, 'record.delete', error);
            res.status(error.statusCode || 500).json({ error: error.statusCode ? error.message : '刪除失敗，資料已回復' });
        }
    }
    router.delete('/api/records/:id', (req, res) => deleteRecords(req, res, true));
    router.post('/api/records/bulk-delete', (req, res) => deleteRecords(req, res, false));
    return router;
};
