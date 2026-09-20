function buildRecordedAt(recordDate, timeOfDay, now = new Date()) {
    if (timeOfDay instanceof Date) {
        now = timeOfDay;
        timeOfDay = undefined;
    }
    let year = now.getFullYear();
    let month = now.getMonth();
    let day = now.getDate();

    if (typeof recordDate === 'string') {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(recordDate);
        if (match) {
            year = Number(match[1]);
            month = Number(match[2]) - 1;
            day = Number(match[3]);
        }
    }

    const hasPeriod = timeOfDay === 'AM' || timeOfDay === 'PM';
    const hour = hasPeriod ? (timeOfDay === 'PM' ? 23 : 11) : now.getHours();
    const minute = hasPeriod ? 59 : now.getMinutes();
    const second = hasPeriod ? 59 : now.getSeconds();

    return new Date(
        year,
        month,
        day,
        hour,
        minute,
        second,
        hasPeriod ? 999 : now.getMilliseconds()
    );
}

module.exports = { buildRecordedAt };
