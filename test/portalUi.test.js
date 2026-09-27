const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('首頁將標題與使用者卡片放在同一個置中內容區塊', () => {
    const template = fs.readFileSync('views/portal.ejs', 'utf8');
    const styles = fs.readFileSync('public/styles.css', 'utf8');
    assert.match(template, /class="portal-content"/);
    assert.match(styles, /\.portal-content \.user-grid/);
});

test('portal 記錄與統計查詢避免載入使用者全部記錄', () => {
    const router = fs.readFileSync('routes/portal.js', 'utf8');
    assert.match(router, /SELECT DISTINCT DATE_FORMAT\(recorded_at, '%Y-%m'\) AS record_month/);
    assert.doesNotMatch(router, /AS year_month/);
    assert.match(router, /recorded_at >= \? AND recorded_at < \?/);
    assert.match(router, /GROUP BY DATE\(recorded_at\)/);
    assert.match(router, /LIMIT 7/);
    assert.doesNotMatch(router, /SELECT \* FROM records WHERE user_id = \? ORDER BY recorded_at ASC/);
});
