
(function(){
  if (window.__enuMap) { try{ window.__enuMap.remove(); }catch(e){} window.__enuMap=null; }

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

  const map = L.map('map', { zoomControl:false, minZoom:9, maxZoom:18 }).setView([53.5444,-113.4909], 11);
  window.__enuMap = map;
  L.control.zoom({position:'bottomright'}).addTo(map);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution:'&copy; OpenStreetMap contributors' }).addTo(map);

  const presenceLayer = L.layerGroup().addTo(map);
  const hotspotLayer  = L.layerGroup().addTo(map);
  const gapsLayer     = L.layerGroup().addTo(map);
  let heatLayer = null;

  function colorByInfill(n){ if(n>=140) return '#ef4444'; if(n>=90) return '#f59e0b'; return '#22c55e'; }
  function scaleIntensity(n){ const max=320; return Math.max(0.1, Math.min(n/max, 1)); }

  function render(){
    presenceLayer.clearLayers();
    DATA.forEach(d=>{
      const m=L.circleMarker([d.lat,d.lng],{
        radius: d.enuPresence?9:7, weight:2,
        color: d.enuPresence? '#0038A8':'#CE1126',
        fillColor: d.enuPresence? '#0038A8':'#CE1126',
        fillOpacity:.5
      }).bindPopup(`
        <div><strong>${d.name}</strong></div>
        <div><strong>ENU presence:</strong> ${d.enuPresence?'Yes':'No'}</div>
        <div><strong>Active permits:</strong> ${d.permits.toLocaleString()}</div>
        <div><strong>Ward:</strong> ${d.ward}</div>
        <div><strong>Councillor:</strong> ${d.councillor}</div>
      `);
      presenceLayer.addLayer(m);
    });

    const points = DATA.map(d => [d.lat, d.lng, scaleIntensity(d.permits)]);
    if (heatLayer) map.removeLayer(heatLayer);
    heatLayer = L.heatLayer(points, { radius:28, blur:18, maxZoom:14, minOpacity:0.2 });
    if (document.getElementById('toggle-heat').checked) heatLayer.addTo(map);

    hotspotLayer.clearLayers();
    DATA.filter(d=>d.infill>=90).forEach(d=>{
      const h=L.circleMarker([d.lat,d.lng],{
        radius: Math.min(18, 8 + d.infill/15), weight:1.5,
        color:'#fff', fillColor: colorByInfill(d.infill), fillOpacity:.85
      }).bindPopup(`
        <div style="display:flex;justify-content:space-between;gap:8px;">
          <strong>${d.name}</strong><span style="font-size:11px;border:1px solid #1b2648;padding:2px 6px;border-radius:999px;">Infill hotspot</span>
        </div>
        <div>Infill-type permits: <strong>${d.infill.toLocaleString()}</strong></div>
      `);
      hotspotLayer.addLayer(h);
    });
    if (!document.getElementById('toggle-hotspots').checked) map.removeLayer(hotspotLayer);

    gapsLayer.clearLayers();
    DATA.filter(d => ((d.permits>=90 && d.infill<60) || (!d.enuPresence && d.permits>=80))).forEach(d=>{
      const g=L.circleMarker([d.lat,d.lng],{
        radius:10, weight:1.2, dashArray:'4,3', color:'#f59e0b', fillColor:'#f59e0b', fillOpacity:.25
      }).bindPopup(`
        <div><strong>${d.name}</strong></div>
        <div><strong>Needs local advocates</strong></div>
        <div>Permits: <strong>${d.permits.toLocaleString()}</strong>, Infill: <strong>${d.infill.toLocaleString()}</strong></div>
      `);
      gapsLayer.addLayer(g);
    });
    if (!document.getElementById('toggle-gaps').checked) map.removeLayer(gapsLayer);

    document.getElementById('k-permits').textContent = DATA.reduce((a,b)=>a+b.permits,0).toLocaleString();
    document.getElementById('k-enu-yes').textContent = DATA.filter(n=>n.enuPresence).length.toLocaleString();
    document.getElementById('k-enu-no').textContent = DATA.filter(n=>!n.enuPresence).length.toLocaleString();
  }

  ['toggle-heat','toggle-hotspots','toggle-gaps'].forEach(id=>{
    const el=document.getElementById(id);
    el.addEventListener('change', render);
  });

  render();
  try{
    if (!presenceLayer.getLayers().length) throw new Error('Presence layer empty');
    console.log('ENU map initialized OK — layers & KPIs rendered.');
  }catch(e){ console.error('Self-test failed:', e); }
})();
