// 測試專用資料庫替身；只模擬後台所需交易與查詢，不連線真實資料庫。
function createAdminFixture() {
    const state = {
        users: [{ id: 1, name: '王伯伯', color: '#4CAF50', created_at: new Date().toISOString() }],
        records: [{ id: 1, user_id: 1, high_pressure: 145, low_pressure: 92, heartbeat: 80, recorded_at: '2026-10-16T00:00:00.000Z' }],
        logs: [], backups: [], databaseBackups: [], failAudit: false, rollbackCount: 0
    };
    function run(sql, params = []) {
        if (sql.startsWith('INSERT INTO database_backup_reports')) { state.databaseBackups.push({ id: state.databaseBackups.length + 1, actor: params[0], source: params[1], completed_at: params[2], status: params[3], reference: params[4], checksum: params[5], note: params[6], created_at: new Date() }); return { affectedRows: 1 }; }
        if (sql.includes('FROM database_backup_reports')) return state.databaseBackups.filter(row => !sql.includes("WHERE status = 'success'") || row.status === 'success').slice().sort((a,b) => new Date(b.completed_at) - new Date(a.completed_at));
        if (sql.startsWith('SELECT r.*, u.name')) return state.records.filter(record => params[0].map(Number).includes(record.id)).map(record => ({ ...record, user_name: state.users.find(user => user.id === record.user_id)?.name }));
        if (sql.startsWith('SELECT 1 AS ready')) return [{ ready: 1 }];
        if (sql.startsWith('INSERT INTO admin_audit_logs')) {
            if (state.failAudit && params[4] === 'success') throw new Error('模擬稽核失敗');
            state.logs.push({ id: state.logs.length + 1, actor: params[0], action: params[1], target_id: params[2], affected_count: params[3], status: params[4], details: params[5], created_at: new Date().toISOString() });
            return { affectedRows: 1 };
        }
        if (sql.startsWith('INSERT INTO backup_logs')) { state.backups.push({ id: state.backups.length + 1, actor: params[0], format: params[1], record_count: params[2], user_count: params[3], checksum: params[4], created_at: new Date().toISOString() }); return { affectedRows: 1 }; }
        if (sql.includes('FROM backup_logs')) return state.backups.slice().reverse();
        if (sql.includes('FROM admin_audit_logs ORDER BY')) return state.logs.slice().reverse().slice(params[0], params[0] + 51);
        if (sql.includes('AS orphan_count')) return [{ total: state.records.length, orphan_count: 0, invalid_count: 0 }];
        if (sql.startsWith('SELECT * FROM records WHERE id IN')) return structuredClone(state.records.filter(record => params[0].map(Number).includes(record.id)));
        if (sql.startsWith('SELECT * FROM records WHERE id =')) return structuredClone(state.records.filter(record => record.id === Number(params[0])));
        if (sql.startsWith('UPDATE records SET')) { const record = state.records.find(record => record.id === Number(params[4])); Object.assign(record, { high_pressure: params[0], low_pressure: params[1], heartbeat: params[2], recorded_at: new Date(params[3]).toISOString() }); return { affectedRows: 1 }; }
        if (sql.startsWith('DELETE FROM records')) {
            const before = state.records.length;
            state.records = state.records.filter(record => sql.includes('user_id') ? record.user_id !== Number(params[0]) : !params[0].map(Number).includes(record.id));
            return { affectedRows: before - state.records.length };
        }
        if (sql.startsWith('SELECT high_pressure')) return structuredClone(state.records.filter(record => params[0].map(Number).includes(record.user_id)));
        if (sql.startsWith('SELECT id, high_pressure') || sql.startsWith('SELECT * FROM records ORDER')) return structuredClone(state.records);
        if (sql.startsWith('INSERT INTO records')) { state.records.push({ id: Math.max(0, ...state.records.map(record => record.id)) + 1, high_pressure: params[0], low_pressure: params[1], heartbeat: params[2], recorded_at: new Date(params[3]).toISOString(), user_id: params[4] }); return { affectedRows: 1 }; }
        if (sql.startsWith('SELECT id FROM users WHERE name')) return state.users.filter(user => user.name === params[0] && user.id !== Number(params[1]));
        if (sql.startsWith('SELECT id FROM users WHERE id')) return state.users.filter(user => user.id === Number(params[0]));
        if (sql.startsWith('SELECT * FROM users WHERE id')) return structuredClone(state.users.filter(user => user.id === Number(params[0])));
        if (sql.startsWith('SELECT id, name') || sql.startsWith('SELECT * FROM users ORDER')) return structuredClone(state.users);
        if (sql.startsWith('SELECT u.id')) return state.users.map(user => ({ ...user, record_count: state.records.filter(record => record.user_id === user.id).length, last_recorded_at: state.records.filter(record => record.user_id === user.id).at(-1)?.recorded_at || null }));
        if (sql.startsWith('INSERT INTO users')) { const id = Math.max(0, ...state.users.map(user => user.id)) + 1; state.users.push({ id, name: params[0], color: params[1] }); return { insertId: id }; }
        if (sql.startsWith('UPDATE users')) { Object.assign(state.users.find(user => user.id === Number(params[2])), { name: params[0], color: params[1] }); return { affectedRows: 1 }; }
        if (sql.startsWith('DELETE FROM users')) { state.users = state.users.filter(user => user.id !== Number(params[0])); return { affectedRows: 1 }; }
        if (sql.startsWith('SELECT COUNT(*) AS total_records')) return [{ total_records: state.records.length, today_records: 1 }];
        if (sql.startsWith('SELECT COUNT(*) AS total FROM records')) return [{ total: state.records.length }];
        if (sql.startsWith('SELECT r.')) return state.records.map(record => ({ ...record, user_name: state.users.find(user => user.id === record.user_id)?.name, modified_at: null }));
        throw new Error('未處理的測試查詢：' + sql);
    }
    const promise = { query: async (sql, params) => [run(sql, params)], async getConnection() {
        let snapshot;
        return {
            query: promise.query,
            async beginTransaction() { snapshot = structuredClone({ users: state.users, records: state.records, logs: state.logs, backups: state.backups, databaseBackups: state.databaseBackups }); },
            async commit() {},
            async rollback() { Object.assign(state, snapshot); state.rollbackCount++; },
            release() {}
        };
    } };
    return { state, db: { promise: () => promise, query(sql, params, callback) { if (typeof params === 'function') { callback = params; params = []; } try { callback(null, run(sql, params)); } catch (error) { callback(error); } } } };
}
module.exports = { createAdminFixture };
