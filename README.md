# Blood Pressure Tracker 血壓記錄

<br>

A web application for recording and tracking blood pressure data, built with Node.js, Express, and MariaDB.

<br>

## Features

<br>

- **長者友善 4 步驟引導輸入** — 逐步輸入高壓、低壓、心跳，支援自動填入日期時段
- **卡片式記錄列表** — 依月份分組，支援左右箭頭切換月份或下拉選單直選
- **血壓分級顏色提示** — 🟢 正常 / 🟡 偏高 / 🔴 高血壓
- **Excel 匯出** — 日曆格式報表，含血壓分級顏色標示（綠色/黃色/紅色）
- **可自訂標題** — 透過 `TITLE_SUFFIX` 環境變數，支援多人家族使用（如「血壓記錄 (嫲嫲)」）
- **PWA 支援** — 可安裝到手機主畫面，像原生 App 般使用
- **Docker 一鍵部署** — 支援自建 MariaDB 或連外部資料庫
- **響應式設計** — 手機、平板、電腦都適用

<br>

## Getting Started

<br>

### Option 1: Docker (Recommended)

```bash
# 使用外部資料庫（如 Synology NAS）
TITLE_SUFFIX=嫲嫲 docker compose up -d --build
```

### Option 2: Manual Setup

#### Dependencies

- Node.js >= 20
- MariaDB >= 10.6

#### Installing

```bash
npm install
```

#### Setup Database

```sql
CREATE DATABASE blood_test;
CREATE TABLE records (
    id INT AUTO_INCREMENT PRIMARY KEY,
    high_pressure INT NOT NULL,
    low_pressure INT NOT NULL,
    heartbeat INT NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

#### Configure

Edit `server.js` or set environment variables:

| Variable | Description |
|----------|-------------|
| `DB_HOST` | Database host (default: `192.168.1.222`) |
| `DB_USER` | Database user (default: `tracker_user`) |
| `DB_PASSWORD` | Database password |
| `DB_NAME` | Database name (default: `blood_test`) |
| `PORT` | Server port (default: `3000`) |
| `TITLE_SUFFIX` | Optional title suffix (e.g., `嫲嫲`) |

#### Running

```bash
TITLE_SUFFIX=嫲嫲 node server.js
```

<br>

## Docker Deployment

<br>

### 使用外部資料庫（如 Synology NAS）

```yaml
services:
  app:
    build: .
    ports:
      - "3000:3000"
    environment:
      TZ: Asia/Hong_Kong
      DB_HOST: 192.168.1.222
      DB_USER: tracker_user
      DB_PASSWORD: 'your_password'
      DB_NAME: blood_test
      TITLE_SUFFIX: ${TITLE_SUFFIX:-}
    restart: unless-stopped
```

### 多人家族使用

```bash
# 給嫲嫲用
TITLE_SUFFIX=嫲嫲 docker compose up -d

# 給爸爸用（不同 port）
TITLE_SUFFIX=爸爸 docker compose -p dad up -d
# 修改 ports 為 "3001:3000"
```

<br>

## Version History

<br>

* 0.1 — Initial Release
* 0.2 — UI update, success popup
* 0.3 — Bug fixes, auto reconnect
* 0.3.5 — CSV output improvements
* 0.4 — CSV naming, favicon
* 0.5 — XLSX export, layout improvements
* 0.5.1 — Export empty records fix
* 0.6 — Records grouped by month, modify page
* **1.0** — Elderly-friendly redesign, 4-step input, card view, PWA, Docker, Excel color coding

<br>

## Screenshots

<br>

![Index Page](images/index.png)

<br>

![Records Page](images/record.png)

<br>

![Modify Page](images/modify.png)

<br>

## Authors

<br>

[shamough1792](https://github.com/shamough1792)

<br>

## License

<br>

This project is licensed under the MIT License — see the [LICENSE.md](LICENSE.md) file for details

<br>
