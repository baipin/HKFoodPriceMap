/* HK Food Price Map — client.
 * Reads data/districts.json (written by the crawler) and renders the map,
 * district list and detail panel. All external text is inserted with
 * textContent / DOM nodes (never innerHTML) to avoid XSS from scraped posts.
 * Depends on js/i18n.js (window.HKFM_I18N).
 */
(function () {
  "use strict";

  var DATA_URL = "data/districts.json";
  var TILE_LIGHT = "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png";
  var I18N = window.HKFM_I18N;
  var t = I18N.t;

  var state = { db: null, activeId: null, markers: {}, map: null, tiles: null };

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === "class") node.className = attrs[k];
        else if (k === "text") node.textContent = attrs[k];
        else if (k === "style") node.setAttribute("style", attrs[k]);
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }

  // Five price bands (HKD per person) + no-data grey.
  var TIERS = [
    { max: 40, color: "#2e7d32" },
    { max: 60, color: "#8bc34a" },
    { max: 80, color: "#fdd835" },
    { max: 150, color: "#fb8c00" },
    { max: Infinity, color: "#e53935" },
  ];

  function tier(avg) {
    if (avg == null) return { color: "#bdbdbd" };
    for (var i = 0; i < TIERS.length; i++) {
      if (avg < TIERS[i].max) return TIERS[i];
    }
    return TIERS[TIERS.length - 1];
  }

  function fmtPrice(v) {
    return v == null ? "—" : "$" + v;
  }

  function safeHttpUrl(u) {
    try {
      var url = new URL(u);
      return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
    } catch (e) {
      return null;
    }
  }

  function fmtTime(iso) {
    if (!iso) return null;
    var d = new Date(iso);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleString(I18N.locale(), {
      year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    });
  }

  function median(nums) {
    if (!nums.length) return null;
    var s = nums.slice().sort(function (a, b) { return a - b; });
    var m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  }

  function districtList() {
    return Object.keys(state.db.districts).map(function (k) { return state.db.districts[k]; });
  }

  function isDark() {
    return document.documentElement.getAttribute("data-theme") === "dark";
  }

  /* ---------- Theme ---------- */
  function setTheme(theme, persist) {
    document.documentElement.setAttribute("data-theme", theme);
    if (persist) I18N.writeStored(I18N.THEME_KEY, theme);
    var btn = document.getElementById("theme-toggle");
    var label = t(theme === "dark" ? "themeToLight" : "themeToDark");
    btn.setAttribute("aria-label", label);
    btn.setAttribute("title", label);
    if (state.map) setTiles(theme === "dark");
  }

  // OpenStreetMap tiles for both themes (no API key needed). Dark mode is done
  // with a CSS filter on the tile pane, so no third-party key-based basemap is used.
  function setTiles(dark) {
    if (!state.map) return;
    if (!state.tiles) {
      state.tiles = L.tileLayer(TILE_LIGHT, {
        maxZoom: 18,
        attribution: "&copy; OpenStreetMap contributors",
      }).addTo(state.map);
    }
    state.map.getContainer().classList.toggle("map-dark", !!dark);
  }

  /* ---------- Map ---------- */
  // Bounds that cover all of Hong Kong incl. Islands and North.
  var HK_BOUNDS = [[22.13, 113.80], [22.58, 114.47]];

  function initMap() {
    var map = L.map("map", {
      zoomControl: true,
      scrollWheelZoom: true,
      minZoom: 10,
      maxZoom: 15,
    });
    state.map = map;
    map.fitBounds(HK_BOUNDS, { padding: [16, 16] });
    setTiles(isDark());
    window.addEventListener("resize", function () { map.invalidateSize(); });
    // The container may still be laying out when Leaflet first measures it.
    setTimeout(function () { map.invalidateSize(); }, 300);

    districtList().forEach(function (d) {
      var marker = L.marker([d.lat, d.lng], {
        icon: makeIcon(d, false),
        title: I18N.districtName(d.id),
        alt: I18N.districtName(d.id),
        keyboard: true,
      }).addTo(map);
      marker.on("click", function () { select(d.id); });
      state.markers[d.id] = marker;
    });
  }

  // Two-line pill: district name (small) over price (bold); colored by price tier,
  // filled when selected. Escaped because names come from translations only,
  // but the price is numeric anyway.
  function escapeHtml(s) {
    return String(s).replace(/[<>&"']/g, function (ch) {
      return { "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }

  function makeIcon(d, active) {
    var c = tier(d.avgPerPerson).color;
    var price = d.avgPerPerson == null ? "—" : fmtPrice(d.avgPerPerson);
    return L.divIcon({
      className: "",
      html:
        '<div class="price-marker' + (active ? " is-active" : "") + '" style="--c:' + c + '">' +
        '<span class="pm-name">' + escapeHtml(I18N.districtName(d.id)) + "</span>" +
        '<span class="pm-price">' + escapeHtml(price) + "</span></div>",
      iconSize: null,
    });
  }

  function refreshMarker(id) {
    var marker = state.markers[id];
    if (!marker) return;
    marker.options.title = I18N.districtName(id);
    marker.setIcon(makeIcon(state.db.districts[id], state.activeId === id));
  }

  /* ---------- District list ---------- */
  function renderList() {
    var ul = document.getElementById("district-list");
    ul.textContent = "";
    districtList()
      .slice()
      .sort(function (a, b) {
        if (a.avgPerPerson == null && b.avgPerPerson == null) return 0;
        if (a.avgPerPerson == null) return 1;
        if (b.avgPerPerson == null) return -1;
        return a.avgPerPerson - b.avgPerPerson;
      })
      .forEach(function (d) {
        var name = I18N.districtName(d.id);
        var c = tier(d.avgPerPerson).color;
        var btn = el("button", {
          type: "button",
          "aria-label": name + " " + (d.avgPerPerson == null ? t("noData") : fmtPrice(d.avgPerPerson)),
        }, [
          el("span", { class: "dot", style: "background:" + c }),
          el("span", { class: "name" }, [
            name,
            I18N.getLang() === "en" ? null : el("small", { text: d.en }),
          ]),
          d.avgPerPerson == null
            ? el("span", { class: "price none", text: t("noData") })
            : el("span", { class: "price", text: fmtPrice(d.avgPerPerson) }),
        ]);
        btn.addEventListener("click", function () { select(d.id); });
        ul.appendChild(el("li", { "data-id": d.id }, [btn]));
      });
    markActiveInList();
  }

  function markActiveInList() {
    document.querySelectorAll("#district-list li").forEach(function (li) {
      li.classList.toggle("is-active", li.getAttribute("data-id") === state.activeId);
    });
  }

  /* ---------- Detail ---------- */
  function renderDetail(id) {
    var d = state.db.districts[id];
    var root = document.getElementById("detail");
    root.textContent = "";

    var head = el("div", { class: "detail__head" }, [
      el("h2", { text: I18N.districtName(id) }),
      I18N.getLang() === "en" ? null : el("span", { class: "en", text: d.en }),
    ]);

    var stats = el("div", { class: "stats" }, [
      stat(t("statMedian"), d.medianPerPerson),
      stat(t("statMean"), d.avgPerPerson),
      el("div", { class: "stat" }, [
        el("div", { class: "stat__label", text: t("statSamples") }),
        el("div", { class: "stat__value", text: String(d.priceSamples || 0) }),
      ]),
      el("div", { class: "stat" }, [
        el("div", { class: "stat__label", text: t("statPosts") }),
        el("div", { class: "stat__value", text: String(d.postCount || 0) }),
      ]),
    ]);

    var posts = (d.posts || []).slice();
    var restaurants = aggregateRestaurants(posts);

    var updated = fmtTime(d.updatedAt);
    var chips = el("div", { class: "chips" }, [
      el("span", { class: "chip", text: updated ? t("updatedAt", { time: updated }) : t("notUpdated") }),
    ]);

    var restTitle = el("h3", { class: "section-title", text: t("restaurantsTitle") });
    var restBox = restaurants.length
      ? el("div", { class: "chips" }, restaurants.slice(0, 40).map(function (r) {
          return el("span", { class: "chip" }, [
            el("b", { text: r.name }),
            document.createTextNode(" " + (r.price == null ? "" : t("perPerson", { v: r.price }) + " · ") +
              t("postsCount", { n: r.count })),
          ]);
        }))
      : el("div", { class: "empty", text: t("noRestaurants") });

    var postTitle = el("h3", { class: "section-title", text: t("postsTitle") });
    var postBox;
    if (!posts.length) {
      postBox = el("div", { class: "empty", text: state.db.status === "empty"
        ? t("noPostsYet")
        : t("noPostsDistrict") });
    } else {
      postBox = el("ul", { class: "posts" }, posts.slice(0, 50).map(renderPost));
    }

    root.appendChild(head);
    root.appendChild(stats);
    root.appendChild(chips);
    root.appendChild(restTitle);
    root.appendChild(restBox);
    root.appendChild(postTitle);
    root.appendChild(postBox);
  }

  function stat(label, value) {
    return el("div", { class: "stat" }, [
      el("div", { class: "stat__label", text: label }),
      el("div", { class: "stat__value" }, [
        document.createTextNode(value == null ? "—" : "$" + value),
        value == null ? null : el("small", { text: " HKD" }),
      ]),
    ]);
  }

  function renderPost(p) {
    var href = safeHttpUrl(p.url);
    var titleText = p.title || p.restaurant || t("untitled");
    var titleNode = href
      ? el("a", { href: href, target: "_blank", rel: "noopener noreferrer nofollow", text: titleText })
      : document.createTextNode(titleText);
    var meta = [el("span", { class: "badge", text: p.source || t("sourceDefault") })];
    if (p.restaurant) meta.push(el("span", { text: p.restaurant }));
    if (p.perPerson != null) meta.push(el("span", { text: t("perPerson", { v: p.perPerson }) }));
    var when = fmtTime(p.fetchedAt);
    if (when) meta.push(el("span", { text: when }));
    return el("li", { class: "post" }, [
      el("div", { class: "post__meta" }, meta),
      el("div", { class: "post__title" }, [titleNode]),
      p.excerpt ? el("p", { class: "post__excerpt", text: p.excerpt }) : null,
    ]);
  }

  function aggregateRestaurants(posts) {
    var map = {};
    posts.forEach(function (p) {
      if (!p.restaurant) return;
      var r = map[p.restaurant] || (map[p.restaurant] = { name: p.restaurant, prices: [], count: 0 });
      r.count += 1;
      if (p.perPerson != null) r.prices.push(p.perPerson);
    });
    return Object.keys(map)
      .map(function (k) {
        var r = map[k];
        return { name: r.name, count: r.count, price: median(r.prices) };
      })
      .sort(function (a, b) { return b.count - a.count; });
  }

  /* ---------- Selection ---------- */
  function select(id) {
    var prev = state.activeId;
    state.activeId = id;
    if (prev) refreshMarker(prev);
    refreshMarker(id);
    markActiveInList();
    renderDetail(id);
    var d = state.db.districts[id];
    if (state.map) state.map.panTo([d.lat, d.lng], { animate: true });
    if (window.matchMedia("(max-width: 960px)").matches) {
      document.getElementById("detail").scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ---------- Header / footer ---------- */
  function renderMeta() {
    var db = state.db;
    if (!db) return;
    // Only show a crawl time once the crawler has actually written results.
    var when = db.status === "ok" ? fmtTime(db.generatedAt) : null;

    var footer = document.getElementById("footer-crawl");
    footer.textContent = when ? t("footerCrawled", { time: when }) : t("footerNotRun");
  }

  // Re-render everything that contains translated text (after language change).
  function rerenderAll() {
    if (!state.db) return;
    renderMeta();
    renderList();
    refreshAllMarkers();
    if (state.activeId) renderDetail(state.activeId);
    setTheme(isDark() ? "dark" : "light", false);
  }

  function refreshAllMarkers() {
    Object.keys(state.markers).forEach(refreshMarker);
  }

  /* ---------- Controls ---------- */
  function wireControls() {
    document.querySelectorAll("[data-lang-btn]").forEach(function (btn) {
      btn.addEventListener("click", function () {
        I18N.setLang(btn.getAttribute("data-lang-btn"));
      });
    });
    document.getElementById("theme-toggle").addEventListener("click", function () {
      setTheme(isDark() ? "light" : "dark", true);
    });
    document.addEventListener("hkfm:langchange", function () {
      document.title = t("appTitle") + " · " + "Hong Kong Food Price Map";
      rerenderAll();
    });
  }

  /* ---------- Boot ---------- */
  function boot() {
    I18N.init();
    var stored = I18N.readStored(I18N.THEME_KEY);
    setTheme(stored === "dark" || stored === "light" ? stored : (isDark() ? "dark" : "light"), false);
    wireControls();

    fetch(DATA_URL, { cache: "no-cache" })
      .then(function (r) {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then(function (db) {
        state.db = db;
        initMap();
        renderMeta();
        renderList();
        var first = districtList().find(function (d) { return d.postCount > 0; });
        if (first) select(first.id);
      })
      .catch(function (err) {
        document.getElementById("footer-crawl").textContent = t("loadFailed");
        document.getElementById("detail").textContent = t("errorDetail", { msg: err.message });
      });
  }

  document.addEventListener("DOMContentLoaded", boot);
})();
