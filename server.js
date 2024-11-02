const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const { createObjectCsvWriter } = require('csv-writer');
const ejs = require('ejs');
const PDFDocument = require('pdfkit');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const moment = require('moment'); // Import moment.js
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'tracker_user', // replace with your MariaDB username
    password: 'lkw988667', // replace with your MariaDB password
    database: 'blood_pressure_tracker'
});

db.connect(err => {
    if (err) throw err;
    console.log('Connected to database');
});

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.set('view engine', 'ejs');
app.use(express.static('public'));

// Routes
app.get('/', (req, res) => {
    res.render('index');
});

app.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, record_time } = req.body;

    // Create a new date object based on the user input or default to now
    let recordedAt;
    if (record_date && record_time) {
        recordedAt = new Date(`${record_date}T${record_time}`);
    } else {
        recordedAt = new Date(); // Use current date and time
    }

    const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at) VALUES (?, ?, ?, ?)';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt], (err) => {
        if (err) throw err;
        res.redirect('/records');
    });
});

app.get('/records', (req, res) => {
    db.query('SELECT * FROM records ORDER BY recorded_at ASC', (err, results) => {
        if (err) throw err;

        // Format the date for each record
        const formattedRecords = results.map(record => {
            const date = new Date(record.recorded_at);
            const options = { year: 'numeric', month: 'long', day: 'numeric', hour: 'numeric', minute: 'numeric', hour12: true };
            const formattedDate = date.toLocaleString('zh-HK', options).replace(',', '');
            const [datePart, timePart] = formattedDate.split(' ');
            const ampm = date.getHours() >= 12 ? '下午' : '上午';

            return {
                ...record,
                formattedDate: `${datePart}${ampm}(${timePart})`
            };
        });

        res.render('records', { records: formattedRecords });
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

// Export to CSV
app.get('/export/csv', (req, res) => {
    const csvPath = path.join(__dirname, 'records.csv');
    const csvWriter = createObjectCsvWriter({
        path: csvPath,
        header: [
            { id: 'high_pressure', title: '高壓' },
            { id: 'low_pressure', title: '低壓' },
            { id: 'heartbeat', title: '心跳' },
            { id: 'recorded_at', title: '記錄時間' }
        ]
    });

    db.query('SELECT * FROM records', (err, results) => {
        if (err) throw err;

        // Write the CSV file
        csvWriter.writeRecords(results)
            .then(() => {
                // Add a UTF-8 BOM to the file
                fs.readFile(csvPath, 'utf8', (err, data) => {
                    if (err) throw err;
                    const bom = '\uFEFF'; // BOM for UTF-8
                    fs.writeFile(csvPath, bom + data, (err) => {
                        if (err) throw err;
                        // Download the CSV file
                        res.download(csvPath, 'records.csv', (err) => {
                            if (err) {
                                console.error('Error downloading the file:', err);
                            }
                        });
                    });
                });
            })
            .catch(err => {
                console.error('Error writing CSV:', err);
                res.status(500).send('Error generating CSV file');
            });
    });
});

// Export to PDF
app.get('/export/pdf', (req, res) => {
    const doc = new PDFDocument();
    const fileName = 'records.pdf';
    res.setHeader('Content-disposition', 'attachment; filename=' + fileName);
    res.setHeader('Content-type', 'application/pdf');
    doc.pipe(res);
    
    // Embed the custom font
    const fontPath = path.join(__dirname, 'fonts/NotoSansTC-Regular.ttf'); // Adjust the path accordingly
    doc.font(fontPath);
    
    // Title
    doc.fontSize(25).text('血壓記錄', { align: 'center' });
    doc.moveDown();

    // Table Header
    doc.fontSize(12).text('高壓     低壓     心跳           記錄時間', {
        align: 'center'
    });
    doc.moveDown();
    
    // Draw a line
    doc.moveTo(50, doc.y).lineTo(550, doc.y).stroke();
    doc.moveDown();

    // Query the database
    db.query('SELECT * FROM records', (err, results) => {
        if (err) {
            console.error('Database error:', err);
            res.status(500).send('Error fetching records');
            return;
        }

        // Add each record to the PDF
        results.forEach(record => {
            const formattedDate = moment(record.recorded_at).format('YYYY-MM-DD HH:mm:ss'); // Format date
            doc.text(`${record.high_pressure}     ${record.low_pressure}     ${record.heartbeat}           ${formattedDate}`, {
                align: 'center'
            });
        });

        // Finish the document
        doc.end();
    });
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
