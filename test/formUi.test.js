const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

test('新增記錄表單提供可讀的欄位錯誤提示容器', () => {
    const template = fs.readFileSync('views/index.ejs', 'utf8');
    assert.match(template, /class="field-error"/);
    assert.match(template, /aria-live="polite"/);
    assert.match(template, /function showFieldError/);
    assert.match(template, /<select id="editPeriod"/);
    assert.match(template, /historical-period/);
    assert.match(template, /selectedPeriod \|\| \(new Date\(\)\.getHours\(\) >= 12 \? 'PM' : 'AM'\)/);
    assert.match(template, /id="formError"/);
    assert.match(template, /function showFormError/);
    assert.doesNotMatch(template, /alert\('請在瀏覽器選單中選擇/);
});

test('修改記錄表單使用欄位錯誤提示而非原生警告', () => {
    const template = fs.readFileSync('views/modify.ejs', 'utf8');
    const styles = fs.readFileSync('public/styles.css', 'utf8');
    assert.match(template, /class="field-error"/);
    assert.match(template, /novalidate/);
    assert.match(template, /function showModifyError/);
    assert.match(styles, /\.form-control-error/);
});
