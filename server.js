const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const ejs = require('ejs');
const path = require('path');
const fs = require('fs');
const ExcelJS = require('exceljs');

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
app.set('view engine', 'ejs');
app.use(express.static('public'));

// GET route for the index page
app.get('/', (req, res) => {
    res.render('index', { successMessage: null, titleSuffix: process.env.TITLE_SUFFIX || '' });
});

app.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, time_of_day } = req.body;

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

    const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at) VALUES (?, ?, ?, ?)';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt], (err) => {
        if (err) {
            console.error('Error inserting record:', err);
            return res.status(500).send('Error adding record');
        }
        res.render('index', { successMessage: '血壓記錄已成功添加！', titleSuffix: process.env.TITLE_SUFFIX || '' });
    });
});

app.get('/records', (req, res) => {
    db.query('SELECT * FROM records ORDER BY recorded_at DESC', (err, results) => {
        if (err) throw err;

        // Group records by year and month
        const groupedRecords = results.reduce((acc, record) => {
            const date = new Date(record.recorded_at);
            const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`; // Format: YYYY-MM

            if (!acc[yearMonth]) {
                acc[yearMonth] = [];
            }
            acc[yearMonth].push({
                ...record,
                formattedDate: date.toLocaleString('zh-HK', {
                    year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true
                }).replace(',', '')
            });
            return acc;
        }, {});

        // Get the selected month from the query parameter or default to the latest month
        const selectedMonth = req.query.yearMonth || (Object.keys(groupedRecords).length ? Object.keys(groupedRecords)[0] : null);

        // Pass groupedRecords and selectedMonth to the view
        res.render('records', { groupedRecords, selectedMonth, titleSuffix: process.env.TITLE_SUFFIX || '' });
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
        res.render('modify', { record, titleSuffix: process.env.TITLE_SUFFIX || '' });
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
        res.redirect('/records');
    });
});

// Delete a record
app.post('/delete/:id', (req, res) => {
    const recordId = req.params.id;
    const query = 'DELETE FROM records WHERE id = ?';
    db.query(query, [recordId], (err) => {
        if (err) throw err;
        res.redirect('/records');
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
    db.query('SELECT * FROM records ORDER BY recorded_at ASC', async (err, results) => {
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
            if (hp < 120 && lp < 80) return 'C8E6C9';  // green
            return 'FFF9C4'; // yellow
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

            // Column widths A-I
            for (let c = 1; c <= 11; c++) sheet.getColumn(c).width = 7;
            sheet.getColumn(1).width = 5;  // day
            sheet.getColumn(2).width = 5;  // time
            sheet.getColumn(6).width = 5;  // right day
            sheet.getColumn(7).width = 5;  // right time

            // Row 1-2: Title
            sheet.mergeCells('A1:K2');
            const titleRow = sheet.getRow(1);
            titleRow.getCell(1).value = '血壓記錄表';
            titleRow.getCell(1).font = { bold: true, size: 16 };
            titleRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };
            titleRow.height = 36;

            // Row 3: Month
            sheet.mergeCells('A3:K3');
            const monthRow = sheet.getRow(3);
            monthRow.getCell(1).value = `(${month}) 月份`;
            monthRow.getCell(1).font = { bold: true, size: 12 };
            monthRow.getCell(1).alignment = { horizontal: 'center', vertical: 'middle' };

            // Thin border style
            const thinBorder = {
                top: { style: 'thin' },
                bottom: { style: 'thin' },
                left: { style: 'thin' },
                right: { style: 'thin' }
            };

            // Row 4: Headers
            const headerRow = sheet.getRow(4);
            const hdrs = ['', '時間', '上壓', '下壓', '心跳', '', '時間', '上壓', '下壓'];
            for (let i = 0; i < 9; i++) {
                const cell = headerRow.getCell(i + 1);
                cell.value = hdrs[i];
                cell.font = { bold: true, size: 10 };
                cell.alignment = { horizontal: 'center', vertical: 'middle' };
                cell.border = thinBorder;
            }
            headerRow.height = 22;

            // Data rows: days 1-15 (left) + 16-31 (right), each with 早/晚
            let rowNum = 5;
            for (let ld = 1; ld <= 15; ld++) {
                const rd = ld + 15;

                // 早 row
                const rowE = sheet.getRow(rowNum);
                const valsE = ['', '', '', '', '', '', '', '', ''];
                valsE[0] = `${ld}號`;
                valsE[1] = '早';  // always show
                if (rd <= 31) {
                    valsE[5] = `${rd}號`;
                    valsE[6] = '早';  // always show
                }

                if (data[ld] && data[ld]['早']) {
                    valsE[2] = data[ld]['早'].high;
                    valsE[3] = data[ld]['早'].low;
                    valsE[4] = data[ld]['早'].heart;
                }
                if (rd <= 31 && data[rd] && data[rd]['早']) {
                    valsE[7] = data[rd]['早'].high;
                    valsE[8] = data[rd]['早'].low;
                }

                for (let i = 0; i < 9; i++) {
                    const cell = rowE.getCell(i + 1);
                    cell.value = valsE[i];
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.font = { size: 10 };
                    cell.border = thinBorder;
                }

                // Color left BP
                if (data[ld] && data[ld]['早']) {
                    const c = getBpColor(data[ld]['早'].high, data[ld]['早'].low);
                    rowE.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowE.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                // Color right BP
                if (rd <= 31 && data[rd] && data[rd]['早']) {
                    const c = getBpColor(data[rd]['早'].high, data[rd]['早'].low);
                    rowE.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowE.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                rowE.height = 20;
                rowNum++;

                // 晚 row
                const rowL = sheet.getRow(rowNum);
                const valsL = ['', '', '', '', '', '', '', '', ''];
                valsL[0] = `${ld}號`;
                valsL[1] = '晚';  // always show
                if (rd <= 31) {
                    valsL[5] = `${rd}號`;
                    valsL[6] = '晚';  // always show
                }

                if (data[ld] && data[ld]['晚']) {
                    valsL[2] = data[ld]['晚'].high;
                    valsL[3] = data[ld]['晚'].low;
                    valsL[4] = data[ld]['晚'].heart;
                }
                if (rd <= 31 && data[rd] && data[rd]['晚']) {
                    valsL[7] = data[rd]['晚'].high;
                    valsL[8] = data[rd]['晚'].low;
                }

                for (let i = 0; i < 9; i++) {
                    const cell = rowL.getCell(i + 1);
                    cell.value = valsL[i];
                    cell.alignment = { horizontal: 'center', vertical: 'middle' };
                    cell.font = { size: 10 };
                    cell.border = thinBorder;
                }

                if (data[ld] && data[ld]['晚']) {
                    const c = getBpColor(data[ld]['晚'].high, data[ld]['晚'].low);
                    rowL.getCell(3).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowL.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                if (rd <= 31 && data[rd] && data[rd]['晚']) {
                    const c = getBpColor(data[rd]['晚'].high, data[rd]['晚'].low);
                    rowL.getCell(8).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                    rowL.getCell(9).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: c } };
                }
                rowL.height = 20;
                rowNum++;
            }
        });

        // Write file
        const today = new Date();
        const formattedDate = formatDateForFilename(today);
        const excelFilename = `血壓記錄_${formattedDate}.xlsx`;
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
