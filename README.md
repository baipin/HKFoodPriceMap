# HKFoodPriceMap · 香港食物價格地圖

**Live site / 網站：** https://hkfoodpricemap.vercel.app/

---

## English

A map of Hong Kong's 18 districts showing average food prices per person. The site is static (Material Design, white / dark themes, English / 繁體 / 简体) and deployed on Vercel.

The data is **not** scraped from social media directly. A weekly job does three things for each district:

1. Runs three web searches through the **Bright Data SERP API** (for example 兩餸飯, 茶餐廳, and 食評 with 人均 / HK$). Results can come from any site, including social media search results. Only the title and snippet are used. Pages are never fetched.
2. Sends the results to **Pollinations** (`POST https://gen.pollinations.ai/v1/chat/completions`, model `openai/gpt-5.4-nano`), which returns the restaurant name and per-person price for each result that states one. The model refers to results by index, so it cannot invent links, and each price must be between HK$20 and HK$2,000.
3. Merges the validated posts into `data/districts.json`, and records credit use in `data/usage.json`.

### Project layout

- `index.html`, `css/style.css`, `js/i18n.js`, `js/app.js`: the site (Leaflet + OpenStreetMap tiles)
- `data/districts.json`: per-district statistics and posts (read by the site)
- `data/usage.json`: credit ledger maintained by the crawler
- `api/search.js`: authenticated Vercel function that proxies Bright Data SERP calls; it holds the API key
- `lib/search.mjs`: query builder, SERP client, source labels
- `lib/llm.mjs`: Pollinations prompt, JSON parsing and validation
- `lib/pipeline.mjs`: one district: search, dedupe, extract, build posts
- `lib/quota.mjs`: credit guard; `lib/extract.mjs`: price and restaurant helpers; `lib/store.mjs`: data files
- `scripts/run-crawl.mjs`: driver run by GitHub Actions
- `.github/workflows/crawl.yml`: runs every Monday (02:00 UTC)
- `tests/`: unit tests (`npm test`)

### Deployment

1. Push the repository to GitHub and import it into Vercel (no build step).
2. In Vercel → Settings → Environment Variables, add (keep these out of the code):
   - `BRIGHTDATA_API_KEY`: your Bright Data API key
   - `BRIGHTDATA_ZONE_SERP`: the name of your SERP zone (shown in the Bright Data dashboard)
   - `CRON_SECRET`: a long random string that protects `/api/search` (for example `openssl rand -hex 32`)
3. In GitHub → Settings → Secrets and variables → Actions, add:
   - `CRAWL_URL`: `https://hkfoodpricemap.vercel.app`
   - `CRON_SECRET`: the same value as in Vercel
4. Run the "Crawl food prices" workflow once manually to check it.

The Pollinations key is optional. If you have one, add it to Vercel or GitHub as `POLLINATIONS_API_KEY`; the crawler sends it as a Bearer token.

### Credits and limits

- Each SERP search costs one credit. Each run uses 3 searches per district, so 54 per run, or about 230 per month with weekly runs.
- `lib/quota.mjs` sets a monthly limit of 5,000 with a reserve of 500, and caps a single run at 100.
- Before each run the crawler reads `data/usage.json`. If the budget is too small for a full run, it skips the run. Districts not reached keep their previous data.

### Data notes and limitations

- Search results usually contain only short snippets. Many results will not mention a price, so some districts may have few or no posts. That is expected.
- Pollinations is a free community service without a service-level agreement. If it is unavailable, that run produces no new posts for the affected districts. The site keeps its last data.
- The AI can make mistakes. Prices and restaurant names are estimates from search snippets, not official data.
- Social media platforms' terms restrict automated access. This project only uses what search engines return, but please check that your use of those results is lawful and compliant.
- District centres are approximate and only position the map markers.

### Local development

```bash
npm test                      # run unit tests
python -m http.server 8000    # then open http://localhost:8000
```

---

## 繁體中文

按香港18區顯示食物人均價格的地圖。網站為靜態頁面（Material Design，白色／黑夜主題，支援繁體、简体及 English），部署於 Vercel。

數據**不是**直接從社交媒體爬取的。每週一的工作會為每個地區執行三個步驟：

1. 透過 **Bright Data SERP API** 執行三次網頁搜尋（例如「兩餸飯」、「茶餐廳」，以及「食評 人均 HK$」）。搜尋結果可來自任何網站，包括社交媒體的搜尋結果。只使用標題和摘要，不會抓取網頁內容。
2. 把搜尋結果交給 **Pollinations**（`POST https://gen.pollinations.ai/v1/chat/completions`，模型 `openai/gpt-5.4-nano`），由它為每則註明人均價格的結果提取餐廳名稱和人均價。模型以結果編號來引用，因此無法虛構網址；價格必須介於 HK$20 至 HK$2,000 之間。
3. 把通過驗證的帖文合併到 `data/districts.json`，並把額度消耗記錄在 `data/usage.json`。

### 專案結構

- `index.html`、`css/style.css`、`js/i18n.js`、`js/app.js`：網站（Leaflet + OpenStreetMap 底圖）
- `data/districts.json`：各區統計及帖文（網站讀取此檔）
- `data/usage.json`：爬蟲維護的額度帳本
- `api/search.js`：已驗證身份的 Vercel 函式，代理 Bright Data SERP 呼叫，並持有 API 密鑰
- `lib/search.mjs`：查詢語句、SERP 客戶端、來源標籤
- `lib/llm.mjs`：Pollinations 提示、JSON 解析與驗證
- `lib/pipeline.mjs`：單一地區的流程：搜尋、去重、提取、建立帖文
- `lib/quota.mjs`：額度控制；`lib/extract.mjs`：價格與餐廳名稱輔助；`lib/store.mjs`：數據檔案
- `scripts/run-crawl.mjs`：由 GitHub Actions 執行的驅動程式
- `.github/workflows/crawl.yml`：每週一運行（UTC 02:00）
- `tests/`：單元測試（`npm test`）

### 部署步驟

1. 將專案推送到 GitHub，並在 Vercel 匯入（無需建置步驟）。
2. 在 Vercel → Settings → Environment Variables 中新增（請勿寫入程式碼）：
   - `BRIGHTDATA_API_KEY`：你的 Bright Data API 密鑰
   - `BRIGHTDATA_ZONE_SERP`：SERP zone 的名稱（在 Bright Data 控制台查看）
   - `CRON_SECRET`：保護 `/api/search` 的長隨機字串（例如 `openssl rand -hex 32`）
3. 在 GitHub → Settings → Secrets and variables → Actions 中新增：
   - `CRAWL_URL`：`https://hkfoodpricemap.vercel.app`
   - `CRON_SECRET`：與 Vercel 中的值相同
4. 手動執行一次 “Crawl food prices” 工作流程以確認運作。

Pollinations 密鑰為可選項。如有密鑰，請在 Vercel 或 GitHub 中新增 `POLLINATIONS_API_KEY`；爬蟲會以 Bearer token 發送。

### 額度與限制

- 每次 SERP 搜尋消耗 1 額度。每區每次運行用 3 次搜尋，每次運行共 54 額度；按每週運行計算，每月約 230 額度。
- `lib/quota.mjs` 設定每月上限 5,000，保留 500 作緩衝，並限制單次運行上限為 100。
- 每次運行前，爬蟲會讀取 `data/usage.json`。額度不足以完成一次完整運行時，會跳過該次運行；未處理的地區保留原有數據。

### 數據備註與限制

- 搜尋結果通常只有簡短摘要，很多結果不會提及價格，因此部分地區的帖文可能很少甚至沒有。這是預期的情況。
- Pollinations 是免費的社區服務，沒有服務等級協議。如果它不可用，該次運行不會為受影響地區產生新帖文，網站會保留上一次的數據。
- AI 可能出錯。價格與餐廳名稱是從搜尋摘要推測的，並非官方數據。
- 社交媒體平台的服務條款限制自動化存取。本專案只使用搜尋引擎返回的內容，但請確認你使用這些結果是合法合規的。
- 區域中心點為近似座標，僅用於定位地圖標記。

### 本地開發

```bash
npm test                      # 運行單元測試
python -m http.server 8000    # 然後開啟 http://localhost:8000
```

---

Licence: Apache License 2.0. See `LICENSE`. / 授權：Apache License 2.0，見 `LICENSE`。
