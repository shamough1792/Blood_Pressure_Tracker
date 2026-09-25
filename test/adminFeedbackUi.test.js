const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('管理後台使用 toast 與確認 modal 取代原生 alert 和 confirm', () => {
    const script = fs.readFileSync('public/admin.js', 'utf8');
    const template = fs.readFileSync('views/admin-end.ejs', 'utf8');
    assert.doesNotMatch(script, /window\.(alert|confirm)\(/);
    assert.match(script, /function showToast/);
    assert.match(script, /function confirmAction/);
    assert.match(template, /id="adminToastRegion"/);
    assert.match(template, /id="confirmModal"/);
});

test('JSON 匯入確認按鈕與檢查按鈕保留間距', () => {
    const styles = fs.readFileSync('public/admin.css', 'utf8');
    const template = fs.readFileSync('views/admin-backup.ejs', 'utf8');
    const layout = fs.readFileSync('views/admin-start.ejs', 'utf8');
    assert.match(template, /class="admin-import-actions"/);
    assert.match(styles, /\.admin-import-actions\{display:grid;gap:14px\}/);
    assert.match(layout, /admin\.css\?v=<%= encodeURIComponent\(appVersion\) %>/);
});

test('管理總覽提供所有使用者及個別使用者統計選擇器', () => {
    const template = fs.readFileSync('views/admin.ejs', 'utf8');
    assert.match(template, /name="overviewUser"/);
    assert.match(template, /所有使用者/);
    assert.match(template, /overviewUsers\.forEach/);
    assert.match(template, /onchange="this\.form\.submit\(\)"/);
});

test('管理總覽以標題及容器區分整體、近期與管理工具', () => {
    const template = fs.readFileSync('views/admin.ejs', 'utf8');
    const styles = fs.readFileSync('public/admin.css', 'utf8');
    assert.match(template, /整體概況/);
    assert.match(template, /近期健康概覽/);
    assert.match(template, /管理工具/);
    assert.equal((template.match(/class="admin-dashboard-section/g) || []).length, 3);
    assert.match(styles, /\.admin-dashboard-section\{/);
    assert.match(styles, /\.admin-section-head\{/);
});
