const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
require('dotenv').config();
require('./db'); // 啟動 DB 連線 + keepalive
const { createAdminAuth } = require('./middleware/adminAuth');

// 啟動時驗證管理後台認證設定，任一缺失即拒絕啟動
const adminAuth = createAdminAuth({
    username: process.env.ADMIN_USER,
    password: process.env.ADMIN_PASSWORD,
    sessionSecret: process.env.SESSION_SECRET
});

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
app.use(require('./routes/admin')(adminAuth));

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
