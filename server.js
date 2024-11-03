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

// GET route for the index page
app.get('/', (req, res) => {
    res.render('index', { successMessage: null }); // Ensure successMessage is defined
});

app.post('/add', (req, res) => {
    const { high_pressure, low_pressure, heartbeat, record_date, record_time } = req.body;

    let recordedAt;

    // If custom date and time are provided, use them
    if (record_date && record_time) {
        recordedAt = new Date(`${record_date}T${record_time}`);
    } else {
        // If not, use the current date and time
        recordedAt = new Date();
    }

    // Debugging: Log the received values
    console.log('Received data:', { high_pressure, low_pressure, heartbeat, record_date, record_time });
    console.log('Recorded At:', recordedAt.toISOString());

    const query = 'INSERT INTO records (high_pressure, low_pressure, heartbeat, recorded_at) VALUES (?, ?, ?, ?)';
    db.query(query, [high_pressure, low_pressure, heartbeat, recordedAt], (err) => {
        if (err) {
            console.error('Error inserting record:', err);
            return res.status(500).send('Error adding record');
        }

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

        // Group records by year and month
        const groupedRecords = results.reduce((acc, record) => {
            const date = new Date(record.recorded_at);
            const yearMonth = `${date.getFullYear()}-${date.getMonth() + 1}`; // Format: YYYY-MM

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

        res.render('records', { groupedRecords });
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

    // Query the records ordered by recorded_at in ascending order
    db.query('SELECT * FROM records ORDER BY recorded_at ASC', (err, results) => {
        if (err) throw err;

        // Format the recorded_at field for each record
        const formattedRecords = results.map(record => ({
            high_pressure: record.high_pressure,
            low_pressure: record.low_pressure,
            heartbeat: record.heartbeat,
            recorded_at: formatDate(new Date(record.recorded_at)) // Format the date
        }));

        // Write the formatted records to the CSV file
        csvWriter.writeRecords(formattedRecords)
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
