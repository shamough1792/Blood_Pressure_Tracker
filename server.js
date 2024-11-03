const express = require('express');
const bodyParser = require('body-parser');
const mysql = require('mysql2');
const { createObjectCsvWriter } = require('csv-writer');
const ejs = require('ejs');
const createCsvWriter = require('csv-writer').createObjectCsvWriter;
const path = require('path');
const fs = require('fs');

const app = express();
const port = 3000;

// Database connection
const db = mysql.createConnection({
    host: 'localhost',
    user: 'tracker_user', // replace with your MariaDB username
    password: 'Your_Password', // replace with your MariaDB password
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

// GET route for the index page
app.get('/', (req, res) => {
    res.render('index', { successMessage: null }); // Ensure successMessage is defined
});

// POST route to add a record
app.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, record_time } = req.body;

    let recordedAt;
    if (record_date && record_time) {
        recordedAt = new Date(`${record_date}T${record_time}`);
    } else {
        recordedAt = new Date(); // Use current date and time
    }

    const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at) VALUES (?, ?, ?, ?)';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt], (err) => {
        if (err) throw err;

        // Render the index page with a success message
        res.render('index', { successMessage: '血壓記錄已成功添加！' });
    });
});

// Ensure that the GET route for the index page also passes successMessage
app.get('/', (req, res) => {
    res.render('index', { successMessage: null }); // Ensure successMessage is defined
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

// Check the connection status every 5 minute
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
            // Output the result of SELECT 1
            console.log('Database connection is alive. Query result:', results);
        }
    });
}, 300000); // 5 minute

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
