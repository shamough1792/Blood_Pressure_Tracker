const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ejs = require('ejs');

test('統計頁在圖表前呈現最新量測與近期狀態', () => {
    const template = fs.readFileSync('views/stats.ejs', 'utf8');
    const html = ejs.render(template, {
        userId: 1,
        userName: '王伯伯',
        titleSuffix: '',
        range: 6,
        stats: { total: 2, avgHigh: 126, avgLow: 78, avgHeart: 68, normalRate: 50, highCount: 1, lowCount: 0 },
        chartData: [],
        healthOverview: {
            latest: { high: 128, low: 80, heart: 70, label: '正常', className: 'normal', recordedAt: '今天上午' },
            recent: { message: '最近 7 筆中有 1 次偏高', className: 'high' }
        }
    });

    assert.match(html, /最新量測/);
    assert.match(html, /近期狀態/);
    assert.match(html, /128/);
    assert.match(html, /最近 7 筆中有 1 次偏高/);
});
