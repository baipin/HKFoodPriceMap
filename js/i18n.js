/* Translations: Traditional Chinese (zh-Hant), Simplified Chinese (zh-Hans), English.
 * Usage: t("key", { v: 65 }) with "{v}" placeholders.
 * Static HTML uses data-i18n / data-i18n-aria / data-i18n-title attributes.
 */
(function () {
  "use strict";

  var STRINGS = {
    "zh-Hant": {
      appTitle: "香港食物價格地圖",
      appSubtitle: "按行政區",
      loading: "加載中…",
      neverUpdated: "尚未抓取數據",
      dataUpdated: "數據更新：{time}",
      loadFailed: "數據加載失敗",
      errorDetail: "無法加載數據：{msg}",
      legendLow: "低於 $40",
      legend2: "$40–60",
      legend3: "$60–80",
      legend4: "$80–150",
      legendHigh: "高於 $150",
      legendNone: "暫無數據",
      mapAria: "香港18區地圖",
      listTitle: "各區人均價",
      listHint: "點選地圖或列表",
      placeholderTitle: "請選擇一個行政區",
      placeholderText: "點擊地圖上的圓點，或左側列表中的行政區，查看該區的餐廳與社交媒體貼文。",
      noData: "暫無數據",
      statMedian: "人均價（中位數）",
      statMean: "人均價（平均）",
      statSamples: "價格樣本數",
      statPosts: "收錄貼文數",
      updatedAt: "更新：{time}",
      notUpdated: "尚未更新",
      restaurantsTitle: "餐廳（來自貼文）",
      noRestaurants: "暫未發現餐廳信息",
      postsTitle: "社交媒體貼文",
      noPostsYet: "尚未抓取數據，定時爬蟲運行後將在此顯示。",
      noPostsDistrict: "該區暫無收錄的貼文。",
      untitled: "（無標題）",
      sourceDefault: "社交媒體",
      perPerson: "人均 ${v}",
      postsCount: "{n} 篇",
      footerDisclaimer: "價格為社交媒體貼文中提取的人均消費估算，僅供參考，並非官方數據。",
      footerCrawled: "爬蟲更新時間：{time}",
      footerNotRun: "爬蟲尚未運行",
      themeToDark: "切換至黑夜模式",
      themeToLight: "切換至白天模式",
      langLabel: "語言",
      otherProjects: "其他項目",
      donate: "捐贈我們",
      reportIssue: "報告問題",
      wcagAlt: "符合萬維網聯盟有關無障礙網頁設計指引中2A級別的要求",
      localeTag: "zh-HK",
    },
    "zh-Hans": {
      appTitle: "香港食物价格地图",
      appSubtitle: "按行政区",
      loading: "加载中…",
      neverUpdated: "尚未抓取数据",
      dataUpdated: "数据更新：{time}",
      loadFailed: "数据加载失败",
      errorDetail: "无法加载数据：{msg}",
      legendLow: "低于 $40",
      legend2: "$40–60",
      legend3: "$60–80",
      legend4: "$80–150",
      legendHigh: "高于 $150",
      legendNone: "暂无数据",
      mapAria: "香港18区地图",
      listTitle: "各区人均价",
      listHint: "点选地图或列表",
      placeholderTitle: "请选择一个行政区",
      placeholderText: "点击地图上的圆点，或左侧列表中的行政区，查看该区的餐厅与社交媒体帖文。",
      noData: "暂无数据",
      statMedian: "人均价（中位数）",
      statMean: "人均价（平均）",
      statSamples: "价格样本数",
      statPosts: "收录帖文数",
      updatedAt: "更新：{time}",
      notUpdated: "尚未更新",
      restaurantsTitle: "餐厅（来自帖文）",
      noRestaurants: "暂未发现餐厅信息",
      postsTitle: "社交媒体帖文",
      noPostsYet: "尚未抓取数据，定时爬虫运行后将在此显示。",
      noPostsDistrict: "该区暂无收录的帖文。",
      untitled: "（无标题）",
      sourceDefault: "社交媒体",
      perPerson: "人均 ${v}",
      postsCount: "{n} 篇",
      footerDisclaimer: "价格为社交媒体帖文中提取的人均消费估算，仅供参考，并非官方数据。",
      footerCrawled: "爬虫更新时间：{time}",
      footerNotRun: "爬虫尚未运行",
      themeToDark: "切换至夜间模式",
      themeToLight: "切换至白天模式",
      langLabel: "语言",
      otherProjects: "其他项目",
      donate: "捐赠我们",
      reportIssue: "报告问题",
      wcagAlt: "符合万维网联盟有关无障碍网页设计指引中2A级别的要求",
      localeTag: "zh-CN",
    },
    en: {
      appTitle: "Hong Kong Food Price Map",
      appSubtitle: "By district",
      loading: "Loading…",
      neverUpdated: "No data yet",
      dataUpdated: "Data updated: {time}",
      loadFailed: "Failed to load data",
      errorDetail: "Could not load data: {msg}",
      legendLow: "Under $40",
      legend2: "$40–60",
      legend3: "$60–80",
      legend4: "$80–150",
      legendHigh: "Over $150",
      legendNone: "No data",
      mapAria: "Map of Hong Kong's 18 districts",
      listTitle: "Avg. price by district",
      listHint: "Pick on map or list",
      placeholderTitle: "Select a district",
      placeholderText: "Click a dot on the map or a district in the list to see restaurants and social media posts there.",
      noData: "No data",
      statMedian: "Median per person",
      statMean: "Average per person",
      statSamples: "Price samples",
      statPosts: "Posts collected",
      updatedAt: "Updated: {time}",
      notUpdated: "Not updated yet",
      restaurantsTitle: "Restaurants (from posts)",
      noRestaurants: "No restaurants found yet",
      postsTitle: "Social media posts",
      noPostsYet: "No data yet. Posts will appear here after the next crawl.",
      noPostsDistrict: "No posts collected for this district yet.",
      untitled: "(untitled)",
      sourceDefault: "Social media",
      perPerson: "${v} pp",
      postsCount: "{n} posts",
      footerDisclaimer: "Prices are per-person estimates extracted from social media posts. For reference only; not official data.",
      footerCrawled: "Crawler last updated: {time}",
      footerNotRun: "Crawler has not run yet",
      themeToDark: "Switch to dark mode",
      themeToLight: "Switch to light mode",
      langLabel: "Language",
      otherProjects: "Other projects",
      donate: "Donate",
      reportIssue: "Report an issue",
      wcagAlt: "Conforms to W3C WCAG 2.2 Level AA",
      localeTag: "en-GB",
    },
  };

  // District names per language (ids match lib/districts.mjs).
  var DISTRICT_NAMES = {
    "central-western": { "zh-Hant": "中西區", "zh-Hans": "中西区", en: "Central and Western" },
    "wan-chai": { "zh-Hant": "灣仔區", "zh-Hans": "湾仔区", en: "Wan Chai" },
    "eastern": { "zh-Hant": "東區", "zh-Hans": "东区", en: "Eastern" },
    "southern": { "zh-Hant": "南區", "zh-Hans": "南区", en: "Southern" },
    "yau-tsim-mong": { "zh-Hant": "油尖旺區", "zh-Hans": "油尖旺区", en: "Yau Tsim Mong" },
    "sham-shui-po": { "zh-Hant": "深水埗區", "zh-Hans": "深水埗区", en: "Sham Shui Po" },
    "kowloon-city": { "zh-Hant": "九龍城區", "zh-Hans": "九龙城区", en: "Kowloon City" },
    "wong-tai-sin": { "zh-Hant": "黃大仙區", "zh-Hans": "黄大仙区", en: "Wong Tai Sin" },
    "kwun-tong": { "zh-Hant": "觀塘區", "zh-Hans": "观塘区", en: "Kwun Tong" },
    "kwai-tsing": { "zh-Hant": "葵青區", "zh-Hans": "葵青区", en: "Kwai Tsing" },
    "tsuen-wan": { "zh-Hant": "荃灣區", "zh-Hans": "荃湾区", en: "Tsuen Wan" },
    "tuen-mun": { "zh-Hant": "屯門區", "zh-Hans": "屯门区", en: "Tuen Mun" },
    "yuen-long": { "zh-Hant": "元朗區", "zh-Hans": "元朗区", en: "Yuen Long" },
    "north": { "zh-Hant": "北區", "zh-Hans": "北区", en: "North" },
    "tai-po": { "zh-Hant": "大埔區", "zh-Hans": "大埔区", en: "Tai Po" },
    "sha-tin": { "zh-Hant": "沙田區", "zh-Hans": "沙田区", en: "Sha Tin" },
    "sai-kung": { "zh-Hant": "西貢區", "zh-Hans": "西贡区", en: "Sai Kung" },
    "islands": { "zh-Hant": "離島區", "zh-Hans": "离岛区", en: "Islands" },
  };

  var LANG_KEY = "hkfm-lang";
  var THEME_KEY = "hkfm-theme";
  var LANGS = ["zh-Hant", "zh-Hans", "en"];
  var lang = "zh-Hant";

  function readStored(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  }
  function writeStored(key, value) {
    try { window.localStorage.setItem(key, value); } catch (e) { /* private mode */ }
  }

  function format(str, vars) {
    if (!vars) return str;
    return str.replace(/\{(\w+)\}/g, function (m, k) {
      return vars[k] != null ? String(vars[k]) : m;
    });
  }

  function t(key, vars) {
    var table = STRINGS[lang] || STRINGS["zh-Hant"];
    var s = table[key];
    if (s == null) s = STRINGS["zh-Hant"][key] || key;
    return format(s, vars);
  }

  function getLang() { return lang; }

  function setLang(next) {
    if (LANGS.indexOf(next) === -1) return;
    lang = next;
    writeStored(LANG_KEY, next);
    document.documentElement.lang = next === "en" ? "en" : next === "zh-Hans" ? "zh-Hans" : "zh-Hant";
    applyStatic();
    document.dispatchEvent(new CustomEvent("hkfm:langchange", { detail: { lang: next } }));
  }

  function districtName(id) {
    var n = DISTRICT_NAMES[id];
    return n ? n[lang] || n["zh-Hant"] : id;
  }

  function locale() { return t("localeTag"); }

  function applyStatic() {
    document.querySelectorAll("[data-i18n]").forEach(function (node) {
      node.textContent = t(node.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-aria]").forEach(function (node) {
      node.setAttribute("aria-label", t(node.getAttribute("data-i18n-aria")));
    });
    document.querySelectorAll("[data-i18n-alt]").forEach(function (node) {
      node.setAttribute("alt", t(node.getAttribute("data-i18n-alt")));
    });
    document.querySelectorAll("[data-i18n-title]").forEach(function (node) {
      node.setAttribute("title", t(node.getAttribute("data-i18n-title")));
    });
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      var on = btn.getAttribute("data-lang-btn") === lang;
      btn.classList.toggle("is-on", on);
      btn.setAttribute("aria-pressed", on ? "true" : "false");
    });
  }

  function init() {
    var stored = readStored(LANG_KEY);
    if (LANGS.indexOf(stored) !== -1) {
      lang = stored;
    } else {
      var nav = (navigator.language || "").toLowerCase();
      if (nav.indexOf("en") === 0) lang = "en";
      else if (nav === "zh-cn" || nav.indexOf("zh-hans") === 0) lang = "zh-Hans";
      else lang = "zh-Hant";
    }
    document.documentElement.lang = lang === "en" ? "en" : lang;
    applyStatic();
  }

  window.HKFM_I18N = {
    t: t,
    init: init,
    getLang: getLang,
    setLang: setLang,
    districtName: districtName,
    locale: locale,
    applyStatic: applyStatic,
    readStored: readStored,
    writeStored: writeStored,
    THEME_KEY: THEME_KEY,
    LANG_KEY: LANG_KEY,
  };
})();
