# HKFoodPriceMap · 香港食物價格地圖

**Live site / 網站：** https://hkfoodpricemap.vercel.app/

> **Where do the API keys go? / API 密鑰填在哪裡？**
>
> There is only one key, and it is optional. Put it in GitHub, not Vercel, because the crawler runs in GitHub Actions and the website itself is static.
>
> 只有一個密鑰，而且是可選的。請填在 GitHub，不要填在 Vercel：爬蟲在 GitHub Actions 中運行，網站本身是靜態的。
>
> | Name / 名稱 | Where / 填寫位置 | Value / 內容 |
> |---|---|---|
> | `POLLINATIONS_API_KEY` (optional / 可選) | GitHub → Settings → Secrets and variables → Actions → New repository secret | Your Pollinations key / 你的 Pollinations 密鑰 |
>
> Nothing is stored in the code. / 密鑰不寫入程式碼。

---

## English

A map of Hong Kong's 18 districts showing average food prices per person. The site is static (Material Design, white / dark themes, English / 繁體 / 简体) and deployed on Vercel.

**Pollinations is the only data source.** Once a week, a GitHub Actions job makes one request per district to a search-enabled Pollinations model (`google/gemini-2.5-flash-lite:search`) through the endpoint `POST https://gen.pollinations.ai/v1/chat/completions`. The model searches the public web for restaurants in that district and returns, as JSON, the restaurant name, the per-person price in HKD, and the page the price came from. The result is validated, then merged into `data/districts.json`.

### Validation

The model's answer is not trusted:

- each entry must have an `http(s)` source URL; entries without one are dropped;
- the price must be between HK$20 and HK$2,000;
- names and titles are length-limited and stripped of control characters;
- at most 15 entries are kept per district, with duplicate URLs removed.

### Project layout

- `index.html`, `css/style.css`, `js/i18n.js`, `js/app.js`: the static site (Leaflet + OpenStreetMap tiles)
- `data/districts.json`: per-district statistics and posts (read by the site)
- `data/usage.json`: request ledger maintained by the crawler
- `lib/llm.mjs`: the Pollinations request, JSON parsing and validation
- `lib/pipeline.mjs`: one district: call, validate, build posts
- `lib/extract.mjs`: price and restaurant helpers, source labels, statistics
- `lib/quota.mjs`: request guard; `lib/store.mjs`: data files
- `scripts/run-crawl.mjs`: driver run by GitHub Actions
- `.github/workflows/crawl.yml`: runs every Monday (02:00 UTC)
- `tests/`: unit tests (`npm test`)

### Deployment

1. Push the repository to GitHub and import it into Vercel. There is no build step and no serverless function, so it is a plain static deployment.
2. Optional: in GitHub → Settings → Secrets and variables → Actions, add `POLLINATIONS_API_KEY`.
3. Run the "Crawl food prices" workflow once manually (Actions tab → Run workflow) to check it. After it commits `data/`, Vercel redeploys the site.

### Requests and limits

- One Pollinations request per district, so 18 per run, or about 78 per month with weekly runs.
- `lib/quota.mjs` keeps a local count in `data/usage.json`. The real limits depend on your Pollinations plan; check your Pollinations dashboard.
- If a run cannot be afforded under the local budget, it is skipped and the site keeps its last data.

### Data notes and limitations

- The model searches and summarises pages. We do not fetch the pages ourselves, so a price is only as good as the model's reading of the source. Check the link before relying on a figure.
- Pollinations is a community service without a service-level agreement. When it is unavailable, that run adds no posts for the affected districts.
- Prices and restaurant names are AI-generated estimates, not official data.
- District centres are approximate and only position the map markers.

### Local development

```bash
npm test                      # run unit tests
python -m http.server 8000    # then open http://localhost:8000
```

---

## 繁體中文

按香港18區顯示食物人均價格的地圖。網站為靜態頁面（Material Design，白色／黑夜主題，支援繁體、简体及 English），部署於 Vercel。

**Pollinations 是唯一的數據來源。** 每週一，GitHub Actions 會為每個地區向一個支援搜尋的 Pollinations 模型（`google/gemini-2.5-flash-lite:search`）發出一次請求，端點為 `POST https://gen.pollinations.ai/v1/chat/completions`。模型會在公開網頁上搜尋該地區的餐廳，並以 JSON 返回餐廳名稱、人均價格（HKD）以及價格的來源網頁。結果經過驗證後，合併到 `data/districts.json`。

### 驗證

模型的回答不被完全信任：

- 每則結果必須有 `http(s)` 來源網址，沒有的會被丟棄；
- 價格必須介於 HK$20 至 HK$2,000 之間；
- 名稱和標題有長度限制，並去除控制字元；
- 每區最多保留 15 則結果，重複網址會被去除。

### 專案結構

- `index.html`、`css/style.css`、`js/i18n.js`、`js/app.js`：靜態網站（Leaflet + OpenStreetMap 底圖）
- `data/districts.json`：各區統計及帖文（網站讀取此檔）
- `data/usage.json`：爬蟲維護的請求帳本
- `lib/llm.mjs`：Pollinations 請求、JSON 解析與驗證
- `lib/pipeline.mjs`：單一地區：請求、驗證、建立帖文
- `lib/extract.mjs`：價格與餐廳名稱輔助、來源標籤、統計
- `lib/quota.mjs`：請求控制；`lib/store.mjs`：數據檔案
- `scripts/run-crawl.mjs`：由 GitHub Actions 執行的驅動程式
- `.github/workflows/crawl.yml`：每週一運行（UTC 02:00）
- `tests/`：單元測試（`npm test`）

### 部署步驟

1. 將專案推送到 GitHub，並在 Vercel 匯入。沒有建置步驟，也沒有無伺服器函式，是純靜態部署。
2. 可選：在 GitHub → Settings → Secrets and variables → Actions 中新增 `POLLINATIONS_API_KEY`。
3. 在 Actions 頁面手動執行一次 “Crawl food prices”（Run workflow）以確認運作。工作提交 `data/` 後，Vercel 會重新部署網站。

### 請求與限制

- 每區每次運行一次 Pollinations 請求，即每次 18 次；按每週運行計算，每月約 78 次。
- `lib/quota.mjs` 在 `data/usage.json` 記錄本地計數。實際限額取決於你的 Pollinations 方案，請在 Pollinations 控制台查看。
- 如果本地預算不足以完成一次完整運行，會跳過該次運行，網站保留上一次的數據。

### 數據備註與限制

- 模型會搜尋並摘要網頁。我們不自行抓取網頁，因此價格的準確度取決於模型對來源的理解。引用前請核對來源網址。
- Pollinations 是社區服務，沒有服務等級協議。服務不可用時，該次運行不會為受影響地區新增帖文。
- 價格與餐廳名稱是 AI 生成的估算，並非官方數據。
- 區域中心點為近似座標，僅用於定位地圖標記。

### 本地開發

```bash
npm test                      # 運行單元測試
python -m http.server 8000    # 然後開啟 http://localhost:8000
```

---

Licence: Apache License 2.0. See `LICENSE`. / 授權：Apache License 2.0，見 `LICENSE`。
