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
    assert.match(template, /var isCurrentMonth = today\.getFullYear\(\) === year/);
    assert.match(template, /isToday \? 'today' : ''/);
});

test('月曆今日日期顯示文字提示', () => {
    const template = fs.readFileSync('views/records.ejs', 'utf8');
    assert.match(template, /class="cal-today-badge"/);
    assert.match(template, />今<\/span>/);
});

test('沒有記錄時提供清楚的空白狀態與新增入口', () => {
    const template = fs.readFileSync('views/records.ejs', 'utf8');
    const html = ejs.render(template, {
        userId: 1,
        userName: '王伯伯',
        titleSuffix: '',
        groupedRecords: {},
        selectedMonth: ''
    });

    assert.match(html, /尚未有血壓記錄/);
    assert.match(html, /href="\/bp\/1\?name=/);
});

test('管理後台血壓記錄提供多條件篩選欄位', async () => {
    const template = fs.readFileSync('views/admin-records.ejs', 'utf8');
    const html = await ejs.renderFile('views/admin-records.ejs', {
        users: [{ id: 1, name: '王伯伯', color: '#4CAF50' }],
        records: [{ id: 1, user_id: 1, high_pressure: 145, low_pressure: 92, heartbeat: 80, recorded_at: new Date('2026-09-24T10:00:00'), user_name: '王伯伯' }],
        recordsTotal: 1, recordsPage: 1, recordsPageSize: 50,
        recordFilters: { userId: '', from: '', to: '', status: '', sort: 'newest' },
        paginationItems: [1],
        summary: { totalRecords: 1, todayRecords: 1 },
        pageTitle: '血壓記錄', pageDescription: '', activePage: 'records', titleSuffix: '', appVersion: '2.8.7', csrfToken: 'token'
    });

    assert.match(template, /recordFromFilter/);
    assert.match(template, /recordToFilter/);
    assert.match(template, /recordStatusFilter/);
    assert.match(template, /recordFilterReset/);
    assert.match(html, /data-status="high"/);
});

test('管理後台分頁由伺服器輸出精簡頁碼與前後頁', async () => {
    const html = await ejs.renderFile('views/admin-records.ejs', {
        users: [], records: [], recordsTotal: 2050, recordsPage: 20, recordsPageSize: 50,
        recordFilters: { userId: '', from: '', to: '', status: '', sort: 'newest' },
        paginationItems: [1, 'ellipsis', 18, 19, 20, 21, 22, 'ellipsis', 41],
        summary: { totalRecords: 2050, todayRecords: 0 },
        pageTitle: '血壓記錄', pageDescription: '', activePage: 'records', titleSuffix: '', appVersion: '2.8.7', csrfToken: 'token'
    });

    assert.match(html, /aria-label="上一頁"/);
    assert.match(html, /aria-label="下一頁"/);
    assert.match(html, /aria-current="page"[^>]*>20<\/a>/);
    assert.equal((html.match(/admin-pagination-gap/g) || []).length, 2);
    assert.doesNotMatch(html, />17<\/a>/);
});
