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

test('管理側欄使用可跨平台的 SVG 圖示', () => {
    const layout = fs.readFileSync('views/admin-start.ejs', 'utf8');
    assert.match(layout, /class="admin-nav-icon"/);
    assert.doesNotMatch(layout, /<span aria-hidden="true">[▦♙◷▣]<\/span>/);
});

test('管理後台使用者列表提供手機卡片欄位標籤', () => {
    const template = fs.readFileSync('views/admin-users.ejs', 'utf8');
    const styles = fs.readFileSync('public/admin.css', 'utf8');
    assert.match(template, /data-label="記錄數"/);
    assert.match(template, /data-label="最近量測"/);
    assert.match(styles, /\.admin-user-table td::before/);
});

test('管理員登入錯誤顯示在欄位附近', () => {
    const template = fs.readFileSync('views/admin-login.ejs', 'utf8');
    const styles = fs.readFileSync('public/admin-login.css', 'utf8');
    assert.match(template, /login-field-error/);
    assert.match(template, /admin-login-field-invalid/);
    assert.match(styles, /\.admin-login-field-invalid input/);
});

test('管理後台表單錯誤顯示於欄位附近', () => {
    const script = fs.readFileSync('public/admin.js', 'utf8');
    const users = fs.readFileSync('views/admin-users.ejs', 'utf8');
    const styles = fs.readFileSync('public/admin.css', 'utf8');
    assert.match(script, /function showFieldError/);
    assert.match(script, /showFieldError\('newName'/);
    assert.match(script, /if \(!name\)/);
    assert.match(script, /請輸入使用者姓名/);
    assert.match(users, /id="addUserError"/);
    assert.match(users, /id="editUserError"/);
    assert.match(styles, /\.admin-field-invalid/);
});
