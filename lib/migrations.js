const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');

// 僅支援一般 migration SQL；程序／trigger 請以獨立升級程式處理。
function splitSql(source) {
    if (/^\s*DELIMITER\b/im.test(source)) throw new Error('自動升級不支援 DELIMITER');
    const statements = [];
    let start = 0, quote = null, comment = null, hasSql = false;
    for (let i = 0; i < source.length; i++) {
        const c = source[i], next = source[i + 1];
        if (comment === 'line') { if (c === '\n') comment = null; continue; }
        if (comment === 'block') { if (c === '*' && next === '/') { comment = null; i++; } continue; }
        if (quote) {
            if (c === '\\') { i++; continue; }
            if (c === quote) { if (next === quote) i++; else quote = null; }
            continue;
        }
        if ((c === '-' && next === '-' && /\s/.test(source[i + 2] || ' ')) || c === '#') { comment = 'line'; continue; }
        if (c === '/' && next === '*') { if (source[i + 2] === '!' || source.slice(i + 2, i + 4) === 'M!') hasSql = true; comment = 'block'; i++; continue; }
        if (["'", '"', '`'].includes(c)) { quote = c; hasSql = true; continue; }
        if (c === ';') { if (hasSql) statements.push(source.slice(start, i).trim()); start = i + 1; hasSql = false; }
        else if (!/\s/.test(c)) hasSql = true;
    }
    if (quote || comment === 'block') throw new Error('SQL 字串或註解未結束');
    const tail = source.slice(start).trim();
    if (hasSql && tail) statements.push(tail);
    return statements;
}

async function applyLegacy(connection, name) {
    const [tables] = await connection.query("SELECT TABLE_NAME AS name FROM information_schema.TABLES WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME IN ('users','records')");
    const exists = table => tables.some(row => row.name === table);
    if (!exists('records')) throw new Error('找不到 records，請先匯入 mariadb/init.sql 初始化資料庫');
    if (name.startsWith('migration-001-')) {
        await connection.query("CREATE TABLE IF NOT EXISTS users (id INT AUTO_INCREMENT PRIMARY KEY, name VARCHAR(50) NOT NULL, color VARCHAR(7) NOT NULL DEFAULT '#4CAF50', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)");
        const [columns] = await connection.query("SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'records' AND COLUMN_NAME = 'user_id'");
        if (!columns.length) {
            // 舊的單使用者資料只在新增歸屬欄位時建立預設帳號。
            await connection.query("INSERT IGNORE INTO users (id, name, color) VALUES (1, '使用者', '#4CAF50')");
            await connection.query('ALTER TABLE records ADD COLUMN user_id INT NOT NULL DEFAULT 1');
        }
        const [foreignKeys] = await connection.query("SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'records' AND COLUMN_NAME = 'user_id' AND REFERENCED_TABLE_NAME = 'users' AND REFERENCED_COLUMN_NAME = 'id'");
        if (!foreignKeys.length) {
            const [[orphans]] = await connection.query('SELECT COUNT(*) AS total FROM records r LEFT JOIN users u ON u.id = r.user_id WHERE u.id IS NULL');
            if (Number(orphans.total)) throw new Error('存在沒有對應使用者的記錄，請先修正資料歸屬後再升級；不會自動刪除資料');
            await connection.query('ALTER TABLE records ADD FOREIGN KEY (user_id) REFERENCES users(id)');
        }
        return;
    }
    const [indexes] = await connection.query("SELECT INDEX_NAME AS name FROM information_schema.STATISTICS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'records'");
    for (const [index, columns] of [['idx_records_user_recorded_at', 'user_id, recorded_at'], ['idx_records_recorded_at', 'recorded_at']]) {
        if (!indexes.some(row => row.name === index)) await connection.query(`ALTER TABLE records ADD INDEX ${index} (${columns})`);
    }
}

async function runMigrations(pool, { directory = path.join(__dirname, '..', 'mariadb'), logger = console } = {}) {
    const connection = await pool.promise().getConnection();
    let locked = false;
    try {
        const [[lock]] = await connection.query("SELECT GET_LOCK(CONCAT('bp-migration:', LEFT(SHA2(DATABASE(), 256), 40)), 30) AS acquired");
        if (Number(lock.acquired) !== 1) throw new Error('無法取得資料庫升級鎖，請確認其他服務已完成升級後重試');
        locked = true;
        await connection.query('CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(255) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP) ENGINE=InnoDB');
        const [history] = await connection.query('SELECT name, checksum FROM schema_migrations');
        const files = (await fs.readdir(directory)).filter(name => /^migration-\d{3}-.+\.sql$/.test(name)).sort();
        const applied = [];
        for (const name of files) {
            const sql = (await fs.readFile(path.join(directory, name), 'utf8')).replace(/\r\n/g, '\n');
            const checksum = crypto.createHash('sha256').update(sql).digest('hex');
            const previous = history.find(row => row.name === name);
            if (previous) {
                if (previous.checksum !== checksum) throw new Error(`已執行的升級檔案內容已變更：${name}；請使用新的 migration 檔案`);
                continue;
            }
            logger.info(`資料庫升級：${name}`);
            try {
                if (/^migration-00[12]-/.test(name)) await applyLegacy(connection, name);
                else for (const statement of splitSql(sql)) await connection.query(statement);
                await connection.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [name, checksum]);
                applied.push(name);
            } catch (error) { throw new Error(`資料庫升級失敗：${name}（${error.code || error.message}）。DDL 可能已部分套用，請修正後重啟`, { cause: error }); }
        }
        logger.info(`資料庫升級檢查完成，新增 ${applied.length} 項`);
        return applied;
    } finally {
        try { if (locked) await connection.query("SELECT RELEASE_LOCK(CONCAT('bp-migration:', LEFT(SHA2(DATABASE(), 256), 40)))"); }
        finally { connection.release(); }
    }
}

module.exports = { runMigrations, splitSql };
