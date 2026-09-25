function parsePositiveId(value) {
    if (!/^\d+$/.test(String(value))) return null;
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function recordOwnerWhere(recordId, userId) {
    const record = parsePositiveId(recordId);
    const user = parsePositiveId(userId);
    if (!record || !user) return null;
    return { clause: 'id = ? AND user_id = ?', params: [record, user] };
}

module.exports = { parsePositiveId, recordOwnerWhere };
