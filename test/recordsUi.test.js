const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ejs = require('ejs');

test('月曆日期格以早晚雙列呈現量測狀態', () => {
    const template = fs.readFileSync('views/records.ejs', 'utf8');
    const day = new Date('2026-08-18T08:00:00');
    const html = ejs.render(template, {
        userId: 1,
        userName: '王伯伯',
        titleSuffix: '',
        groupedRecords: {
            '2026-08': [{
                id: 1, user_id: 1, high_pressure: 125, low_pressure: 78, heartbeat: 70,
                recorded_at: day
            }]
        },
        selectedMonth: '2026-08',
        selectedDay: 18
    });

    assert.match(html, /period-marker period-am-normal/);
    assert.match(html, /period-marker period-pm-empty/);
    assert.match(html, />早<\/span>.*>✓<\/span>/s);
    assert.match(html, />晚<\/span>.*>—<\/span>/s);
});
