(async function () {
  const statusBox = document.getElementById("mapStatus");
  const dataStatus = document.getElementById("dataStatus");
  const snapshotNote = document.getElementById("snapshotNote");

  const snapshotDate = typeof ENU_DATA_SNAPSHOT !== "undefined" && ENU_DATA_SNAPSHOT.asOf
    ? new Date(`${ENU_DATA_SNAPSHOT.asOf}T12:00:00`)
    : null;
  const snapshotDateLabel = snapshotDate && !Number.isNaN(snapshotDate.valueOf())
    ? snapshotDate.toLocaleDateString("en-CA", { year: "numeric", month: "long", day: "numeric" })
    : "the latest verified refresh";

  if (snapshotNote) {
    snapshotNote.textContent = `City permit snapshot assembled ${snapshotDateLabel}. The status badge above shows whether the map is using its verified snapshot or a connected live sheet.`;
  }

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
      dataStatus.textContent = `City-backed snapshot • Updated ${snapshotDateLabel}`;
      dataStatus.title = result.error || "The live sheet could not be loaded.";
      return;
    }

    dataStatus.textContent = `City-backed snapshot • Updated ${snapshotDateLabel}`;
  }

  if (!window.ENUData || typeof window.ENUData.loadPublicData !== "function") {
    showMapError("The map data tools could not load. Please refresh the page.");
    return;
  }

  const publicDataResult = await window.ENUData.loadPublicData(window.ENU_DATA_CONFIG || {}, FALLBACK_PUBLIC_DATA);
  updateDataStatus(publicDataResult);
  const cityMetadataByName = new Map(FALLBACK_PUBLIC_DATA.map(row => [row.name.toLocaleUpperCase("en-CA"), row]));
  const publicRows = publicDataResult.rows.map(row => {
    const cityRow = cityMetadataByName.get(row.name.toLocaleUpperCase("en-CA"));
    return { ...row, communityLeague: row.communityLeague || cityRow?.communityLeague || "" };
  });

  const state = {
    filters: { ward: null },
    datasets: {
      publicMap: publicRows,
      communityHalls: typeof FALLBACK_COMMUNITY_HALLS !== "undefined" ? FALLBACK_COMMUNITY_HALLS : []
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
    return "#fbbf24";
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

  function selectionFromUrl() {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const requestedName = params.get("neighbourhood")?.trim().toLocaleLowerCase("en-CA");
    if (!requestedName) return null;
    const row = state.datasets.publicMap.find(item => item.name.toLocaleLowerCase("en-CA") === requestedName) || null;
    return row ? { row, identityName: params.get("community")?.trim() || null } : null;
  }

  function neighbourhoodUrl(row, identityName = null) {
    const url = new URL(window.location.href);
    const params = new URLSearchParams({ neighbourhood: row.name });
    if (identityName && identityName !== row.name) params.set("community", identityName);
    url.hash = params.toString();
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

  function growthProfile(row) {
    if (row.infill >= 200) return { level: "Very high", className: "very-high", summary: "One of Edmonton’s fastest-growing neighbourhoods." };
    if (row.infill >= 40) return { level: "High", className: "high", summary: "Significant new-home activity is underway." };
    if (row.infill >= 10) return { level: "Moderate", className: "moderate", summary: "Steady new-home activity is underway." };
    return { level: "Lower", className: "lower", summary: "Limited new-home activity appears in this snapshot." };
  }

  function involvementAction(row, displayName) {
    const subject = encodeURIComponent(`ENU involvement in ${displayName}`);
    if (row.leaderEmail) {
      return `<a class="profile-action primary" href="mailto:${encodeURIComponent(row.leaderEmail)}?subject=${subject}">Contact the local ENU leader</a>`;
    }
    const url = window.ENU_DATA_CONFIG?.getInvolvedUrl || "https://www.edmontonneighbourhoodsunited.com/get-involved";
    return url
      ? `<a class="profile-action primary" href="${escapeHtml(url)}" target="_blank" rel="noopener">Get involved with ENU</a>`
      : `<span class="profile-action disabled" aria-disabled="true">Local contact coming soon</span>`;
  }

  function leagueAction(row) {
    const finderUrl = window.ENU_DATA_CONFIG?.communityLeagueFinderUrl || "https://efcl.org/league-search/";
    const label = row.communityLeague ? "Connect with this community league" : "Find your community league";
    return `<a class="league-link" href="${escapeHtml(finderUrl)}" target="_blank" rel="noopener">${label}</a>`;
  }

  function buildFilters() {
    const bar = document.getElementById("filters");
    if (!bar) return;

    bar.innerHTML = "";

    const searchForm = document.createElement("form");
    searchForm.className = "neighbourhood-search";
    searchForm.setAttribute("role", "search");
    searchForm.innerHTML = `
      <label class="sr-only" for="neighbourhoodSearch">Find a neighbourhood or community</label>
      <input id="neighbourhoodSearch" list="neighbourhoodOptions" type="search" placeholder="Search neighbourhood or community…" autocomplete="off" />
      <datalist id="neighbourhoodOptions"></datalist>
      <button type="submit">Find</button>
    `;
    const options = searchForm.querySelector("#neighbourhoodOptions");
    state.datasets.publicMap.forEach(row => {
      const option = document.createElement("option");
      option.value = row.name;
      options.appendChild(option);
    });
    window.ENUIdentity?.aliases?.forEach(alias => {
      const option = document.createElement("option");
      option.value = alias.name;
      option.label = alias.kind;
      options.appendChild(option);
    });
    searchForm.addEventListener("submit", event => {
      event.preventDefault();
      const input = searchForm.querySelector("#neighbourhoodSearch");
      const resolution = window.ENUIdentity?.resolve(input.value, state.datasets.publicMap);
      if (!resolution) {
        input.setCustomValidity("Choose a neighbourhood or community from the list.");
        input.reportValidity();
        return;
      }
      input.setCustomValidity("");
      if (resolution.rows.length === 1) {
        selectNeighbourhood(resolution.rows[0], { identityName: resolution.type === "alias" ? resolution.name : null });
      } else {
        showAreaChoices(resolution);
      }
    });
    bar.appendChild(searchForm);

    const wardGroup = document.createElement("div");
    wardGroup.className = "ward-filter";
    wardGroup.innerHTML = `<label for="wardFilter">Ward <span>(optional)</span></label><select id="wardFilter"><option value="">All wards</option></select>`;
    const wardSelect = wardGroup.querySelector("select");
    uniqueWards(state.datasets.publicMap).sort((a, b) => a.localeCompare(b, "en-CA")).forEach(ward => {
      const option = document.createElement("option");
      option.value = ward;
      option.textContent = ward;
      wardSelect.appendChild(option);
    });
    wardSelect.addEventListener("change", () => {
      clearNeighbourhoodUrl();
      state.filters.ward = wardSelect.value || null;
      renderAll();
      if (state.filters.ward) fitToWard(state.filters.ward);
      else map.setView([53.5444, -113.4909], 11);
    });
    bar.appendChild(wardGroup);
  }

  function setDetails(row, identityName = null) {
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
    const displayName = identityName || row.name;
    const growth = growthProfile(row);
    const coverageCopy = row.enuPresence === true
      ? "ENU already has a confirmed presence here."
      : row.enuPresence === false
      ? "ENU does not yet have a confirmed local presence here."
      : "ENU is still confirming local representation here.";

    box.classList.remove("hidden");
    box.innerHTML = `
      <button class="details-close" type="button" aria-label="Close neighbourhood details">×</button>
      <div class="profile-eyebrow">Neighbourhood profile</div>
      <h3>${escapeHtml(displayName)}</h3>
      ${identityName && identityName !== row.name ? `<p class="official-geography">Official City neighbourhood: <strong>${escapeHtml(row.name)}</strong></p>` : ""}

      <section class="profile-section growth-summary">
        <div class="profile-section-heading"><span>Housing growth</span><span class="growth-level ${growth.className}">${growth.level}</span></div>
        <p>${growth.summary}</p>
        <div class="profile-metrics">
          <div><strong>${row.infill.toLocaleString()}</strong><span>New-home permits<br>past 24 months</span></div>
          <div><strong>${row.permits.toLocaleString()}</strong><span>Active development<br>permits</span></div>
        </div>
      </section>

      <section class="profile-section enu-summary">
        <div class="profile-section-heading"><span>ENU in this neighbourhood</span><span class="badge ${presenceClass}">${presenceLabel}</span></div>
        <p>${coverageCopy}</p>
        ${row.leader ? `<div class="profile-contact"><span>Local leader</span><strong>${escapeHtml(row.leader)}</strong></div>` : `<p class="awaiting-contact">Local leader information is awaiting ENU confirmation.</p>`}
        ${priorityBadge ? `<div class="priority-line">${priorityBadge}<span>Advocacy score ${score}</span></div>` : ""}
      </section>

      <section class="profile-section civic-summary">
        <div class="profile-section-heading"><span>Community connection</span></div>
        ${row.communityLeague
          ? `<div class="league-name">${escapeHtml(row.communityLeague)}</div><p>Community leagues connect neighbours through local programs, facilities, events, and advocacy.</p>`
          : `<p>The community-league relationship for this neighbourhood is still being verified.</p>`}
        ${leagueAction(row)}
      </section>

      <section class="profile-section civic-summary">
        <div class="profile-section-heading"><span>City representation</span></div>
        <div class="row"><span>Ward</span><strong>${escapeHtml(row.ward)}</strong></div>
        <div class="row"><span>Councillor</span><strong>${escapeHtml(row.councillor)}</strong></div>
      </section>
      ${row.notes ? `<div class="row"><span>Public notes</span><strong>${escapeHtml(row.notes)}</strong></div>` : ""}

      <div class="profile-actions">
        ${involvementAction(row, displayName)}
        <button class="share-neighbourhood profile-action secondary" type="button">Copy profile link</button>
      </div>
      <span class="share-status" role="status" aria-live="polite"></span>
      <p class="profile-footnote">ENU status is provisional pending confirmation. City permit data reflects the latest verified snapshot.</p>
    `;

    box.querySelector(".details-close")?.addEventListener("click", () => {
      dismissNeighbourhoodDetails();
    });
    box.querySelector(".share-neighbourhood")?.addEventListener("click", async event => {
      const status = box.querySelector(".share-status");
      try {
        await navigator.clipboard.writeText(neighbourhoodUrl(row, identityName));
        event.currentTarget.textContent = "Link copied";
        if (status) status.textContent = "Ready to share.";
      } catch (error) {
        if (status) status.textContent = "Copy the URL from your browser to share this neighbourhood.";
      }
    });
  }

  function dismissNeighbourhoodDetails() {
    clearNeighbourhoodUrl();
    setDetails(null);
    map.closePopup();
  }

  function showAreaChoices(resolution) {
    const box = document.getElementById("details");
    if (!box) return;
    clearNeighbourhoodUrl();
    const bounds = L.latLngBounds(resolution.rows.map(row => [row.lat, row.lng]));
    map.fitBounds(bounds.pad(0.35));
    box.classList.remove("hidden");
    box.innerHTML = `
      <button class="details-close" type="button" aria-label="Close area choices">×</button>
      <h3>${escapeHtml(resolution.name)}</h3>
      <p class="official-geography">This familiar area includes several official City neighbourhoods. Choose yours:</p>
      <div class="area-choices">${resolution.rows.map(row => `<button type="button" data-neighbourhood="${escapeHtml(row.name)}">${escapeHtml(row.name)}<small>${escapeHtml(row.ward)} ward</small></button>`).join("")}</div>
    `;
    box.querySelector(".details-close")?.addEventListener("click", dismissNeighbourhoodDetails);
    box.querySelectorAll("[data-neighbourhood]").forEach(button => button.addEventListener("click", () => {
      const row = resolution.rows.find(item => item.name === button.dataset.neighbourhood);
      selectNeighbourhood(row);
    }));
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
  const hallLayer = L.layerGroup();
  const interactionLayer = L.layerGroup().addTo(map);
  let heatLayer = null;

  function markerHitRadius() {
    const coarsePointer = window.matchMedia?.("(pointer: coarse)").matches;
    if (map.getZoom() >= 13) return coarsePointer ? 22 : 18;
    return coarsePointer ? 16 : 12;
  }

  function selectNeighbourhood(row, { updateUrl = true, identityName = null } = {}) {
    if (!row) return;
    const hadWardFilter = Boolean(state.filters.ward);
    state.filters.ward = null;
    if (hadWardFilter) renderAll();
    const wardSelect = document.getElementById("wardFilter");
    if (wardSelect) wardSelect.value = "";
    if (updateUrl) history.replaceState(null, "", neighbourhoodUrl(row, identityName));
    map.setView([row.lat, row.lng], 14);
    setDetails(row, identityName);
    document.getElementById("sidepanel")?.classList.remove("open");
    document.getElementById("panelToggle")?.setAttribute("aria-expanded", "false");
    document.querySelector(".backdrop")?.classList.remove("show");
  }

  function restoreNeighbourhoodFromUrl() {
    const selection = selectionFromUrl();
    if (selection) selectNeighbourhood(selection.row, { updateUrl: false, identityName: selection.identityName });
  }

  function renderPresence(rows) {
    presenceLayer.clearLayers();
    interactionLayer.clearLayers();

    rows.forEach(d => {
      const isUnknown = d.enuPresence === null;
      const color = d.enuPresence === true ? "#0038A8" : d.enuPresence === false ? "#CE1126" : "#94a3b8";
      const presenceLabel = d.enuPresence === true ? "Yes" : d.enuPresence === false ? "No" : "Unknown";
      const popupContent = `
        <div><strong>${escapeHtml(d.name)}</strong></div>
        <div><strong>ENU presence*:</strong> ${presenceLabel}</div>
        <div><strong>Active permits:</strong> ${d.permits.toLocaleString()}</div>
        <div><strong>Ward:</strong> ${escapeHtml(d.ward)}</div>
        <div><strong>Councillor:</strong> ${escapeHtml(d.councillor)}</div>
      `;
      const marker = L.circleMarker([d.lat, d.lng], {
        radius: isUnknown ? 5 : d.enuPresence ? 11 : 10,
        weight: isUnknown ? 1 : 2,
        color,
        fillColor: color,
        fillOpacity: isUnknown ? 0.35 : 0.5,
        interactive: false
      });

      const hitTarget = L.circleMarker([d.lat, d.lng], {
        radius: markerHitRadius(),
        weight: 0,
        color: "transparent",
        fillColor: "#ffffff",
        fillOpacity: 0.001,
        className: "neighbourhood-hit-target",
        bubblingMouseEvents: false
      })
      .bindPopup(popupContent)
      .bindTooltip(escapeHtml(d.name), { direction: "top", offset: [0, -10], opacity: 0.95 })
      .on("click", () => selectNeighbourhood(d));

      presenceLayer.addLayer(marker);
      interactionLayer.addLayer(hitTarget);
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
        weight: 2,
        color: "#fff",
        fillColor: colorByHousingGrowth(d.infill),
        fillOpacity: 0.82
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

  function renderCommunityHalls() {
    const toggle = document.getElementById("toggle-halls");
    hallLayer.clearLayers();
    state.datasets.communityHalls.forEach(hall => {
      const marker = L.circleMarker([hall.lat, hall.lng], {
        radius: 7,
        weight: 2,
        color: "#e0f2fe",
        fillColor: "#0891b2",
        fillOpacity: 0.9,
        className: "community-hall-marker"
      }).bindPopup(`<div><strong>${escapeHtml(hall.name)} Community League Hall</strong></div><div>City of Edmonton community-league hall location</div>`)
        .bindTooltip(`${escapeHtml(hall.name)} hall`, { direction: "top", opacity: 0.95 });
      hallLayer.addLayer(marker);
    });
    if (toggle?.checked) hallLayer.addTo(map);
    else map.removeLayer(hallLayer);
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
    renderCommunityHalls();
    renderKPIs(rows);
    renderTopGrowth(rows);
    setDetails(null);
    interactionLayer.eachLayer(layer => layer.bringToFront?.());
  }

  buildFilters();
  renderAll();
  restoreNeighbourhoodFromUrl();
  window.addEventListener("hashchange", restoreNeighbourhoodFromUrl);

  ["toggle-heat", "toggle-hotspots", "toggle-gaps", "toggle-priority", "toggle-halls"].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener("change", renderAll);
  });

  map.on("zoomend", () => {
    const radius = markerHitRadius();
    interactionLayer.eachLayer(layer => layer.setRadius?.(radius));
  });
  map.on("click", dismissNeighbourhoodDetails);
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
