const express = require('express');
const bodyParser = require('body-parser');
const fileUpload = require('express-fileupload');
const defaultDb = require('./db');
const { createAdminAuth } = require('./middleware/adminAuth');
const { createErrorHandler } = require('./middleware/errorHandler');

function createApp(options = {}) {
    const db = options.db || defaultDb;
    const adminAuth = options.adminAuth || createAdminAuth({
        username: process.env.ADMIN_USER,
        password: process.env.ADMIN_PASSWORD,
        sessionSecret: process.env.SESSION_SECRET
    });
    const app = express();
    app.use(bodyParser.urlencoded({ extended: true }));
    app.use(bodyParser.json());
    app.set('view engine', 'ejs');
    app.use(express.static('public'));
    app.use(fileUpload({ limits: { fileSize: 10 * 1024 * 1024 }, abortOnLimit: true }));
    app.use(require('./routes/health')(db));
    app.use(require('./routes/portal')(db));
    app.use(require('./routes/records')(db));
    app.use(require('./routes/admin')(adminAuth, db));
    app.use((req, res) => res.status(404).send('找不到頁面'));
    app.use(createErrorHandler());
    return app;
}

module.exports = { createApp };
