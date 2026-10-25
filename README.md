# HKFoodPriceMap · 香港食物價格地圖

**Live site / 網站：** https://hkfoodpricemap.vercel.app/

---

## English

A map of Hong Kong's 18 districts showing average food prices per person. The site is static (Material Design, white / dark themes, English / 繁體 / 简体) and deployed on Vercel. A scheduled crawler uses the **Bright Data Facebook Scraper API** (posts dataset, collect by post URL) to pull posts from Facebook pages and posts listed in `data/seeds.json`, extracts per-person prices from the post text, and writes the results to `data/districts.json`.

### How the data is collected

- Facebook only. Xiaohongshu (小红书) is not covered.
- `data/seeds.json` lists Facebook **post** URLs for each district (the default dataset is "posts by post URL"). The crawler only reads these URLs. It does not search by keyword.
- The crawler calls Bright Data's synchronous `/datasets/v3/scrape` endpoint once per seed URL (four at a time). The records come back in the response; no snapshot is used. If a URL takes longer than one minute, Bright Data returns HTTP 202 and that URL is skipped for this run.
- A record is kept only if its text mentions a per-person price between HK$20 and HK$2,000.
- Restaurant names are a best-effort guess from 【】brackets or the start of the post.

### Project layout

- `index.html`, `css/style.css`, `js/i18n.js`, `js/app.js`: the site (Leaflet + OpenStreetMap tiles)
- `data/seeds.json`: Facebook URLs per district (you maintain this)
- `data/districts.json`: per-district statistics and posts (read by the site)
- `data/usage.json`: credit ledger maintained by the crawler
- `api/crawl.js`: authenticated Vercel function that proxies one scrape call per URL; it holds the API key
- `lib/`: districts, credit guard, Bright Data client, URL matching, extraction and statistics
- `scripts/run-crawl.mjs`: driver run by GitHub Actions
- `.github/workflows/crawl.yml`: runs every Monday (02:00 UTC)
- `tests/`: unit tests (`npm test`)

### Deployment

1. Push the repository to GitHub and import it into Vercel (no build step).
2. In Vercel → Settings → Environment Variables, add (keep these out of the code):
   - `BRIGHTDATA_API_KEY`: your Bright Data API key
   - `CRON_SECRET`: a long random string that protects `/api/crawl` (for example `openssl rand -hex 32`)
   - `BRIGHTDATA_DATASET_ID` (optional): overrides the default posts dataset `gd_lyclm1571iy3mv57zw`
3. In GitHub → Settings → Secrets and variables → Actions, add:
   - `CRAWL_URL`: `https://hkfoodpricemap.vercel.app`
   - `CRON_SECRET`: the same value as in Vercel
4. Fill in `data/seeds.json` with Facebook URLs. With an empty list the crawler does nothing.
5. Run the "Crawl food prices" workflow once manually to check it.

### Credit limit (5,000 per month)

- The dataset charges one credit per record. The crawler sends one URL per record, so each URL in `seeds.json` costs about one credit per run.
- `lib/quota.mjs` sets a monthly limit of 5,000, keeps a reserve of 500 (at most 4,500 used), and caps a single run at 300 URLs.
- Before each run the crawler reads `data/usage.json`. If the budget is exhausted, the run is skipped. Each run also stops at the per-run cap of 300 URLs.
- If a request fails, the crawler still counts one credit for it, to stay on the safe side.
- The ledger only counts credits this project has spent. Check the Bright Data dashboard for the real figure.

### Data notes and limitations

- Prices are per-person estimates taken from post text. They are not official prices.
- The record field names (`url`, `input_url`, `content`) are assumed; check them against a real response from the dataset.
- District centres are approximate and only position the map markers.
- Facebook's terms restrict automated access, and Bright Data's use is subject to those terms. Check that your use is lawful and compliant.

### Local development

```bash
npm test                      # run unit tests
python -m http.server 8000    # then open http://localhost:8000
```

---

## 繁體中文

按香港18區顯示食物人均價格的地圖。網站為靜態頁面（Material Design，白色／黑夜主題，支援繁體、简体及 English），部署於 Vercel。定時爬蟲使用 **Bright Data Facebook Scraper API**（帖文數據集，按帖文網址收集），抓取 `data/seeds.json` 中列出的 Facebook 帖文網址，從帖文內容提取人均價格，寫入 `data/districts.json`。

### 數據收集方式

- 只支援 Facebook。小紅書不在範圍內。
- `data/seeds.json` 列出每區的 Facebook **帖文**網址（預設數據集為「按帖文網址收集」）。爬蟲只讀取這些網址，不會按關鍵字搜尋。
- 每次運行，爬蟲對每個種子網址呼叫 Bright Data 的同步 `/datasets/v3/scrape` 端點（同時四個），記錄直接在回應中返回，不使用快照。若某網址超過一分鐘，Bright Data 會返回 HTTP 202，該網址在本次運行中跳過。
- 只有內容提及 HK$20 至 HK$2,000 人均價的記錄會被保留。
- 餐廳名稱是盡力而為的推測，取自【】括號或帖文開頭。

### 專案結構

- `index.html`、`css/style.css`、`js/i18n.js`、`js/app.js`：網站（Leaflet + OpenStreetMap 底圖）
- `data/seeds.json`：每區的 Facebook 網址（由你維護）
- `data/districts.json`：各區統計及帖文（網站讀取此檔）
- `data/usage.json`：爬蟲維護的額度帳本
- `api/crawl.js`：已驗證身份的 Vercel 函式，每個網址代理一次 Bright Data 抓取呼叫，並持有 API 密鑰
- `lib/`：區域資料、額度控制、Bright Data 客戶端、網址配對、提取及統計
- `scripts/run-crawl.mjs`：由 GitHub Actions 執行的驅動程式
- `.github/workflows/crawl.yml`：每週一運行（UTC 02:00）
- `tests/`：單元測試（`npm test`）

### 部署步驟

1. 將專案推送到 GitHub，並在 Vercel 匯入（無需建置步驟）。
2. 在 Vercel → Settings → Environment Variables 中新增（請勿寫入程式碼）：
   - `BRIGHTDATA_API_KEY`：你的 Bright Data API 密鑰
   - `CRON_SECRET`：保護 `/api/crawl` 的長隨機字串（例如 `openssl rand -hex 32`）
   - `BRIGHTDATA_DATASET_ID`（可選）：覆寫預設的帖文數據集 `gd_lyclm1571iy3mv57zw`
3. 在 GitHub → Settings → Secrets and variables → Actions 中新增：
   - `CRAWL_URL`：`https://hkfoodpricemap.vercel.app`
   - `CRON_SECRET`：與 Vercel 中的值相同
4. 在 `data/seeds.json` 中填入 Facebook 網址。清單為空時爬蟲不會執行任何操作。
5. 手動執行一次 “Crawl food prices” 工作流程以確認運作。

### 額度上限（每月 5,000）

- 數據集每筆記錄消耗 1 額度。爬蟲每個網址只送出一筆，因此 `seeds.json` 中每個網址每次運行約消耗 1 額度。
- `lib/quota.mjs` 設定每月上限 5,000，保留 500 作緩衝（即最多使用 4,500），並限制單次運行最多 300 個網址。
- 每次運行前，爬蟲會讀取 `data/usage.json`。額度不足時跳過該次運行；單次運行也以 300 個網址為上限。
- 如果某個請求失敗，爬蟲仍會計入一個額度，以保持安全側。
- 帳本只記錄本專案消耗的額度，實際用量請以 Bright Data 控制台為準。

### 數據備註與限制

- 價格是從帖文內容估算的人均消費，並非官方價格。
- 記錄欄位名稱（`url`、`input_url`、`content`）是假設的，請以實際回應核對。
- 區域中心點為近似座標，僅用於定位地圖標記。
- Facebook 的服務條款限制自動化存取，Bright Data 的使用同樣受該等條款約束。請確認你的使用方式合法且合規。

### 本地開發

```bash
npm test                      # 運行單元測試
python -m http.server 8000    # 然後開啟 http://localhost:8000
```

---

Licence: Apache License 2.0. See `LICENSE`. / 授權：Apache License 2.0，見 `LICENSE`。
