# HKFoodPriceMap · 香港食物價格地圖

**Live site / 網站：** https://hkfoodpricemap.vercel.app/

---

## English

A map of Hong Kong's 18 districts showing the average price of food per person. The front end is a static site (Material Design, white / dark themes, English / 繁體 / 简体) deployed on Vercel. A scheduled crawler uses the Bright Data **SERP API** to search Facebook and Xiaohongshu (小红书) for food posts, extracts per-person prices from the search results, and writes them to `data/`.

### Features

- 18-district map and list, with colour bands for average price per person (HKD).
- Click a district to see median and average prices, restaurants mentioned in posts, and the posts themselves.
- Language switch: 繁體中文 / 简体中文 / English.
- Light and dark themes.
- Footer shows the time of the last successful crawl.

### How the data is collected

- Only the **SERP API** is used (one credit per search query). The **Web Unlocker is not used**, so no pages are fetched directly.
- Each district runs four queries (two for Xiaohongshu, two for Facebook). Only results whose URL is on `facebook.com` or `xiaohongshu.com` / `xhslink.com` are kept.
- Post text is taken from each result's title and snippet. A post is kept only if it mentions a per-person price between HK$20 and HK$2,000.
- Restaurant names are a best-effort guess from 【】brackets or the title.

### Project layout

- `index.html`, `css/style.css`, `js/i18n.js`, `js/app.js`: the site (Leaflet + OpenStreetMap / CARTO tiles)
- `data/districts.json`: per-district statistics and posts (read by the site)
- `data/usage.json`: credit ledger maintained by the crawler
- `api/crawl.js`: Vercel Serverless Function that crawls one district; it holds the Bright Data key
- `lib/`: districts, credit guard, Bright Data SERP client, extraction and statistics
- `scripts/run-crawl.mjs`: driver run by GitHub Actions; calls `/api/crawl` for each district and merges the results
- `.github/workflows/crawl.yml`: runs every Monday (02:00 UTC)
- `tests/`: unit tests (`npm test`)

### Deployment

1. Push the repository to GitHub and import it into Vercel (no build step needed).
2. In Vercel → Settings → Environment Variables, add (keep these out of the code):
   - `BRIGHTDATA_API_KEY`: your Bright Data API key
   - `BRIGHTDATA_ZONE_SERP`: the name of your SERP API zone (shown in the Bright Data dashboard)
   - `CRON_SECRET`: a long random string that protects `/api/crawl` (for example `openssl rand -hex 32`)
3. In GitHub → Settings → Secrets and variables → Actions, add:
   - `CRAWL_URL`: your Vercel URL, for example `https://hkfoodpricemap.vercel.app`
   - `CRON_SECRET`: the same value as in Vercel
4. Run the "Crawl food prices" workflow once manually (workflow_dispatch) to check it.

The Bright Data key exists only in Vercel's environment variables. It is not in the repository or in GitHub.

### Credit limit (5,000 per month)

- Each SERP query costs one credit. One run uses 4 credits per district, so 72 per run, or about 310 per month with weekly runs.
- `lib/quota.mjs` sets a monthly limit of 5,000, keeps a reserve of 500 (so at most 4,500 are used), and caps a single run at 300.
- Before each run the crawler reads `data/usage.json`. If the budget is exhausted, the run is skipped. The server also enforces the per-district budget.
- To change the schedule, edit the `cron` line in `crawl.yml`. To change the limits, edit the constants in `lib/quota.mjs`.
- The ledger only counts credits this project has spent. Check the Bright Data dashboard for the real figure.

### Data notes and limitations

- Average and median prices are per-person estimates taken from social media search results. They are not official prices.
- District centres are approximate and only position the map markers.
- Social media platforms restrict automated access in their terms of service. Bright Data's use is subject to those terms too. Check that your use is lawful and compliant before running the crawler.

### Local development

```bash
npm test                      # run unit tests
python -m http.server 8000    # then open http://localhost:8000
```

To run the crawler locally, set `CRAWL_URL` and `CRON_SECRET` and run `npm run crawl`. The `/api/crawl` endpoint must already be deployed.

### Licence

Apache License 2.0. See `LICENSE`.

---

## 繁體中文

按香港18區顯示食物人均價格的地圖。前端為靜態網站（Material Design，白色／黑夜主題，支援繁體、简体及 English），部署於 Vercel。定時爬蟲使用 Bright Data **SERP API** 在 Facebook 及小紅書搜尋食物貼文，從搜尋結果中提取人均價格，並寫入 `data/`。

### 功能

- 18區地圖及列表，按人均價格以顏色分級。
- 點選地區可查看人均價中位數與平均數、貼文提及的餐廳，以及貼文列表。
- 語言切換：繁體中文／简体中文／English。
- 白天與黑夜主題。
- 頁腳顯示最近一次成功爬取的時間。

### 數據收集方式

- 只使用 **SERP API**（每次搜尋查詢消耗1額度）。**不使用 Web Unlocker**，因此不會直接抓取網頁內容。
- 每區執行四個查詢（小紅書兩個、Facebook 兩個）。只保留網址屬於 `facebook.com`、`xiaohongshu.com` 或 `xhslink.com` 的結果。
- 貼文內容取自搜尋結果的標題與摘要。只有提及 HK$20 至 HK$2,000 人均價的貼文才會保留。
- 餐廳名稱是盡力而為的推測，取自【】括號或標題。

### 專案結構

- `index.html`、`css/style.css`、`js/i18n.js`、`js/app.js`：網站（Leaflet + OpenStreetMap／CARTO 底圖）
- `data/districts.json`：各區統計及貼文（網站讀取此檔）
- `data/usage.json`：爬蟲維護的額度帳本
- `api/crawl.js`：Vercel Serverless Function，爬取單一區，並持有 Bright Data 密鑰
- `lib/`：區域資料、額度控制、Bright Data SERP 客戶端、提取及統計
- `scripts/run-crawl.mjs`：由 GitHub Actions 執行的驅動程式，逐區呼叫 `/api/crawl` 並合併結果
- `.github/workflows/crawl.yml`：每週一運行（UTC 02:00）
- `tests/`：單元測試（`npm test`）

### 部署步驟

1. 將專案推送到 GitHub，並在 Vercel 匯入（無需建置步驟）。
2. 在 Vercel → Settings → Environment Variables 中新增（請勿寫入程式碼）：
   - `BRIGHTDATA_API_KEY`：你的 Bright Data API 密鑰
   - `BRIGHTDATA_ZONE_SERP`：SERP API 的 zone 名稱（在 Bright Data 控制台查看）
   - `CRON_SECRET`：用於保護 `/api/crawl` 的長隨機字串（例如 `openssl rand -hex 32`）
3. 在 GitHub → Settings → Secrets and variables → Actions 中新增：
   - `CRAWL_URL`：你的 Vercel 網址，例如 `https://hkfoodpricemap.vercel.app`
   - `CRON_SECRET`：與 Vercel 中的值相同
4. 手動執行一次 “Crawl food prices” 工作流程（workflow_dispatch）以確認運作。

Bright Data 密鑰只存在於 Vercel 環境變數中，不會出現在程式庫或 GitHub 中。

### 額度上限（每月 5,000）

- 每次 SERP 查詢消耗 1 額度。每區每次運行用 4 額度，每次運行共 72 額度；按每週運行計算，每月約 310 額度。
- `lib/quota.mjs` 設定每月上限 5,000，保留 500 作為緩衝（即最多使用 4,500），並限制單次運行上限為 300。
- 每次運行前，爬蟲會讀取 `data/usage.json`。額度不足時會跳過該次運行；伺服器端也會強制執行每區的預算。
- 如需更改頻率，請修改 `crawl.yml` 中的 `cron`；如需更改上限，請修改 `lib/quota.mjs` 中的常數。
- 帳本只記錄本專案消耗的額度，實際用量請以 Bright Data 控制台為準。

### 數據備註與限制

- 平均價與中位數是從社交媒體搜尋結果估算的人均消費，並非官方價格。
- 區域中心點為近似座標，僅用於定位地圖標記。
- 社交媒體平台的服務條款限制自動化存取，Bright Data 的使用同樣受該等條款約束。運行爬蟲前請確認你的使用方式合法且合規。

### 本地開發

```bash
npm test                      # 運行單元測試
python -m http.server 8000    # 然後開啟 http://localhost:8000
```

如需在本機運行爬蟲，請設定 `CRAWL_URL` 與 `CRON_SECRET` 後執行 `npm run crawl`，且 `/api/crawl` 必須已部署。

### 授權

Apache License 2.0，見 `LICENSE`。
