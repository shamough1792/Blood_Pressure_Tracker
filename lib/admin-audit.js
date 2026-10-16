async function writeAudit(connection, actor, action, { targetId = null, count = 0, status = 'success', details = {} } = {}) {
    await connection.query('INSERT INTO admin_audit_logs (actor, action, target_id, affected_count, status, details) VALUES (?, ?, ?, ?, ?, ?)', [actor, action, targetId, count, status, JSON.stringify(details)]);
}

async function writeFailure(db, actor, action, error, targetId = null) {
    try {
        await writeAudit(db.promise(), actor, action, { targetId, status: 'failure', details: { message: error.statusCode ? error.message : '操作失敗，未寫入資料' } });
    } catch (auditError) {
        console.error('寫入管理失敗紀錄失敗：', auditError.code || auditError.message);
    }
}

module.exports = { writeAudit, writeFailure };
