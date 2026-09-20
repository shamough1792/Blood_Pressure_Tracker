const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('首頁將標題與使用者卡片放在同一個置中內容區塊', () => {
    const template = fs.readFileSync('views/portal.ejs', 'utf8');
    const styles = fs.readFileSync('public/styles.css', 'utf8');
    assert.match(template, /class="portal-content"/);
    assert.match(styles, /\.portal-content \.user-grid/);
});
