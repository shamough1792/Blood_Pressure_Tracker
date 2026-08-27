# 多用戶 Portal 設計文件

## 緣由

目前不同家人需跑不同 Docker container，資料完全隔離。希望統一成一個 Portal，
每人有自己的帳號，可以管理使用者、匯入其他 container 的資料。

## 設計方案

採用方案一：大頭貼選擇器 + 管理後台，支援 SQL 檔匯入。

---

## 1. 資料庫變更

### 新增 users 表

```sql
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(50) NOT NULL,
    color VARCHAR(7) NOT NULL DEFAULT '#4CAF50',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### records 表新增 user_id

```sql
ALTER TABLE records ADD COLUMN user_id INT NOT NULL DEFAULT 1;
ALTER TABLE records ADD FOREIGN KEY (user_id) REFERENCES users(id);
```

- `color` 為頭像底色，預產預設不同顏色（粉、藍、綠、橙等）
- 既有舊記錄預設歸給 `user_id = 1`

---

## 2. 使用者選擇頁（入口）

- 打開網站首先看到使用者選單
- 每個使用者顯示：彩色圓形頭像 + 名字
- 點選後 localStorage 記住選擇，下次自動跳過此頁
- 右下角 ⚙️ 齒輪圖示進入管理頁
- 風格完全沿用現有大字體、卡片設計

---

## 3. 管理後台

管理後台同樣使用現有的設計系統（大字體、卡片），但針對電腦螢幕最佳化：
- 列表和表單寬度可到 720px（比手機版寬）
- 按鈕和輸入框尺寸維持不變，方便操作

### 使用者管理
- 列表：卡片形式顯示所有使用者（頭像、名字、顏色）
- 新增：點按鈕彈出表單，填入姓名 + 選擇顏色
- 刪除：確認後刪除，連同該使用者的所有記錄
- 編輯：點編輯按鈕修改姓名或顏色

### SQL 匯入
- 頁面顯示操作說明
- 下拉選單選擇要匯入給哪個使用者
- 上傳 .sql 檔（檔案選擇器）
- 解析 INSERT INTO records 語句，跳過結構語句（CREATE TABLE 等）
- 自動加入 user_id，跳過原有 id（讓資料庫重新編號）
- 顯示成功匯入幾筆 / 失敗幾筆

---

## 4. 既有頁面改動

使用者選擇頁和管理後台採用與現有完全一致的設計風格：
- 字體大小、按鈕尺寸、卡片樣式相同
- 管理頁面在電腦上寬度略寬（max-width: 720px），其他樣式保持一致

| 頁面 | 改動 |
|------|------|
| 新增 `views/portal.ejs` | 使用者選擇頁（大頭貼選單） |
| 新增 `views/admin.ejs` | 管理後台（使用者管理 + SQL 匯入） |
| index.ejs | POST /add 帶入 user_id；頂欄顯示目前使用者名稱 + 切換按鈕 |
| records.ejs | SQL 查詢加上 `WHERE user_id = ?` |
| modify.ejs | 修改/刪除加上 user_id 過濾 |
| server.js | GET / 改為使用者選擇頁；新增 /api/users CRUD；新增 /api/import-sql；所有查詢加上 user_id |

---

## 5. 不納入範圍

- 不支援密碼驗證（家庭內部使用）
- 不做操作日誌
- 不做使用者權限分級