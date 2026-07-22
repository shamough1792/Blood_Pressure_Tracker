const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');
const fileUpload = require('express-fileupload');

const app = express();
const port = process.env.PORT || 3000;

// Database connection
const db = mysql.createConnection({
    host: process.env.DB_HOST || '192.168.1.222',
    user: process.env.DB_USER || 'tracker_user',
    password: process.env.DB_PASSWORD || '!Lkw988667',
    database: process.env.DB_NAME || 'blood_test'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to database');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(fileUpload());

// 使用者選擇頁
app.get('/', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, users) => {
        if (err) throw err;
        res.render('portal', { users, titleSuffix: process.env.TITLE_SUFFIX || '' });
    });
});

// 血壓記錄頁
app.get('/bp/:userId', (req, res) => {
    const userId = req.params.userId;
    db.query('SELECT name FROM users WHERE id = ?', [userId], (err, users) => {
        if (err || !users.length) return res.redirect('/');
        res.render('index', {
            successMessage: null,
            titleSuffix: process.env.TITLE_SUFFIX || '',
            userId,
            userName: users[0].name
        });
    });
});

// 管理後台
app.get('/admin', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, users) => {
        if (err) throw err;
        res.render('admin', { users, titleSuffix: process.env.TITLE_SUFFIX || '' });
    });
});

// API: 取得使用者列表
app.get('/api/users', (req, res) => {
    db.query('SELECT * FROM users ORDER BY id ASC', (err, results) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json(results);
    });
});

// API: 新增使用者
app.post('/api/users', (req, res) => {
    const { name, color } = req.body;
    if (!name) return res.status(400).json({ error: '請輸入名稱' });
    db.query('INSERT INTO users (name, color) VALUES (?, ?)', [name, color || '#4CAF50'], (err, result) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ id: result.insertId, name, color: color || '#4CAF50' });
    });
});

// API: 刪除使用者（連同記錄）
app.delete('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    db.query('DELETE FROM records WHERE user_id = ?', [userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
            if (err) return res.status(500).json({ error: err.message });
            res.json({ success: true });
        });
    });
});

// API: 編輯使用者
app.put('/api/users/:id', (req, res) => {
    const userId = req.params.id;
    const { name, color } = req.body;
    db.query('UPDATE users SET name = ?, color = ? WHERE id = ?', [name, color, userId], (err) => {
        if (err) return res.status(500).json({ error: err.message });
        res.json({ success: true });
    });
});

// API: 匯入 SQL
app.post('/api/import-sql', async (req, res) => {
    const { user_id } = req.body;
    if (!req.files || !req.files.sqlFile) {
        return res.status(400).send('請上傳 SQL 檔案');
    }
    const sqlContent = req.files.sqlFile.data.toString('utf8');

    // 解析所有 VALUES 並組裝成參數陣列
    const insertRegex = /INSERT\s+INTO\s+`?records`?\s*(?:\([^)]*\))?\s*VALUES\s*(.*?);/gis;
    const rows = [];
    let match;
    while ((match = insertRegex.exec(sqlContent)) !== null) {
        const valuesBlock = match[1];
        const valueRegex = /\(([^)]+)\)/g;
        let vMatch;
        while ((vMatch = valueRegex.exec(valuesBlock)) !== null) {
            const parts = vMatch[1].split(',').map(s => s.trim().replace(/^'|'$/g, ''));
            if (parts.length >= 4) {
                const high = parseInt(parts[parts.length - 4]) || 0;
                const low = parseInt(parts[parts.length - 3]) || 0;
                const heart = parseInt(parts[parts.length - 2]) || 0;
                const ts = ['current_timestamp()', 'CURRENT_TIMESTAMP'].includes(parts[parts.length - 1])
                    ? new Date() : new Date(parts[parts.length - 1]);
                rows.push([high, low, heart, ts, parseInt(user_id) || 1]);
            }
        }
    }

    if (rows.length === 0) return res.send('找不到可匯入的記錄');

    // 批次匯入（使用 Promise.all 確保全部完成才回應）
    const results = await Promise.allSettled(
        rows.map(row =>
            new Promise((resolve, reject) => {
                db.query('INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)', row, (err) => {
                    if (err) reject(err);
                    else resolve();
                });
            })
        )
    );

    const success = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    res.send(`匯入完成：成功 ${success} 筆，失敗 ${failed} 筆`);
});

app.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day, user_id } = req.body;

    // Auto-detect date and time if not provided (elderly-friendly mode)
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const date = record_date || `${y}-${mo}-${d}`;
    const hour = now.getHours();
    const isPM = time_of_day === 'PM' || (time_of_day !== 'AM' && hour >= 12);
    const recordedAt = isPM
        ? new Date(`${date}T20:00:00`)
        : new Date(`${date}T08:00:00`);

    const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at, user_id) VALUES (?, ?, ?, ?, ?)';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt, user_id || 1], (err) => {
        if (err) {
            console.error('Error inserting record:', err);
            return res.status(500).send('Error adding record');
        }
        db.query('SELECT name FROM users WHERE id = ?', [user_id || 1], (err2, users) => {
            const userName = users && users.length ? users[0].name : '';
            res.render('index', { successMessage: '血壓記錄已成功添加！', titleSuffix: process.env.TITLE_SUFFIX || '', userId: user_id || 1, userName });
        });
    });
});

app.get('/records', (req, res) => {
    const userId = req.query.userId || 1;
    db.query('SELECT * FROM records WHERE user_id = ? ORDER BY recorded_at DESC', [userId], (err, results) => {
        if (err) throw err;

        // Group records by year and month
        const groupedRecords = results.reduce((acc, record) => {
            const date = new Date(record.recorded_at);
            const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

            if (!acc[yearMonth]) {
                acc[yearMonth] = [];
            }
            acc[yearMonth].push({
                ...record,
                formattedDate: date.toLocaleDateString('zh-HK', {
                    year: 'numeric', month: 'long', day: 'numeric'
                }) + ' ' + (date.getHours() < 12 ? '上午' : '下午')
            });
            return acc;
        }, {});

        const selectedMonth = req.query.yearMonth || (Object.keys(groupedRecords).length ? Object.keys(groupedRecords)[0] : null);
        const userName = req.query.name || '';
        res.render('records', { groupedRecords, selectedMonth, titleSuffix: process.env.TITLE_SUFFIX || '', userId, userName });
    });
});

// Route to display the modification form
app.get('/modify/:id', (req, res) => {
    const recordId = req.params.id;
    db.query('SELECT * FROM records WHERE id = ?', [recordId], (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).send('Database error');
        }
        if (results.length === 0) {
            return res.status(404).send('Record not found');
        }

        const record = results[0];
        res.render('modify', { record, titleSuffix: process.env.TITLE_SUFFIX || '', userId: req.query.userId || 1 });
    });
});

// Route to handle the form submission
app.post('/update/:id', (req, res) => {
    const recordId = req.params.id;
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day } = req.body;

    // Auto-detect date and time if not provided
    const now = new Date();
    const y = now.getFullYear();
    const mo = String(now.getMonth() + 1).padStart(2, '0');
    const d = String(now.getDate()).padStart(2, '0');
    const date = record_date || `${y}-${mo}-${d}`;
    const hour = now.getHours();
    const isPM = time_of_day === 'PM' || (time_of_day !== 'AM' && hour >= 12);
    const recordedAt = isPM
        ? new Date(`${date}T20:00:00`)
        : new Date(`${date}T08:00:00`);

    const query = 'UPDATE records SET high_pressure = ?, low_pressure = ?, heartbeat = ?, recorded_at = ? WHERE id = ?';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt, recordId], (err) => {
        if (err) {
            console.error('Error updating record:', err);
            return res.status(500).send('Error updating record');
        }
        res.redirect('/records?userId=' + (req.query.userId || 1));
    });
});

// Delete a record
app.post('/delete/:id', (req, res) => {
    const recordId = req.params.id;
    const query = 'DELETE FROM records WHERE id = ?';
    db.query(query, [recordId], (err) => {
        if (err) throw err;
        res.redirect('/records?userId=' + (req.body.userId || 1));
    });
});

// Function to format the date
function formatDate(date) {
    const options = {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        weekday: 'long',
        hour: 'numeric',
        minute: 'numeric',
        hour12: true,
    };

    const formattedDate = date.toLocaleString('zh-HK', options);
    return formattedDate.replace(',', ''); // Remove the comma between date and time
}

// Function to format the date and time for the filename
function formatDateForFilename(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0'); // Months are zero-based
    const day = String(date.getDate()).padStart(2, '0');
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${year}年${month}月${day}日_${hours}時${minutes}分`;
}

// Export to Excel
app.get('/export/excel', (req, res) => {
    const userId = req.query.userId || 1;
    db.query('SELECT * FROM records WHERE user_id = ? ORDER BY recorded_at ASC', [userId], async (err, results) => {
        if (err) throw err;

        if (results.length === 0) {
            return res.send(`
                <script>
                    alert('沒有記錄可供匯出');
                    window.history.back();
                </script>
            `);
        }

        // Helper to get BP color
        function getBpColor(hp, lp) {
            if (hp >= 140 || lp >= 90) return 'FFCDD2'; // red
            return 'C8E6C9';  // green
        }

        // Group records by year-month, then by day and period
        const months = {};
        results.forEach(record => {
            const d = new Date(record.recorded_at);
            const ym = `${d.getFullYear()}年${d.getMonth() + 1}月`;
            const day = d.getDate();
            const period = d.getHours() < 12 ? '早' : '晚';

            if (!months[ym]) months[ym] = {};
            if (!months[ym][day]) months[ym][day] = {};
            months[ym][day][period] = {
                high: record.high_pressure,
                low: record.low_pressure,
                heart: record.heartbeat
            };
        });

        const workbook = new ExcelJS.Workbook();

        Object.keys(months).sort((a, b) => {
            const [ya, ma] = a.replace('年', '-').replace('月', '').split('-');
            const [yb, mb] = b.replace('年', '-').replace('月', '').split('-');
            return ya - yb || ma - mb;
        }).forEach(month => {
            const sheet = workbook.addWorksheet(month);
            const data = months[month];

            // Column widths
            for (let c = 1; c <= 11; c++) sheet.getColumn(c).width = 7;
            sheet.getColumn(1).width = 5;
            sheet.getColumn(2).width = 5;
            sheet.getColumn(6).width = 3;   // gap
            sheet.getColumn(7).width = 5;
            sheet.getColumn(8).width = 5;
            sheet.getColumn(6).width = 5;

            // Row 1: Title (merged A-K)
            sheet.mergeCells('A1:K2');
            const titleRow = sheet.getRow(1);
            titleRow.getCell(1).value = '血壓記錄表' + (process.env.TITLE_SUFFIX ? ' (' + process.env.TITLE_SUFFIX + ')' : '');
            titleRow.getCell(1).font = { bold: true, size: 16 };
            titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            titleRow.height = 36;

            // Row 3: Month
            sheet.mergeCells('A3:K3');
            const monthRow = sheet.getRow(3);
            monthRow.getCell(1).value = `(${month}) 月份`;
            monthRow.getCell(1).font = { bold: true, size: 12 };
            monthRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

            // Thin border
            const thinBorder = {
                top: { style: 'thin' }, bottom: { style: 'thin' },
                left: { style: 'thin' }, right: { style: 'thin' }
            };

            // Row 4: Headers (11 cols: A-K)
            const headerRow = sheet.getRow(4);
            const hdrs = ['', '時間', '上壓', '下壓', '心跳', '', '', '時間', '上壓', '下壓', '心跳'];
            for (let i = 0; i < 11; i++) {
                const cell = headerRow.getCell(i + 1);
                cell.value = hdrs[i];
                cell.font = { bold: true, size: 10 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                if (i !== 5) cell.border = thinBorder;
            }
            headerRow.height = 22;

            // Data rows: 11 cols [dayL, time, 上, 下, 心, gap, dayR, time, 上, 下, 心]
            let startRow = 5;
            for (let ld = 1; ld <= 16; ld++) {
                const rd = ld + 16;

                // --- 早 row ---
                const rowE = sheet.getRow(startRow);
                const vE = ['', '', '', '', '', '', '', '', '', '', ''];
                vE[0] = `${ld}號`;
                vE[1] = '早';
                vE[6] = rd <= 31 ? `${rd}號` : '';
                vE[7] = rd <= 31 ? '早' : '';

                if (data[ld] && data[ld]['早']) {
                    vE[2] = data[ld]['早'].high;
                    vE[3] = data[ld]['早'].low;
                    vE[4] = data[ld]['早'].heart;
                }
                if (rd <= 31 && data[rd] && data[rd]['早']) {
                    vE[8] = data[rd]['早'].high;
                    vE[9] = data[rd]['早'].low;
                    vE[10] = data[rd]['早'].heart;
                }

                for (let i = 0; i < 11; i++) {
                    const cell = rowE.getCell(i + 1);
                    cell.value = vE[i];
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.font = { size: 10 };
                    if (i !== 5) cell.border = thinBorder;
                }

                if (data[ld] && data[ld]['早']) {
                    const c = getBpColor(data[ld]['早'].high, data[ld]['早'].low);
                    rowE.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowE.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                if (rd <= 31 && data[rd] && data[rd]['早']) {
                    const c = getBpColor(data[rd]['早'].high, data[rd]['早'].low);
                    rowE.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowE.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                rowE.height = 20;

                // --- 晚 row ---
                const rowL = sheet.getRow(startRow + 1);
                const vL = ['', '', '', '', '', '', '', '', '', '', ''];
                vL[0] = `${ld}號`;
                vL[1] = '晚';
                vL[6] = rd <= 31 ? `${rd}號` : '';
                vL[7] = rd <= 31 ? '晚' : '';

                if (data[ld] && data[ld]['晚']) {
                    vL[2] = data[ld]['晚'].high;
                    vL[3] = data[ld]['晚'].low;
                    vL[4] = data[ld]['晚'].heart;
                }
                if (rd <= 31 && data[rd] && data[rd]['晚']) {
                    vL[8] = data[rd]['晚'].high;
                    vL[9] = data[rd]['晚'].low;
                    vL[10] = data[rd]['晚'].heart;
                }

                for (let i = 0; i < 11; i++) {
                    const cell = rowL.getCell(i + 1);
                    cell.value = vL[i];
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.font = { size: 10 };
                    if (i !== 5) cell.border = thinBorder;
                }

                if (data[ld] && data[ld]['晚']) {
                    const c = getBpColor(data[ld]['晚'].high, data[ld]['晚'].low);
                    rowL.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowL.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                if (rd <= 31 && data[rd] && data[rd]['晚']) {
                    const c = getBpColor(data[rd]['晚'].high, data[rd]['晚'].low);
                    rowL.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowL.getCell(10).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                rowL.height = 20;

                // Merge day number cells vertically
                sheet.mergeCells(`A${startRow}:A${startRow + 1}`);
                if (rd <= 31) {
                    sheet.mergeCells(`G${startRow}:G${startRow + 1}`);
                }

                // Separator row between days
                const sepRow = sheet.getRow(startRow + 2);
                sepRow.height = 6;
                startRow += 3;
            }
        });

        // Write file
        const today = new Date();
        const formattedDate = formatDateForFilename(today);
        const excelFilename = `血壓記錄${process.env.TITLE_SUFFIX ? '(' + process.env.TITLE_SUFFIX + ')' : ''}_${formattedDate}.xlsx`;
        const excelPath = path.join(__dirname, excelFilename);

        try {
            await workbook.xlsx.writeFile(excelPath);
            res.download(excelPath, excelFilename, (err) => {
                if (err) console.error('Error downloading the file:', err);
                fs.unlink(excelPath, () => {});
            });
        } catch (writeErr) {
            console.error('Error writing Excel file:', writeErr);
            res.status(500).send('匯出 Excel 失敗');
        }
    });
});

// Check the connection status every 10 minutes
setInterval(() => {
    db.query('SELECT 1', (err, results) => {
        if (err) {
            console.error('Database connection lost, reconnecting:', err);
            db.connect((err) => {
                if (err) {
                    console.error('Error reconnecting to database:', err);
                } else {
                    console.log('Reconnected to database');
                }
            });
        } else {
            console.log('Database connection is alive. Query result:', results);
        }
    });
}, 600000); // 10 minutes

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
