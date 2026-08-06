(async function () {
  const statusBox = document.getElementById("mapStatus");
  const dataStatus = document.getElementById("dataStatus");

  function showMapError(message) {
    if (!statusBox) return;
    statusBox.textContent = message;
    statusBox.classList.remove("hidden");
  }

  if (!window.L || typeof window.L.map !== "function" || typeof window.L.heatLayer !== "function") {
    showMapError("The interactive map could not load. Please check your connection and refresh the page.");
    return;
  }

  if (window.__enuMap) {
    try { window.__enuMap.remove(); } catch (e) {}
    window.__enuMap = null;
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, character => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[character]);
  }

  function updateDataStatus(result) {
    if (!dataStatus) return;
    dataStatus.classList.remove("live", "fallback");

    if (result.source === "live") {
      dataStatus.classList.add("live");
      const date = result.updatedAt instanceof Date && !Number.isNaN(result.updatedAt.valueOf())
        ? result.updatedAt.toLocaleDateString("en-CA", { year: "numeric", month: "short", day: "numeric" })
        : "today";
      dataStatus.textContent = `Live public data • Updated ${date}`;
      if (result.issues.length) dataStatus.title = `${result.issues.length} invalid sheet row(s) were skipped.`;
      return;
    }

    if (result.source === "fallback") {
      dataStatus.classList.add("fallback");
      dataStatus.textContent = "City-backed snapshot • Live sheet not connected";
      dataStatus.title = result.error || "The live sheet could not be loaded.";
      return;
    }

    dataStatus.textContent = "City-backed snapshot • ENU presence awaiting confirmation";
  }

  if (!window.ENUData || typeof window.ENUData.loadPublicData !== "function") {
    showMapError("The map data tools could not load. Please refresh the page.");
    return;
  }

  const publicDataResult = await window.ENUData.loadPublicData(window.ENU_DATA_CONFIG || {}, FALLBACK_PUBLIC_DATA);
  updateDataStatus(publicDataResult);

  const state = {
    filters: { ward: null },
    datasets: {
      publicMap: publicDataResult.rows
    }
  };

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

  function colorByHousingGrowth(n) {
    if (n >= 100) return "#ef4444";
    if (n >= 40) return "#f59e0b";
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

  function rowFromUrl() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const requestedName = params.get("neighbourhood")?.trim().toLocaleLowerCase("en-CA");
    if (!requestedName) return null;
    return state.datasets.publicMap.find(row => row.name.toLocaleLowerCase("en-CA") === requestedName) || null;
  }

  function neighbourhoodUrl(row) {
    const url = new URL(window.location.href);
    url.hash = new URLSearchParams({ neighbourhood: row.name }).toString();
    return url.toString();
  }

  function clearNeighbourhoodUrl() {
    if (!window.location.hash) return;
    history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
  }

  function calculatePriorityScore(row) {
    if (row.enuPresence === null) return null;
    const permitScore = Math.min(row.permits / 25, 10);
    const housingGrowthScore = Math.min(Math.log1p(row.infill) / Math.log1p(250) * 10, 10);
    const noPresenceBonus = row.enuPresence === false ? 3 : 0;
    const baselineAdvocacyNeed = 1.5;

    const score =
      (permitScore * 0.4) +
      (housingGrowthScore * 0.35) +
      noPresenceBonus +
      baselineAdvocacyNeed;

    return Number(score.toFixed(2));
  }

  function getPriorityLevel(score) {
    if (score === null) return "Unknown";
    if (score >= 7.5) return "High";
    if (score >= 4.5) return "Medium";
    return "Low";
  }

  function priorityColor(level) {
    if (level === "High") return "#ef4444";
    if (level === "Medium") return "#f59e0b";
    return "#22c55e";
  }

  function buildWardChips() {
    const bar = document.getElementById("filters");
    if (!bar) return;

    bar.innerHTML = "";

    const searchForm = document.createElement("form");
    searchForm.className = "neighbourhood-search";
    searchForm.setAttribute("role", "search");
    searchForm.innerHTML = `
      <label class="sr-only" for="neighbourhoodSearch">Find a neighbourhood</label>
      <input id="neighbourhoodSearch" list="neighbourhoodOptions" type="search" placeholder="Find a neighbourhood…" autocomplete="off" />
      <datalist id="neighbourhoodOptions"></datalist>
      <button type="submit">Find</button>
    `;
    const options = searchForm.querySelector("#neighbourhoodOptions");
    state.datasets.publicMap.forEach(row => {
      const option = document.createElement("option");
      option.value = row.name;
      options.appendChild(option);
    });
    searchForm.addEventListener("submit", event => {
      event.preventDefault();
      const input = searchForm.querySelector("#neighbourhoodSearch");
      const query = input.value.trim().toLocaleLowerCase("en-CA");
      const row = state.datasets.publicMap.find(item => item.name.toLocaleLowerCase("en-CA") === query);
      if (!row) {
        input.setCustomValidity("Choose a neighbourhood from the list.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      selectNeighbourhood(row);
    });
    bar.appendChild(searchForm);

    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "chip reset active";
    allChip.setAttribute("aria-pressed", "true");
    allChip.textContent = "All Wards";
    allChip.addEventListener("click", () => {
      clearNeighbourhoodUrl();
      state.filters.ward = null;
      document.querySelectorAll(".chip").forEach(c => {
        c.classList.remove("active");
        c.setAttribute("aria-pressed", "false");
      });
      allChip.classList.add("active");
      allChip.setAttribute("aria-pressed", "true");
      renderAll();
    });
    bar.appendChild(allChip);

    uniqueWards(state.datasets.publicMap).forEach(ward => {
      const chip = document.createElement("button");
      chip.type = "button";
      chip.className = "chip";
      chip.setAttribute("aria-pressed", "false");
      chip.textContent = ward === "O-day'min"
  ? "O-day'min Ward"
  : ward === "papastew"
  ? "papastew Ward"
  : ward;
      chip.addEventListener("click", () => {
        clearNeighbourhoodUrl();
        state.filters.ward = ward;
        document.querySelectorAll(".chip").forEach(c => {
          c.classList.remove("active");
          c.setAttribute("aria-pressed", "false");
        });
        chip.classList.add("active");
        chip.setAttribute("aria-pressed", "true");
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

    const score = calculatePriorityScore(row);
    const priority = getPriorityLevel(score);
    const presenceLabel = row.enuPresence === true ? "Yes" : row.enuPresence === false ? "No" : "Unknown";
    const presenceClass = row.enuPresence === true ? "yes" : row.enuPresence === false ? "no" : "unknown";
    const priorityBadge = score === null ? "" : `<span class="badge priority-${priority.toLowerCase()}">Priority: ${priority}</span>`;

    box.classList.remove("hidden");
    box.innerHTML = `
      <button class="details-close" type="button" aria-label="Close neighbourhood details">×</button>
      <h3>${escapeHtml(row.name)}</h3>
      <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
        <span class="badge ${presenceClass}">ENU Presence*: ${presenceLabel}</span>
        <span class="badge">Ward: ${escapeHtml(row.ward)}</span>
        ${priorityBadge}
      </div>

      <div class="row"><span>Active permits</span><strong>${row.permits.toLocaleString()}</strong></div>
      <div class="row"><span>New-home permits (24 mo.)</span><strong>${row.infill.toLocaleString()}</strong></div>
      <div class="row"><span>Priority score</span><strong>${score === null ? "Awaiting ENU status" : score}</strong></div>
      <div class="row"><span>Councillor</span><strong>${escapeHtml(row.councillor)}</strong></div>

      ${row.leader ? `<div class="row"><span>ENU leader</span><strong>${escapeHtml(row.leader)}</strong></div>` : ""}
      ${row.leaderEmail ? `<div class="row"><span>Leader email</span><strong>${escapeHtml(row.leaderEmail)}</strong></div>` : ""}
      ${row.notes ? `<div class="row"><span>Public notes</span><strong>${escapeHtml(row.notes)}</strong></div>` : ""}
      <p class="provisional-note">* ENU presence is provisional pending confirmation.</p>
      <button class="share-neighbourhood" type="button">Copy neighbourhood link</button>
      <span class="share-status" role="status" aria-live="polite"></span>
    `;

    box.querySelector(".details-close")?.addEventListener("click", () => {
      clearNeighbourhoodUrl();
      setDetails(null);
    });
    box.querySelector(".share-neighbourhood")?.addEventListener("click", async event => {
      const status = box.querySelector(".share-status");
      try {
        await navigator.clipboard.writeText(neighbourhoodUrl(row));
        event.currentTarget.textContent = "Link copied";
        if (status) status.textContent = "Ready to share.";
      } catch (error) {
        if (status) status.textContent = "Copy the URL from your browser to share this neighbourhood.";
      }
    });
  }

  const map = L.map("map", {
    zoomControl: false,
    minZoom: 9,
    maxZoom: 19
  }).setView([53.5444, -113.4909], 11);

  window.__enuMap = map;

  L.control.zoom({ position: "bottomright" }).addTo(map);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap contributors"
  }).addTo(map);

  const presenceLayer = L.layerGroup().addTo(map);
  const hotspotLayer = L.layerGroup().addTo(map);
  const gapsLayer = L.layerGroup().addTo(map);
  const priorityLayer = L.layerGroup().addTo(map);
  let heatLayer = null;

  function selectNeighbourhood(row, { updateUrl = true } = {}) {
    if (!row) return;
    const hadWardFilter = Boolean(state.filters.ward);
    state.filters.ward = null;
    if (hadWardFilter) renderAll();
    document.querySelectorAll(".chip").forEach(chip => {
      chip.classList.toggle("active", chip.classList.contains("reset"));
      chip.setAttribute("aria-pressed", chip.classList.contains("reset") ? "true" : "false");
    });
    if (updateUrl) history.replaceState(null, "", neighbourhoodUrl(row));
    map.setView([row.lat, row.lng], 14);
    setDetails(row);
    document.getElementById("sidepanel")?.classList.remove("open");
    document.getElementById("panelToggle")?.setAttribute("aria-expanded", "false");
    document.querySelector(".backdrop")?.classList.remove("show");
  }

  function restoreNeighbourhoodFromUrl() {
    const row = rowFromUrl();
    if (row) selectNeighbourhood(row, { updateUrl: false });
  }

  function renderPresence(rows) {
    presenceLayer.clearLayers();

    rows.forEach(d => {
      const isUnknown = d.enuPresence === null;
      const color = d.enuPresence === true ? "#0038A8" : d.enuPresence === false ? "#CE1126" : "#94a3b8";
      const presenceLabel = d.enuPresence === true ? "Yes" : d.enuPresence === false ? "No" : "Unknown";
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: isUnknown ? 5 : d.enuPresence ? 11 : 10,
        weight: isUnknown ? 1 : 2,
        color,
        fillColor: color,
        fillOpacity: isUnknown ? 0.35 : 0.5
      })
      .bindPopup(`
        <div><strong>${escapeHtml(d.name)}</strong></div>
        <div><strong>ENU presence*:</strong> ${presenceLabel}</div>
        <div><strong>Active permits:</strong> ${d.permits.toLocaleString()}</div>
        <div><strong>Ward:</strong> ${escapeHtml(d.ward)}</div>
        <div><strong>Councillor:</strong> ${escapeHtml(d.councillor)}</div>
      `)
      .on("click", () => selectNeighbourhood(d));

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

    rows.filter(d => d.infill >= 40).forEach(d => {
      const hotspot = L.circleMarker([d.lat, d.lng], {
        radius: Math.min(18, 8 + Math.log1p(d.infill) * 1.5),
        weight: 1.5,
        color: "#fff",
        fillColor: colorByHousingGrowth(d.infill),
        fillOpacity: 0.85
      }).bindPopup(`
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <strong>${escapeHtml(d.name)}</strong>
          <span style="font-size:11px;border:1px solid #1b2648;padding:2px 6px;border-radius:999px;">Housing-growth hotspot</span>
        </div>
        <div>New-home permits, trailing 24 months: <strong>${d.infill.toLocaleString()}</strong></div>
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
      .filter(d => ((d.permits >= 40 && d.infill < 20) || (d.enuPresence === false && d.permits >= 40)))
      .forEach(d => {
        const gap = L.circleMarker([d.lat, d.lng], {
          radius: 10,
          weight: 1.2,
          dashArray: "4,3",
          color: "#f59e0b",
          fillColor: "#f59e0b",
          fillOpacity: 0.25
        }).bindPopup(`
          <div><strong>${escapeHtml(d.name)}</strong></div>
          <div><strong>Needs local advocates</strong></div>
          <div>Active permits: <strong>${d.permits.toLocaleString()}</strong>, new-home permits: <strong>${d.infill.toLocaleString()}</strong></div>
        `);

        gapsLayer.addLayer(gap);
      });

    if (toggle && !toggle.checked) {
      map.removeLayer(gapsLayer);
    } else {
      gapsLayer.addTo(map);
    }
  }

  function renderPriority(rows) {
    const toggle = document.getElementById("toggle-priority");
    priorityLayer.clearLayers();

    rows.filter(d => d.enuPresence !== null).forEach(d => {
      const score = calculatePriorityScore(d);
      const level = getPriorityLevel(score);

      const priorityMarker = L.circleMarker([d.lat, d.lng], {
        radius: 18,
        weight: 2,
        color: priorityColor(level),
        fillColor: priorityColor(level),
        fillOpacity: 0.15
      }).bindPopup(`
        <div><strong>${escapeHtml(d.name)}</strong></div>
        <div><strong>Priority:</strong> ${level}</div>
        <div><strong>Priority score:</strong> ${score}</div>
      `);

      priorityLayer.addLayer(priorityMarker);
    });

    if (toggle && !toggle.checked) {
      map.removeLayer(priorityLayer);
    } else {
      priorityLayer.addTo(map);
    }
  }

  function renderKPIs(rows) {
    const permits = rows.reduce((sum, r) => sum + r.permits, 0);
    const yes = rows.filter(r => r.enuPresence === true).length;
    const no = rows.filter(r => r.enuPresence === false).length;
    const unknown = rows.filter(r => r.enuPresence === null).length;

    const priorityCounts = rows.filter(row => row.enuPresence !== null).reduce((acc, row) => {
      const level = getPriorityLevel(calculatePriorityScore(row));
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, { High: 0, Medium: 0, Low: 0 });

    document.getElementById("k-permits").textContent = permits.toLocaleString();
    document.getElementById("k-enu-yes").textContent = yes.toLocaleString();
    document.getElementById("k-enu-no").textContent = no.toLocaleString();
    document.getElementById("k-enu-unknown").textContent = unknown.toLocaleString();
    document.getElementById("k-priority-high").textContent = priorityCounts.High.toLocaleString();
    document.getElementById("k-priority-medium").textContent = priorityCounts.Medium.toLocaleString();
    document.getElementById("k-priority-low").textContent = priorityCounts.Low.toLocaleString();
  }

  function renderTopGrowth(rows) {
    const list = document.getElementById("topGrowthList");
    if (!list) return;
    list.innerHTML = "";
    [...rows]
      .sort((a, b) => b.infill - a.infill || b.permits - a.permits || a.name.localeCompare(b.name, "en-CA"))
      .slice(0, 5)
      .forEach((row, index) => {
        const item = document.createElement("li");
        const button = document.createElement("button");
        button.type = "button";
        button.innerHTML = `
          <span class="growth-rank">${index + 1}</span>
          <span class="growth-name">${escapeHtml(row.name)}<small>${escapeHtml(row.ward)}</small></span>
          <strong>${row.infill.toLocaleString()}<small>permits</small></strong>
        `;
        button.addEventListener("click", () => selectNeighbourhood(row));
        item.appendChild(button);
        list.appendChild(item);
      });
  }

  function renderAll() {
    const rows = getFilteredPublicRows();
    renderPresence(rows);
    renderHeat(rows);
    renderHotspots(rows);
    renderGaps(rows);
    renderPriority(rows);
    renderKPIs(rows);
    renderTopGrowth(rows);
    setDetails(null);
  }

  buildWardChips();
  renderAll();
  restoreNeighbourhoodFromUrl();
  window.addEventListener("hashchange", restoreNeighbourhoodFromUrl);

  ["toggle-heat", "toggle-hotspots", "toggle-gaps", "toggle-priority"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderAll);
  });
})();

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
