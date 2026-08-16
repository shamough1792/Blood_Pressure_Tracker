const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
require('./db'); // 啟動 DB 連線 + keepalive

const app = express();
const port = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.set('view engine', 'ejs');
app.use(express.static('public'));
app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 } })); // 匯入檔上限 10MB

// Routes
app.use(require('./routes/portal'));
app.use(require('./routes/records'));
app.use(require('./routes/admin'));

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
