function getBpStatus(record) {
    if (record.high_pressure >= 140 || record.low_pressure >= 90) {
        return { label: '偏高', className: 'high' };
    }
    if (record.high_pressure < 90 || record.low_pressure < 60) {
        return { label: '偏低', className: 'low' };
    }
    return { label: '正常', className: 'normal' };
}

function buildHealthOverview(records) {
    const latestRecord = records[records.length - 1];
    const latestStatus = getBpStatus(latestRecord);
    const recentRecords = records.slice(-7);
    const highCount = recentRecords.filter(record => getBpStatus(record).className === 'high').length;
    const lowCount = recentRecords.filter(record => getBpStatus(record).className === 'low').length;
    const recordedAt = new Date(latestRecord.recorded_at).toLocaleString('zh-HK', {
        month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit'
    });

    let recent = { message: `最近 ${recentRecords.length} 筆數值穩定`, className: 'normal' };
    if (highCount > 0) {
        recent = { message: `最近 ${recentRecords.length} 筆中有 ${highCount} 次偏高`, className: 'high' };
    } else if (lowCount > 0) {
        recent = { message: `最近 ${recentRecords.length} 筆中有 ${lowCount} 次偏低`, className: 'low' };
    }

    return {
        latest: {
            high: latestRecord.high_pressure,
            low: latestRecord.low_pressure,
            heart: latestRecord.heartbeat,
            recordedAt,
            ...latestStatus
        },
        recent
    };
}

module.exports = { buildHealthOverview };
