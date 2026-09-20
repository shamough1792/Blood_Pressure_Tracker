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
});
