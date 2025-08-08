(function () {
  // Tear down any previous map on hot-reload
  if (window.__enuMap) { try { window.__enuMap.remove(); } catch (e) {} window.__enuMap = null; }

  // --- Data (same as before) ---
  const DATA = [
    { name:"Oliver",      lat:53.544,  lng:-113.516, permits:210, infill:120, enuPresence:true,  ward:"O-day'min", councillor:"TBD" },
    { name:"Downtown",    lat:53.545,  lng:-113.495, permits:260, infill: 80, enuPresence:true,  ward:"O-day'min", councillor:"TBD" },
    { name:"Strathcona",  lat:53.522,  lng:-113.501, permits:180, infill:110, enuPresence:true,  ward:"papastew",  councillor:"TBD" },
    { name:"Westmount",   lat:53.554,  lng:-113.543, permits:120, infill: 85, enuPresence:false, ward:"O-day'min", councillor:"TBD" },
    { name:"Garneau",     lat:53.5225, lng:-113.520, permits:140, infill: 70, enuPresence:false, ward:"papastew",  councillor:"TBD" },
    { name:"Glenora",     lat:53.553,  lng:-113.566, permits: 90, infill: 60, enuPresence:false, ward:"O-day'min", councillor:"TBD" },
    { name:"Ritchie",     lat:53.512,  lng:-113.485, permits:100, infill: 75, enuPresence:true,  ward:"papastew",  councillor:"TBD" },
    { name:"Highlands",   lat:53.569,  lng:-113.429, permits: 80, infill: 50, enuPresence:false, ward:"(mock)",     councillor:"TBD" },
    { name:"Bonnie Doon", lat:53.526,  lng:-113.468, permits: 95, infill: 55, enuPresence:false, ward:"papastew",  councillor:"TBD" },
    { name:"Keswick",     lat:53.415,  lng:-113.622, permits: 60, infill: 15, enuPresence:false, ward:"(mock)",     councillor:"TBD" },
    { name:"Windermere",  lat:53.431,  lng:-113.627, permits: 70, infill: 20, enuPresence:false, ward:"(mock)",     councillor:"TBD" },
    { name:"Laurel",      lat:53.448,  lng:-113.377, permits: 85, infill: 18, enuPresence:false, ward:"(mock)",     councillor:"TBD" }
  ];

  // --- App state ---
  const state = { ward: null };

  // --- Helpers ---
  function uniqueWards(list) {
    return [...new Set(list.map(d => d.ward))].filter(Boolean);
  }
  function fitToWard(ward) {
    const pts = DATA.filter(d => d.ward === ward).map(d => [d.lat, d.lng]);
    if (!pts.length || !window.__enuMap) return;
    const bounds = L.latLngBounds(pts);
    window.__enuMap.fitBounds(bounds.pad(0.2));
  }
  function setDetails(d) {
    const box = document.getElementById('details');
    if (!box) return; // if details container not added yet, skip
    if (!d) { box.classList.add('hidden'); box.innerHTML = ''; return; }
    box.classList.remove('hidden');
    box.innerHTML = `
      <h3>${d.name}</h3>
      <div style="display:flex; gap:8px; margin-bottom:6px;">
        <span class="badge ${d.enuPresence ? 'yes' : 'no'}">${d.enuPresence ? 'ENU Presence: Yes' : 'ENU Presence: No'}</span>
        <span class="badge">Ward: ${d.ward}</span>
      </div>
      <div class="row"><span>Active permits</span><strong>${d.permits.toLocaleString()}</strong></div>
      <div class="row"><span>Infill permits</span><strong>${d.infill.toLocaleString()}</strong></div>
      <div class="row"><span>Councillor</span><strong>${d.councillor}</strong></div>
    `;
  }

  // --- Map init ---
  const map = L.map('map', { zoomControl: false, minZoom: 9, maxZoom: 19 }).setView([53.5444, -113.4909], 11);
  window.__enuMap = map;
  L.control.zoom({ position: 'bottomright' }).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; OpenStreetMap contributors'
  }).addTo(map);

  // --- Layers ---
  const presenceLayer = L.layerGroup().addTo(map);
  const hotspotLayer  = L.layerGroup().addTo(map);
  const gapsLayer     = L.layerGroup().addTo(map);
  let heatLayer = null;

  function colorByInfill(n){ if (n >= 140) return '#ef4444'; if (n >= 90) return '#f59e0b'; return '#22c55e'; }
  function scaleIntensity(n){ const max = 320; return Math.max(0.1, Math.min(n / max, 1)); }

  // --- Ward chips (if filters bar exists) ---
  (function buildChips(){
    const bar = document.getElementById('filters');
    if (!bar) return; // safe if HTML wasn't added
    const reset = document.createElement('span');
    reset.className = 'chip reset active';
    reset.textContent = 'All wards';
    reset.addEventListener('click', () => {
      state.ward = null;
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      reset.classList.add('active');
      render();
      setDetails(null);
    });
    bar.appendChild(reset);

    uniqueWards(DATA).forEach(w => {
      const chip = document.createElement('span');
      chip.className = 'chip';
      chip.textContent = w;
      chip.addEventListener('click', () => {
        state.ward = w;
        document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
        chip.classList.add('active');
        render();
        fitToWard(w);
        setDetails(null);
      });
      bar.appendChild(chip);
    });
  })();

  // --- Render ---
  function render() {
    const rows = state.ward ? DATA.filter(d => d.ward === state.ward) : DATA;

    // Presence markers (primary)
    presenceLayer.clearLayers();
    rows.forEach(d => {
      const m = L.circleMarker([d.lat, d.lng], {
        radius: d.enuPresence ? 11 : 10, // slightly bigger for touch
        weight: 2,
        color: d.enuPresence ? '#0038A8' : '#CE1126',
        fillColor: d.enuPresence ? '#0038A8' : '#CE1126',
        fillOpacity: .5
      })
      .bindPopup(`
        <div><strong>${d.name}</strong></div>
        <div><strong>ENU presence:</strong> ${d.enuPresence ? 'Yes' : 'No'}</div>
        <div><strong>Active permits:</strong> ${d.permits.toLocaleString()}</div>
        <div><strong>Ward:</strong> ${d.ward}</div>
        <div><strong>Councillor:</strong> ${d.councillor}</div>
      `)
      .on('click', () => setDetails(d));
      presenceLayer.addLayer(m);
    });

    // Heatmap (densification proxy)
    const points = rows.map(d => [d.lat, d.lng, scaleIntensity(d.permits)]);
    if (heatLayer) map.removeLayer(heatLayer);
    heatLayer = L.heatLayer(points, { radius: 28, blur: 18, maxZoom: 14, minOpacity: 0.2 });
    if (document.getElementById('toggle-heat')?.checked) heatLayer.addTo(map);

    // Infill hotspots (context)
    hotspotLayer.clearLayers();
    rows.filter(d => d.infill >= 90).forEach(d => {
      const h = L.circleMarker([d.lat, d.lng], {
        radius: Math.min(18, 8 + d.infill / 15),
        weight: 1.5,
        color: '#fff',
        fillColor: colorByInfill(d.infill),
        fillOpacity: .85
      }).bindPopup(`
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <strong>${d.name}</strong>
          <span style="font-size:11px;border:1px solid #1b2648;padding:2px 6px;border-radius:999px;">Infill hotspot</span>
        </div>
        <div>Infill-type permits: <strong>${d.infill.toLocaleString()}</strong></div>
      `);
      hotspotLayer.addLayer(h);
    });
    if (!document.getElementById('toggle-hotspots')?.checked) map.removeLayer(hotspotLayer);

    // Gaps (moderate activity but no ENU presence)
    gapsLayer.clearLayers();
    rows
      .filter(d => ((d.permits >= 90 && d.infill < 60) || (!d.enuPresence && d.permits >= 80)))
      .forEach(d => {
        const g = L.circleMarker([d.lat, d.lng], {
          radius: 10,
          weight: 1.2,
          dashArray: '4,3',
          color: '#f59e0b',
          fillColor: '#f59e0b',
          fillOpacity: .25
        }).bindPopup(`
          <div><strong>${d.name}</strong></div>
          <div><strong>Needs local advocates</strong></div>
          <div>Permits: <strong>${d.permits.toLocaleString()}</strong>, Infill: <strong>${d.infill.toLocaleString()}</strong></div>
        `);
        gapsLayer.addLayer(g);
      });
    if (!document.getElementById('toggle-gaps')?.checked) map.removeLayer(gapsLayer);

    // KPIs (use filtered set)
    const permits = rows.reduce((a, b) => a + b.permits, 0);
    const yes = rows.filter(n => n.enuPresence).length;
    const no  = rows.filter(n => !n.enuPresence).length;
    const $ = id => document.getElementById(id);
    if ($('k-permits'))  $('k-permits').textContent  = permits.toLocaleString();
    if ($('k-enu-yes'))  $('k-enu-yes').textContent  = yes.toLocaleString();
    if ($('k-enu-no'))   $('k-enu-no').textContent   = no.toLocaleString();

    // Clear details on re-render (e.g., after filter change)
    setDetails(null);
  }

  // Hook layer toggles
  ['toggle-heat', 'toggle-hotspots', 'toggle-gaps'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('change', render);
  });

  // First render
  render();

  // Sanity self-test (console)
  try {
    if (!presenceLayer.getLayers().length) throw new Error('Presence layer empty');
    console.log('ENU map initialized OK — filters, details, layers & KPIs ready.');
  } catch (e) {
    console.error('Self-test failed:', e);
  }
})();

// --- Mobile drawer toggle (unchanged) ---
(function () {
  const side = document.getElementById('sidepanel');
  const btn  = document.getElementById('panelToggle');

  // create a backdrop when panel is open
  let backdrop = document.querySelector('.backdrop');
  if (!backdrop) {
    backdrop = document.createElement('div');
    backdrop.className = 'backdrop';
    document.body.appendChild(backdrop);
  }

  function closePanel() {
    side?.classList.remove('open');
    btn?.setAttribute('aria-expanded', 'false');
    backdrop.classList.remove('show');
    setTimeout(() => window.__enuMap && window.__enuMap.invalidateSize(), 200);
  }
  function openPanel() {
    side?.classList.add('open');
    btn?.setAttribute('aria-expanded', 'true');
    backdrop.classList.add('show');
    setTimeout(() => window.__enuMap && window.__enuMap.invalidateSize(), 200);
  }

  btn && btn.addEventListener('click', () => {
    side?.classList.contains('open') ? closePanel() : openPanel();
  });
  backdrop.addEventListener('click', closePanel);
})();
