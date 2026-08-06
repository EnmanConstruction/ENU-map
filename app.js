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
      dataStatus.textContent = "Demonstration data • Live sheet unavailable";
      dataStatus.title = result.error || "The live sheet could not be loaded.";
      return;
    }

    dataStatus.textContent = "Demonstration data — not for official reporting";
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
      publicMap: publicDataResult.rows,
      internalStrategy: FALLBACK_INTERNAL_DATA
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

  function calculatePriorityScore(row) {
    const internal = getInternalByName(row.name);

    const permitScore = Math.min(row.permits / 25, 10);
    const infillScore = Math.min(row.infill / 12, 10);
    const noPresenceBonus = row.enuPresence ? 0 : 3;

    let engagementBonus = 0;
    if (internal) {
      if (internal.engagementScore <= 2) engagementBonus = 3;
      else if (internal.engagementScore <= 4) engagementBonus = 2;
      else if (internal.engagementScore <= 6) engagementBonus = 1;
    } else {
      engagementBonus = 1.5;
    }

    const score =
      (permitScore * 0.4) +
      (infillScore * 0.35) +
      noPresenceBonus +
      engagementBonus;

    return Number(score.toFixed(2));
  }

  function getPriorityLevel(score) {
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

    const allChip = document.createElement("button");
    allChip.type = "button";
    allChip.className = "chip reset active";
    allChip.setAttribute("aria-pressed", "true");
    allChip.textContent = "All Wards";
    allChip.addEventListener("click", () => {
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
  : ward === "(mock)"
  ? "Demo Ward"
  : ward;
      chip.addEventListener("click", () => {
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

    const internal = getInternalByName(row.name);
    const score = calculatePriorityScore(row);
    const priority = getPriorityLevel(score);

    box.classList.remove("hidden");
    box.innerHTML = `
      <button class="details-close" type="button" aria-label="Close neighbourhood details">×</button>
      <h3>${escapeHtml(row.name)}</h3>
      <div style="display:flex; gap:8px; margin-bottom:6px; flex-wrap:wrap;">
        <span class="badge ${row.enuPresence ? "yes" : "no"}">${row.enuPresence ? "ENU Presence: Yes" : "ENU Presence: No"}</span>
        <span class="badge">Ward: ${escapeHtml(row.ward)}</span>
        <span class="badge priority-${priority.toLowerCase()}">Priority: ${priority}</span>
      </div>

      <div class="row"><span>Active permits</span><strong>${row.permits.toLocaleString()}</strong></div>
      <div class="row"><span>Infill permits</span><strong>${row.infill.toLocaleString()}</strong></div>
      <div class="row"><span>Priority score</span><strong>${score}</strong></div>
      <div class="row"><span>Councillor</span><strong>${escapeHtml(row.councillor)}</strong></div>

      ${row.leader ? `<div class="row"><span>ENU leader</span><strong>${escapeHtml(row.leader)}</strong></div>` : ""}
      ${row.leaderEmail ? `<div class="row"><span>Leader email</span><strong>${escapeHtml(row.leaderEmail)}</strong></div>` : ""}
      ${row.notes ? `<div class="row"><span>Public notes</span><strong>${escapeHtml(row.notes)}</strong></div>` : ""}

      ${internal ? `
        <hr style="border-color:#1b2648; margin:10px 0;">
        <div class="row"><span>Volunteers</span><strong>${internal.volunteers}</strong></div>
        <div class="row"><span>Lawn signs</span><strong>${internal.lawnSigns}</strong></div>
        <div class="row"><span>Petition signatures</span><strong>${internal.petitionSignatures}</strong></div>
        <div class="row"><span>Engagement score</span><strong>${internal.engagementScore}</strong></div>
        <div class="row"><span>Priority level (manual)</span><strong>${escapeHtml(internal.priorityLevel || "-")}</strong></div>
        ${internal.notes ? `<div class="row"><span>Internal notes</span><strong>${escapeHtml(internal.notes)}</strong></div>` : ""}
      ` : ""}
    `;

    box.querySelector(".details-close")?.addEventListener("click", () => setDetails(null));
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
        <div><strong>${escapeHtml(d.name)}</strong></div>
        <div><strong>ENU presence:</strong> ${d.enuPresence ? "Yes" : "No"}</div>
        <div><strong>Active permits:</strong> ${d.permits.toLocaleString()}</div>
        <div><strong>Ward:</strong> ${escapeHtml(d.ward)}</div>
        <div><strong>Councillor:</strong> ${escapeHtml(d.councillor)}</div>
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
          <strong>${escapeHtml(d.name)}</strong>
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
          <div><strong>${escapeHtml(d.name)}</strong></div>
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

  function renderPriority(rows) {
    const toggle = document.getElementById("toggle-priority");
    priorityLayer.clearLayers();

    rows.forEach(d => {
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
    const yes = rows.filter(r => r.enuPresence).length;
    const no = rows.filter(r => !r.enuPresence).length;

    const priorityCounts = rows.reduce((acc, row) => {
      const level = getPriorityLevel(calculatePriorityScore(row));
      acc[level] = (acc[level] || 0) + 1;
      return acc;
    }, { High: 0, Medium: 0, Low: 0 });

    document.getElementById("k-permits").textContent = permits.toLocaleString();
    document.getElementById("k-enu-yes").textContent = yes.toLocaleString();
    document.getElementById("k-enu-no").textContent = no.toLocaleString();
    document.getElementById("k-priority-high").textContent = priorityCounts.High.toLocaleString();
    document.getElementById("k-priority-medium").textContent = priorityCounts.Medium.toLocaleString();
    document.getElementById("k-priority-low").textContent = priorityCounts.Low.toLocaleString();
  }

  function renderAll() {
    const rows = getFilteredPublicRows();
    renderPresence(rows);
    renderHeat(rows);
    renderHotspots(rows);
    renderGaps(rows);
    renderPriority(rows);
    renderKPIs(rows);
    setDetails(null);
  }

  buildWardChips();
  renderAll();

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
