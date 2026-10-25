# HKFoodPriceMap · 香港食物价格地图

按香港18个行政区显示食物人均价格。前端为纯静态页面（Material Design 白色风格），部署在 Vercel；
价格数据由定时爬虫通过 Bright Data 抓取社交媒体（Facebook、小红书）上的餐厅贴文，提取人均消费后写入 `data/`。

## 目录结构

- `index.html`, `css/style.css`, `js/app.js`：地图与详情页（Leaflet + OpenStreetMap）
- `data/districts.json`：各区统计与贴文（网站读取此文件）
- `data/usage.json`：Bright Data 额度账本（由爬虫维护）
- `api/crawl.js`：Vercel Serverless Function，抓取单个区，持有 Bright Data 密钥
- `lib/`：区划、额度控制、Bright Data 客户端、贴文解析
- `scripts/run-crawl.mjs`：GitHub Actions 调用的驱动脚本，逐区调用 `/api/crawl` 并合并结果
- `.github/workflows/crawl.yml`：每周一定时运行
- `tests/`：`npm test`

## 部署步骤

1. 把仓库推送到 GitHub，在 Vercel 导入该仓库（Framework Preset 选 Other，无需构建命令）。
2. 在 Vercel 项目的 **Settings → Environment Variables** 中添加（只需在 Vercel 中配置，不要写入代码）：
   - `BRIGHTDATA_API_KEY`：Bright Data API 密钥
   - `BRIGHTDATA_ZONE_UNLOCKER`：Web Unlocker 的 zone 名称（在 Bright Data 控制台查看）
   - `BRIGHTDATA_ZONE_SERP`：SERP API 的 zone 名称
   - `CRON_SECRET`：自定义的长随机字符串，用于保护 `/api/crawl`（例如 `openssl rand -hex 32`）
3. 在 GitHub 仓库 **Settings → Secrets and variables → Actions** 中添加两个 secret：
   - `CRAWL_URL`：你的 Vercel 网址，例如 `https://hkfm.vercel.app`
   - `CRON_SECRET`：与 Vercel 中设置的值完全相同
4. 在 Actions 页面手动运行一次 “Crawl food prices”（workflow_dispatch）验证。

`BRIGHTDATA_API_KEY` 只存在于 Vercel 环境变量中，GitHub 与代码仓库里都不包含它。

## 额度控制（5000 额度/月）

- 每次请求消耗 1 额度（Web Unlocker 与 SERP API 均为 1 额度/请求）。本项目不使用浏览器 API 与 Scraper API。
- `lib/quota.mjs`：月上限 5000，保留 500 作为缓冲，因此每月最多使用 4500；单次运行上限 300。
- 每次运行前读取 `data/usage.json`，预算不足时直接跳过本次爬取；每个区的预算也会被服务端强制限制。
- 每区约消耗 10 额度（2 次搜索 + 最多 8 个页面）。按每周一次计算，每月约 780 额度（每月约 4.3 次运行）。
- 如需调整频率，修改 `crawl.yml` 中的 `cron`；如需调整上限，修改 `lib/quota.mjs` 中的常量。
- 账本只在仓库内记录已消耗额度，请以 Bright Data 控制台的实际用量为准，并定期核对。

## 数据口径与限制

- 人均价：从贴文中识别“人均 $xx”“HK$xx 每人”等写法，过滤 $20–$2000 之外的数值；区内人均价为样本的平均值，中位数同时显示。
- 餐厅名：取自贴文中的【】标题或标题首段，属于尽力识别。
- 社交媒体平台的服务条款对自动化抓取有限制，Bright Data 的使用同样受其条款约束。使用前请确认符合当地法律及平台规定，并自行承担合规责任。
- 区域中心点为近似坐标，仅用于定位标记；如需精确边界，可自行加入 `data/districts.geojson` 后扩展前端。
- 数据并非官方数据，页面已注明仅供参考。

## 本地开发

```bash
npm test                 # 运行单元测试
python -m http.server 8000   # 或任意静态服务器，然后打开 http://localhost:8000
```

本地运行爬虫需要设置环境变量 `CRAWL_URL` 与 `CRON_SECRET` 后执行 `npm run crawl`，且需已部署 `/api/crawl`。

## 许可

Apache License 2.0，见 `LICENSE`。
