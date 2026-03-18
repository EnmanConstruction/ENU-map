(function () {
  // =========================
  // ENU MAP ENGINE
  // =========================

  // Clean up previous hot reloads
  if (window.__enuMap) {
    try { window.__enuMap.remove(); } catch (e) {}
    window.__enuMap = null;
  }

  // =========================
  // CONFIG
  // =========================
  const CONFIG = {
    // Later, ENU will give us published Google Sheet CSV links
    PUBLIC_DATA_URL: null,
    INTERNAL_DATA_URL: null,

    // App behavior
    USE_REMOTE_PUBLIC_DATA: false,
    USE_REMOTE_INTERNAL_DATA: false,

    DEFAULT_CENTER: [53.5444, -113.4909],
    DEFAULT_ZOOM: 11,
    MIN_ZOOM: 9,
    MAX_ZOOM: 19
  };

  // =========================
  // FALLBACK DATA
  // =========================
  // This keeps the app working even before ENU provides live sheet links.
  const FALLBACK_PUBLIC_DATA = [
    { name:"Oliver",      lat:53.544,  lng:-113.516, permits:210, infill:120, enuPresence:true,  ward:"O-day'min", councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Downtown",    lat:53.545,  lng:-113.495, permits:260, infill: 80, enuPresence:true,  ward:"O-day'min", councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Strathcona",  lat:53.522,  lng:-113.501, permits:180, infill:110, enuPresence:true,  ward:"papastew",  councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Westmount",   lat:53.554,  lng:-113.543, permits:120, infill: 85, enuPresence:false, ward:"O-day'min", councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Garneau",     lat:53.5225, lng:-113.520, permits:140, infill: 70, enuPresence:false, ward:"papastew",  councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Glenora",     lat:53.553,  lng:-113.566, permits: 90, infill: 60, enuPresence:false, ward:"O-day'min", councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Ritchie",     lat:53.512,  lng:-113.485, permits:100, infill: 75, enuPresence:true,  ward:"papastew",  councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Highlands",   lat:53.569,  lng:-113.429, permits: 80, infill: 50, enuPresence:false, ward:"(mock)",     councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Bonnie Doon", lat:53.526,  lng:-113.468, permits: 95, infill: 55, enuPresence:false, ward:"papastew",   councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Keswick",     lat:53.415,  lng:-113.622, permits: 60, infill: 15, enuPresence:false, ward:"(mock)",     councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Windermere",  lat:53.431,  lng:-113.627, permits: 70, infill: 20, enuPresence:false, ward:"(mock)",     councillor:"TBD", leader:"", leaderEmail:"", notes:"" },
    { name:"Laurel",      lat:53.448,  lng:-113.377, permits: 85, infill: 18, enuPresence:false, ward:"(mock)",     councillor:"TBD", leader:"", leaderEmail:"", notes:"" }
  ];

  // Internal strategy data placeholder for future use
  const FALLBACK_INTERNAL_DATA = [
    { name:"Oliver", volunteers:4, lawnSigns:12, petitionSignatures:34, engagementScore:8, priorityLevel:"High", notes:"Strong support base" },
    { name:"Westmount", volunteers:1, lawnSigns:2, petitionSignatures:5, engagementScore:3, priorityLevel:"Medium", notes:"Needs more support" },
    { name:"Garneau", volunteers:0, lawnSigns:0, petitionSignatures:2, engagementScore:2, priorityLevel:"High", notes:"Pressure area, weak engagement" }
  ];

  // =========================
  // APP STATE
  // =========================
  const state = {
    filters: {
      ward: null
    },
    datasets: {
      publicMap: [],
      internalStrategy: []
    },
    ui: {
      activeDetails: null
    }
  };

  // =========================
  // HELPERS
  // =========================
  function toBool(v) {
    const s = String(v ?? "").trim().toLowerCase();
    return s === "yes" || s === "true" || s === "1" || s === "y";
  }

  function toNum(v) {
    if (v === null || v === undefined || v === "") return 0;
    const n = Number(String(v).replace(/,/g, "").trim());
    return Number.isFinite(n) ? n : 0;
  }

  function uniqueWards(list) {
    return [...new Set(list.map(d => d.ward).filter(Boolean))];
  }

  function fitToWard(ward) {
    const rows = state.datasets.publicMap.filter(d => d.ward === ward);
    const pts = rows.map(d => [d.lat, d.lng]).filter(p => Number.isFinite(p[0]) && Number.isFinite(p[1]));
    if (!pts.length || !window.__enuMap) return;
    const bounds = L.latLngBounds(pts);
    window.__enuMap.fitBounds(bounds.pad(0.2));
  }

  function colorByInfill(n) {
    if (n >= 140) return "#ef4444";
    if (n >= 90) return "#f59e0b";
    return "#22c55e";
  }

  function scaleIntensity(n) {
    const max = 320;
    return Math.max(0.1, Math.min(n / max, 1));
  }

  function getFilteredPublicRows() {
    const rows = state.datasets.publicMap;
    if (!state.filters.ward) return rows;
    return rows.filter(d => d.ward === state.filters.ward);
  }

  function getInternalByName(name) {
    return state.datasets.internalStrategy.find(d => d.name === name) || null;
  }

  // =========================
  // CSV PARSER
  // =========================
  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cur = "";
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      const n = text[i + 1];

      if (c === '"' && inQuotes && n === '"') {
        cur += '"';
        i++;
        continue;
      }

      if (c === '"') {
        inQuotes = !inQuotes;
        continue;
      }

      if (c === "," && !inQuotes) {
        row.push(cur);
        cur = "";
        continue;
      }

      if ((c === "\n" || c === "\r") && !inQuotes) {
        if (cur !== "" || row.length) {
          row.push(cur);
          rows.push(row);
          row = [];
          cur = "";
        }
        continue;
      }

      cur += c;
    }

    if (cur !== "" || row.length) {
      row.push(cur);
      rows.push(row);
    }

    return rows;
  }

  // =========================
  // DATA LOADERS
  // =========================
  async function loadRemoteCSV(url) {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Failed to fetch CSV: ${res.status}`);
    const text = await res.text();
    return parseCSV(text).filter(r => r.length);
  }

  async function loadPublicData() {
    if (!CONFIG.USE_REMOTE_PUBLIC_DATA || !CONFIG.PUBLIC_DATA_URL) {
      console.log("Using fallback public map data.");
      return FALLBACK_PUBLIC_DATA;
    }

    try {
      const grid = await loadRemoteCSV(CONFIG.PUBLIC_DATA_URL);
      const header = grid.shift().map(h => h.trim().toLowerCase());
      const idx = (name) => header.indexOf(name.toLowerCase());

      const rows = grid.map(r => ({
        name: r[idx("name")] || "",
        ward: r[idx("ward")] || "",
        councillor: r[idx("councillor")] || "TBD",
        enuPresence: toBool(r[idx("enuPresence")]),
        permits: toNum(r[idx("permits")]),
        infill: toNum(r[idx("infill")]),
        lat: toNum(r[idx("lat")]),
        lng: toNum(r[idx("lng")]),
        leader: r[idx("leader")] || "",
        leaderEmail: r[idx("leaderEmail")] || "",
        notes: r[idx("notes")] || ""
      }))
      .filter(r => r.name && Number.isFinite(r.lat) && Number.isFinite(r.lng));

      console.log(`Loaded ${rows.length} public rows from remote source.`);
      return rows.length ? rows : FALLBACK_PUBLIC_DATA;
    } catch (err) {
      console.error("Public data load failed. Falling back.", err);
      return FALLBACK_PUBLIC_DATA;
    }
  }

  async function loadInternalData() {
    if (!CONFIG.USE_REMOTE_INTERNAL_DATA || !CONFIG.INTERNAL_DATA_URL) {
      console.log("Using fallback internal strategy data.");
      return FALLBACK_INTERNAL_DATA;
    }

    try {
      const grid = await loadRemoteCSV(CONFIG.INTERNAL_DATA_URL);
      const header = grid.shift().map(h => h.trim().toLowerCase());
      const idx = (name) => header.indexOf(name.toLowerCase());

      const rows = grid.map(r => ({
        name: r[idx("name")] || "",
        volunteers: toNum(r[idx("volunteers")]),
        lawnSigns: toNum(r[idx("lawnSigns")]),
        petitionSignatures: toNum(r[idx("petitionSignatures")]),
        engagementScore: toNum(r[idx("engagementScore")]),
        priorityLevel: r[idx("priorityLevel")] || "",
        notes: r[idx("notes")] || ""
      })).filter(r => r.name);

      console.log(`Loaded ${rows.length} internal rows from remote source.`);
      return rows.length ? rows : FALLBACK_INTERNAL_DATA;
    } catch (err) {
      console.error("Internal data load failed. Falling back.", err);
      return FALLBACK_INTERNAL_DATA;
    }
  }

  // =========================
  // MAP INIT
  // =========================
  const map = L.map("map", {
    zoomControl: false,
    minZoom: CONFIG.MIN_ZOOM,
    maxZoom: CONFIG.MAX_ZOOM
  }).setView(CONFIG.DEFAULT_CENTER, CONFIG.DEFAULT_ZOOM);

  window.__enuMap = map;

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  // =========================
  // LAYERS
  // =========================
  const presenceLayer = L.layerGroup().addTo(map);
  const hotspotLayer = L.layerGroup().addTo(map);
  const gapsLayer = L.layerGroup().addTo(map);
  let heatLayer = null;

  // =========================
  // UI BUILDERS
  // =========================
  function buildWardChips() {
    const bar = document.getElementById("filters");
    if (!bar) return;

    bar.innerHTML = "";

    const allChip = document.createElement("span");
    allChip.className = "chip reset active";
    allChip.textContent = "All wards";
    allChip.addEventListener("click", () => {
      state.filters.ward = null;
      document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
      allChip.classList.add("active");
      renderAll();
    });
    bar.appendChild(allChip);

    uniqueWards(state.datasets.publicMap).forEach(ward => {
      const chip = document.createElement("span");
      chip.className = "chip";
      chip.textContent = ward;
      chip.addEventListener("click", () => {
        state.filters.ward = ward;
        document.querySelectorAll(".chip").forEach(c => c.classList.remove("active"));
        chip.classList.add("active");
        renderAll();
        fitToWard(ward);
      });
      bar.appendChild(chip);
    });
  }

  function setDetails(row) {
    const box = document.getElementById("details");
    if (!box) return;

    if (!row) {
      box.classList.add("hidden");
      box.innerHTML = "";
      return;
    }

    const internal = getInternalByName(row.name);

    box.classList.remove("hidden");
    box.innerHTML = `
      <h3>${row.name}</h3>
      <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
        <span class="badge ${row.enuPresence ? "yes" : "no"}">${row.enuPresence ? "ENU Presence: Yes" : "ENU Presence: No"}</span>
        <span class="badge">Ward: ${row.ward}</span>
      </div>

      <div class="row"><span>Active permits</span><strong>${row.permits.toLocaleString()}</strong></div>
      <div class="row"><span>Infill permits</span><strong>${row.infill.toLocaleString()}</strong></div>
      <div class="row"><span>Councillor</span><strong>${row.councillor}</strong></div>

      ${row.leader ? `<div class="row"><span>ENU leader</span><strong>${row.leader}</strong></div>` : ""}
      ${row.leaderEmail ? `<div class="row"><span>Leader email</span><strong>${row.leaderEmail}</strong></div>` : ""}
      ${row.notes ? `<div class="row"><span>Public notes</span><strong>${row.notes}</strong></div>` : ""}

      ${internal ? `
        <hr style="border-color:#1b2648; margin:10px 0;">
        <div class="row"><span>Volunteers</span><strong>${internal.volunteers}</strong></div>
        <div class="row"><span>Lawn signs</span><strong>${internal.lawnSigns}</strong></div>
        <div class="row"><span>Petition signatures</span><strong>${internal.petitionSignatures}</strong></div>
        <div class="row"><span>Engagement score</span><strong>${internal.engagementScore}</strong></div>
        <div class="row"><span>Priority</span><strong>${internal.priorityLevel || "-"}</strong></div>
        ${internal.notes ? `<div class="row"><span>Internal notes</span><strong>${internal.notes}</strong></div>` : ""}
      ` : ""}
    `;
  }

  // =========================
  // RENDERERS
  // =========================
  function renderPresence(rows) {
    presenceLayer.clearLayers();

    rows.forEach(d => {
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: d.enuPresence ? 11 : 10,
        weight: 2,
        color: d.enuPresence ? "#0038A8" : "#CE1126",
        fillColor: d.enuPresence ? "#0038A8" : "#CE1126",
        fillOpacity: 0.5
      })
      .bindPopup(`
        <div><strong>${d.name}</strong></div>
        <div><strong>ENU presence:</strong> ${d.enuPresence ? "Yes" : "No"}</div>
        <div><strong>Active permits:</strong> ${d.permits.toLocaleString()}</div>
        <div><strong>Ward:</strong> ${d.ward}</div>
        <div><strong>Councillor:</strong> ${d.councillor}</div>
      `)
      .on("click", () => setDetails(d));

      presenceLayer.addLayer(marker);
    });
  }

  function renderHeat(rows) {
    const toggle = document.getElementById("toggle-heat");
    const points = rows.map(d => [d.lat, d.lng, scaleIntensity(d.permits)]);

    if (heatLayer) {
      map.removeLayer(heatLayer);
      heatLayer = null;
    }

    heatLayer = L.heatLayer(points, {
      radius: 28,
      blur: 18,
      maxZoom: 14,
      minOpacity: 0.2
    });

    if (!toggle || toggle.checked) {
      heatLayer.addTo(map);
    }
  }

  function renderHotspots(rows) {
    const toggle = document.getElementById("toggle-hotspots");
    hotspotLayer.clearLayers();

    rows.filter(d => d.infill >= 90).forEach(d => {
      const hotspot = L.circleMarker([d.lat, d.lng], {
        radius: Math.min(18, 8 + d.infill / 15),
        weight: 1.5,
        color: "#fff",
        fillColor: colorByInfill(d.infill),
        fillOpacity: 0.85
      }).bindPopup(`
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <strong>${d.name}</strong>
          <span style="font-size:11px;border:1px solid #1b2648;padding:2px 6px;border-radius:999px;">Infill hotspot</span>
        </div>
        <div>Infill-type permits: <strong>${d.infill.toLocaleString()}</strong></div>
      `);

      hotspotLayer.addLayer(hotspot);
    });

    if (toggle && !toggle.checked) {
      map.removeLayer(hotspotLayer);
    } else {
      hotspotLayer.addTo(map);
    }
  }

  function renderGaps(rows) {
    const toggle = document.getElementById("toggle-gaps");
    gapsLayer.clearLayers();

    rows
      .filter(d => ((d.permits >= 90 && d.infill < 60) || (!d.enuPresence && d.permits >= 80)))
      .forEach(d => {
        const gap = L.circleMarker([d.lat, d.lng], {
          radius: 10,
          weight: 1.2,
          dashArray: "4,3",
          color: "#f59e0b",
          fillColor: "#f59e0b",
          fillOpacity: 0.25
        }).bindPopup(`
          <div><strong>${d.name}</strong></div>
          <div><strong>Needs local advocates</strong></div>
          <div>Permits: <strong>${d.permits.toLocaleString()}</strong>, Infill: <strong>${d.infill.toLocaleString()}</strong></div>
        `);

        gapsLayer.addLayer(gap);
      });

    if (toggle && !toggle.checked) {
      map.removeLayer(gapsLayer);
    } else {
      gapsLayer.addTo(map);
    }
  }

  function renderKPIs(rows) {
    const permits = rows.reduce((sum, r) => sum + r.permits, 0);
    const yes = rows.filter(r => r.enuPresence).length;
    const no = rows.filter(r => !r.enuPresence).length;

    const kPermits = document.getElementById("k-permits");
    const kYes = document.getElementById("k-enu-yes");
    const kNo = document.getElementById("k-enu-no");

    if (kPermits) kPermits.textContent = permits.toLocaleString();
    if (kYes) kYes.textContent = yes.toLocaleString();
    if (kNo) kNo.textContent = no.toLocaleString();
  }

  function renderAll() {
    const rows = getFilteredPublicRows();

    renderPresence(rows);
    renderHeat(rows);
    renderHotspots(rows);
    renderGaps(rows);
    renderKPIs(rows);
    setDetails(null);
  }

  // =========================
  // EVENT HOOKS
  // =========================
  ["toggle-heat", "toggle-hotspots", "toggle-gaps"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderAll);
  });

  // =========================
  // BOOT
  // =========================
  async function boot() {
    const [publicRows, internalRows] = await Promise.all([
      loadPublicData(),
      loadInternalData()
    ]);

    state.datasets.publicMap = publicRows;
    state.datasets.internalStrategy = internalRows;

    buildWardChips();
    renderAll();

    console.log("ENU map engine initialized.");
    console.log("Public rows:", state.datasets.publicMap.length);
    console.log("Internal rows:", state.datasets.internalStrategy.length);
  }

  boot().catch(err => {
    console.error("Failed to boot ENU map engine:", err);
  });
})();

// =========================
// MOBILE DRAWER TOGGLE
// =========================
(function () {
  const side = document.getElementById("sidepanel");
  const btn = document.getElementById("panelToggle");

  let backdrop = document.querySelector(".backdrop");
  if (!backdrop) {
    backdrop = document.createElement("div");
    backdrop.className = "backdrop";
    document.body.appendChild(backdrop);
  }

  function closePanel() {
    side?.classList.remove("open");
    btn?.setAttribute("aria-expanded", "false");
    backdrop.classList.remove("show");
    setTimeout(() => window.__enuMap && window.__enuMap.invalidateSize(), 200);
  }

  function openPanel() {
    side?.classList.add("open");
    btn?.setAttribute("aria-expanded", "true");
    backdrop.classList.add("show");
    setTimeout(() => window.__enuMap && window.__enuMap.invalidateSize(), 200);
  }

  btn?.addEventListener("click", () => {
    side?.classList.contains("open") ? closePanel() : openPanel();
  });

  backdrop.addEventListener("click", closePanel);
})();