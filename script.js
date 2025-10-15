// State
const state = {
  map: null,
  userMarker: null,
  userCircle: null,
  watchId: null,
  sites: [], // { id, name, lat, lon, marker }
  nextSiteId: 1,
  routePolyline: null,
  nearestSiteId: null,
  manualStart: null, // { name, lat, lon, marker }
};

// Constants
const MAX_SITES = 10;
const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

// Elements
const siteInputEl = document.getElementById("site-input");
const btnAddEl = document.getElementById("btn-add");
const sitesListEl = document.getElementById("sites-list");
const btnDetectEl = document.getElementById("btn-detect");
const btnNearestEl = document.getElementById("btn-nearest");
const btnGmapsEl = document.getElementById("btn-gmaps");
const autocompleteEl = document.getElementById("autocomplete");
const startInputEl = document.getElementById("start-input");
const btnSetStartEl = document.getElementById("btn-set-start");
const btnClearStartEl = document.getElementById("btn-clear-start");
const btnPickStartEl = document.getElementById("btn-pick-start");
const btnPickDestEl = document.getElementById("btn-pick-dest");
const startAutocompleteEl = document.getElementById("start-autocomplete");
const nearestNameEl = document.getElementById("nearest-name");
const nearestDistanceEl = document.getElementById("nearest-distance");
const routeOrderEl = document.getElementById("route-order");

// Map init
function initMap() {
  state.map = L.map("map");
  const tiles = L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "&copy; OpenStreetMap contributors",
  });
  tiles.addTo(state.map);
  state.map.setView([28.6139, 77.2090], 11); // default: Delhi
}

// Geolocation
function startWatchingLocation() {
  if (!("geolocation" in navigator)) {
    alert("Geolocation is not supported by this browser.");
    return;
  }
  if (state.watchId != null) return; // already watching

  state.watchId = navigator.geolocation.watchPosition(
    (pos) => {
      const { latitude, longitude, accuracy } = pos.coords;
      updateUserLocation(latitude, longitude, accuracy);
      autoUpdateNearest();
    },
    (err) => {
      console.error("Geolocation error", err);
      alert("Unable to get location: " + err.message);
    },
    { enableHighAccuracy: true, maximumAge: 3000, timeout: 15000 }
  );
}

function updateUserLocation(lat, lon, accuracy) {
  const latLng = [lat, lon];
  if (!state.userMarker) {
    state.userMarker = L.marker(latLng, { title: "You" });
    state.userMarker.addTo(state.map);
  } else {
    state.userMarker.setLatLng(latLng);
  }
  if (!state.userCircle) {
    state.userCircle = L.circle(latLng, { radius: accuracy || 20, color: "#4f8cff" });
    state.userCircle.addTo(state.map);
  } else {
    state.userCircle.setLatLng(latLng);
    state.userCircle.setRadius(accuracy || 20);
  }
  // auto zoom to user on first acquire
  if (!state._hasCenteredOnce) {
    state.map.setView(latLng, 15);
    state._hasCenteredOnce = true;
  }
}

function setManualStart(lat, lon, name) {
  if (state.manualStart && state.manualStart.marker) {
    state.manualStart.marker.remove();
  }
  const marker = L.marker([lat, lon]);
  marker.bindPopup(`${name || 'Start'}`);
  marker.addTo(state.map);
  state.manualStart = { name: name || 'Start', lat, lon, marker };
  localStorage.setItem('manualStart', JSON.stringify({ name: state.manualStart.name, lat, lon }));
  fitMapToAll();
  autoUpdateNearest();
}

function clearManualStart() {
  if (state.manualStart && state.manualStart.marker) state.manualStart.marker.remove();
  state.manualStart = null;
  localStorage.removeItem('manualStart');
  autoUpdateNearest();
}

// Sites management
async function geocodePlaceName(name) {
  const params = new URLSearchParams({
    q: name,
    format: "json",
    limit: "1",
    addressdetails: "0",
  });
  const headers = { "Accept": "application/json", "User-Agent": "RoutePlanner/1.0" };
  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, { headers });
  if (!res.ok) throw new Error("Geocoding failed");
  const data = await res.json();
  if (!data || data.length === 0) throw new Error("No results found");
  const item = data[0];
  return { lat: parseFloat(item.lat), lon: parseFloat(item.lon) };
}

function renderSitesList() {
  sitesListEl.innerHTML = "";
  for (const site of state.sites) {
    const li = document.createElement("li");
    const nameSpan = document.createElement("span");
    nameSpan.className = "site-name";
    nameSpan.textContent = site.name;

    const actions = document.createElement("div");
    actions.className = "site-actions";
    const upBtn = document.createElement("button");
    upBtn.className = "btn small";
    upBtn.textContent = "↑";
    upBtn.onclick = () => moveSite(site.id, -1);
    const downBtn = document.createElement("button");
    downBtn.className = "btn small";
    downBtn.textContent = "↓";
    downBtn.onclick = () => moveSite(site.id, +1);
    const delBtn = document.createElement("button");
    delBtn.className = "btn small danger";
    delBtn.textContent = "Delete";
    delBtn.onclick = () => removeSite(site.id);
    actions.appendChild(upBtn);
    actions.appendChild(downBtn);
    actions.appendChild(delBtn);

    li.appendChild(nameSpan);
    li.appendChild(actions);
    sitesListEl.appendChild(li);
  }
}

function addSiteToMap(site) {
  const marker = L.marker([site.lat, site.lon]);
  marker.bindPopup(`${site.name}`);
  marker.addTo(state.map);
  site.marker = marker;
}

function refreshMarkersStyle() {
  // nearest marker popup and style
  for (const site of state.sites) {
    if (!site.marker) continue;
    if (site.id === state.nearestSiteId) {
      site.marker.setIcon(new L.Icon.Default());
      // Leaflet default icon is blue; keep default but we can differentiate via popup text
      site.marker.bindPopup(`${site.name} (nearest)`);
    } else {
      site.marker.setIcon(new L.Icon.Default());
      site.marker.bindPopup(`${site.name}`);
    }
  }
}

function removeSite(id) {
  const idx = state.sites.findIndex(s => s.id === id);
  if (idx === -1) return;
  const [removed] = state.sites.splice(idx, 1);
  if (removed.marker) removed.marker.remove();
  renderSitesList();
  optimizeRouteAndRender();
  persistSites();
}

function moveSite(id, delta) {
  const idx = state.sites.findIndex(s => s.id === id);
  if (idx === -1) return;
  const newIdx = idx + delta;
  if (newIdx < 0 || newIdx >= state.sites.length) return;
  const [item] = state.sites.splice(idx, 1);
  state.sites.splice(newIdx, 0, item);
  renderSitesList();
  optimizeRouteAndRender();
  persistSites();
}

async function onAddSite() {
  const name = siteInputEl.value.trim();
  if (!name) return;
  if (state.sites.length >= MAX_SITES) {
    alert(`Maximum ${MAX_SITES} sites allowed.`);
    return;
  }
  btnAddEl.disabled = true;
  btnAddEl.textContent = "Adding...";
  try {
    const { lat, lon } = await geocodePlaceName(name);
    const site = { id: state.nextSiteId++, name, lat, lon, marker: null };
    state.sites.push(site);
    addSiteToMap(site);
    renderSitesList();
    fitMapToAll();
    optimizeRouteAndRender();
    persistSites();
  } catch (e) {
    alert(e.message || "Failed to add site");
  } finally {
    btnAddEl.disabled = false;
    btnAddEl.textContent = "Add";
    siteInputEl.value = "";
  }
}

function fitMapToAll() {
  const bounds = L.latLngBounds([]);
  if (state.userMarker) bounds.extend(state.userMarker.getLatLng());
  for (const s of state.sites) bounds.extend([s.lat, s.lon]);
  if (bounds.isValid()) state.map.fitBounds(bounds.pad(0.2));
}

// Distance utils
function haversineKm(a, b) {
  const R = 6371; // km
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const la1 = toRad(a.lat);
  const la2 = toRad(b.lat);
  const h = Math.sin(dLat/2)**2 + Math.cos(la1)*Math.cos(la2)*Math.sin(dLon/2)**2;
  return 2 * R * Math.asin(Math.sqrt(h));
}
function toRad(deg) { return deg * Math.PI / 180; }

function getUserLatLon() {
  if (state.userMarker) {
    const { lat, lng } = state.userMarker.getLatLng();
    return { lat, lon: lng };
  }
  if (state.manualStart) {
    return { lat: state.manualStart.lat, lon: state.manualStart.lon };
  }
  return null;
}

function findNearestSiteFrom(user) {
  if (!user || state.sites.length === 0) return { site: null, distanceKm: null };
  let best = null;
  let bestD = Infinity;
  for (const site of state.sites) {
    const d = haversineKm(user, { lat: site.lat, lon: site.lon });
    if (d < bestD) { bestD = d; best = site; }
  }
  return { site: best, distanceKm: bestD };
}

function updateNearestUI(site, distanceKm) {
  if (!site) {
    nearestNameEl.textContent = "—";
    nearestDistanceEl.textContent = "—";
    state.nearestSiteId = null;
    refreshMarkersStyle();
    return;
  }
  nearestNameEl.textContent = site.name;
  nearestDistanceEl.textContent = `${distanceKm.toFixed(2)} km`;
  state.nearestSiteId = site.id;
  refreshMarkersStyle();
}

function autoUpdateNearest() {
  const user = getUserLatLon();
  const { site, distanceKm } = findNearestSiteFrom(user);
  updateNearestUI(site, distanceKm ?? 0);
}

// Route optimization: Nearest Neighbor + 2-Opt
function optimizeRoute(points) {
  if (points.length <= 1) return points.slice();
  const remaining = points.slice();
  const origin = getUserLatLon() || { lat: remaining[0].lat, lon: remaining[0].lon };
  // start with the point nearest to origin (user or manual start)
  let firstIdx = 0;
  let bestD0 = Infinity;
  for (let i = 0; i < remaining.length; i++) {
    const d = haversineKm(origin, remaining[i]);
    if (d < bestD0) { bestD0 = d; firstIdx = i; }
  }
  const route = [remaining.splice(firstIdx, 1)[0]];
  while (remaining.length) {
    let bestIdx = 0;
    let bestD = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = haversineKm(route[route.length - 1], remaining[i]);
      if (d < bestD) { bestD = d; bestIdx = i; }
    }
    route.push(remaining.splice(bestIdx, 1)[0]);
  }
  // 2-Opt refinement
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 1; i < route.length - 2; i++) {
      for (let k = i + 1; k < route.length - 1; k++) {
        const delta = twoOptGain(route, i, k);
        if (delta < -1e-6) { // improvement
          reverseSegment(route, i, k);
          improved = true;
        }
      }
    }
  }
  return route;
}

function pathDistance(points) {
  let d = 0;
  for (let i = 0; i < points.length - 1; i++) {
    d += haversineKm(points[i], points[i+1]);
  }
  return d;
}

function twoOptGain(route, i, k) {
  const A = route[i - 1];
  const B = route[i];
  const C = route[k];
  const D = route[k + 1];
  const current = haversineKm(A, B) + haversineKm(C, D);
  const swapped = haversineKm(A, C) + haversineKm(B, D);
  return swapped - current; // negative means improvement
}

function reverseSegment(route, i, k) {
  while (i < k) {
    const tmp = route[i];
    route[i] = route[k];
    route[k] = tmp;
    i++; k--;
  }
}

function optimizeRouteAndRender() {
  if (state.routePolyline) {
    state.routePolyline.remove();
    state.routePolyline = null;
  }
  if (state.sites.length === 0) {
    routeOrderEl.textContent = "—";
    return;
  }
  const points = state.sites.map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon }));
  const optimized = optimizeRoute(points);
  // Update order display
  const orderedNames = optimized.map(p => p.name).join(" → ");
  routeOrderEl.textContent = orderedNames;
  // Draw polyline
  const latlngs = optimized.map(p => [p.lat, p.lon]);
  state.routePolyline = L.polyline(latlngs, { color: "#4f8cff", weight: 4, opacity: 0.9 });
  state.routePolyline.addTo(state.map);
}

// Google Maps directions URL
function openInGoogleMaps() {
  const user = getUserLatLon();
  if (state.sites.length === 0) {
    alert("Add at least one site.");
    return;
  }
  const points = state.sites.map(s => ({ name: s.name, lat: s.lat, lon: s.lon }));
  const optimized = optimizeRoute(points);
  const origin = user ? `${user.lat},${user.lon}` : `${optimized[0].lat},${optimized[0].lon}`;
  const destination = `${optimized[optimized.length - 1].lat},${optimized[optimized.length - 1].lon}`;
  const waypoints = optimized.slice(0, -1).map(p => `${p.lat},${p.lon}`).join("|");
  const base = "https://www.google.com/maps/dir/?api=1";
  const params = new URLSearchParams({
    origin,
    destination,
    travelmode: "driving",
    waypoints,
  });
  const url = `${base}&${params.toString()}`;
  window.open(url, "_blank");
}

// Persistence
function persistSites() {
  const toSave = state.sites.map(s => ({ id: s.id, name: s.name, lat: s.lat, lon: s.lon }));
  localStorage.setItem("sites", JSON.stringify(toSave));
  localStorage.setItem("nextSiteId", String(state.nextSiteId));
}

function restoreSites() {
  const raw = localStorage.getItem("sites");
  const rawNext = localStorage.getItem("nextSiteId");
  if (raw) {
    try {
      const arr = JSON.parse(raw);
      state.sites = arr.map(s => ({ ...s, marker: null }));
      for (const site of state.sites) addSiteToMap(site);
      renderSitesList();
      optimizeRouteAndRender();
    } catch {}
  }
  if (rawNext) state.nextSiteId = parseInt(rawNext, 10) || state.nextSiteId;
}

function restoreManualStart() {
  const raw = localStorage.getItem('manualStart');
  if (!raw) return;
  try {
    const obj = JSON.parse(raw);
    if (obj && typeof obj.lat === 'number' && typeof obj.lon === 'number') {
      setManualStart(obj.lat, obj.lon, obj.name || 'Start');
      if (startInputEl) startInputEl.value = obj.name || '';
    }
  } catch {}
}

// Events
btnAddEl.addEventListener("click", onAddSite);
siteInputEl.addEventListener("keydown", (e) => { if (e.key === "Enter") onAddSite(); });
btnDetectEl.addEventListener("click", () => { startWatchingLocation(); });
btnNearestEl.addEventListener("click", () => { autoUpdateNearest(); fitMapToAll(); });
btnGmapsEl.addEventListener("click", openInGoogleMaps);

if (btnSetStartEl) {
  btnSetStartEl.addEventListener('click', async () => {
    const text = startInputEl.value.trim();
    if (!text) return;
    try {
      const { lat, lon } = await geocodePlaceName(text);
      setManualStart(lat, lon, text);
    } catch (e) {
      alert(e.message || 'Failed to set start');
    }
  });
}

if (btnClearStartEl) {
  btnClearStartEl.addEventListener('click', () => {
    clearManualStart();
    if (startInputEl) startInputEl.value = '';
  });
}

// Reverse geocoding helper
async function reverseGeocode(lat, lon) {
  const url = `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}`;
  const headers = { "Accept": "application/json", "User-Agent": "RoutePlanner/1.0" };
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error('Reverse geocoding failed');
  const data = await res.json();
  return data.display_name || `${lat.toFixed(5)}, ${lon.toFixed(5)}`;
}

// Map pick start/destination
let pickingMode = null; // 'start' | 'dest'
if (btnPickStartEl) btnPickStartEl.addEventListener('click', () => { pickingMode = 'start'; state.map.getContainer().style.cursor = 'crosshair'; });
if (btnPickDestEl) btnPickDestEl.addEventListener('click', () => { pickingMode = 'dest'; state.map.getContainer().style.cursor = 'crosshair'; });

async function onMapClickPick(e) {
  if (!pickingMode) return;
  const { lat, lng } = e.latlng;
  try {
    const name = await reverseGeocode(lat, lng);
    if (pickingMode === 'start') {
      setManualStart(lat, lng, name);
      if (startInputEl) startInputEl.value = name;
    } else if (pickingMode === 'dest') {
      addSiteObject({ name, lat, lon: lng });
    }
  } catch (err) {
    alert(err.message || 'Failed to pick location');
  } finally {
    pickingMode = null;
    state.map.getContainer().style.cursor = '';
  }
}

// Start input autocomplete
let acStartIndex = -1;
let acStartItems = [];
const startDebouncedSuggest = debounce(async (value) => {
  if (!value.trim()) { renderStartAutocomplete([], ""); return; }
  try {
    const items = await fetchSuggestions(value.trim());
    renderStartAutocomplete(items, value.trim());
  } catch {
    renderStartAutocomplete([], value.trim());
  }
}, 300);

function renderStartAutocomplete(items, query) {
  acStartItems = items;
  acStartIndex = -1;
  if (!query || (!items || items.length === 0)) {
    startAutocompleteEl.innerHTML = query ? `<div class="autocomplete-item" data-type="other">Use "${escapeHtml(query)}"</div>` : "<div class=\"autocomplete-empty\">Start typing to search...</div>";
    startAutocompleteEl.hidden = !query;
    return;
  }
  const list = items
    .map((it, i) => `<div class=\"autocomplete-item\" data-index=\"${i}\">${escapeHtml(it.displayName)}</div>`)
    .join("");
  const other = `<div class=\"autocomplete-item\" data-type=\"other\">Use \"${escapeHtml(query)}\"</div>`;
  startAutocompleteEl.innerHTML = list + other;
  startAutocompleteEl.hidden = false;
}

if (startInputEl) {
  startInputEl.addEventListener('input', (e) => startDebouncedSuggest(e.target.value));
  startInputEl.addEventListener('keydown', (e) => {
    if (startAutocompleteEl.hidden) return;
    const max = acStartItems.length;
    if (e.key === 'ArrowDown') { e.preventDefault(); acStartIndex = (acStartIndex + 1) % (max + 1); highlightStartAc(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); acStartIndex = (acStartIndex - 1 + (max + 1)) % (max + 1); highlightStartAc(); }
    else if (e.key === 'Enter') { e.preventDefault(); selectStartHighlightedOrTyped(); }
    else if (e.key === 'Escape') { startAutocompleteEl.hidden = true; }
  });
}

startAutocompleteEl.addEventListener('mousedown', (e) => {
  const item = e.target.closest('.autocomplete-item');
  if (!item) return;
  const type = item.getAttribute('data-type');
  if (type === 'other') {
    if (btnSetStartEl) btnSetStartEl.click();
  } else {
    const index = Number(item.getAttribute('data-index'));
    selectStartSuggestion(index);
  }
});

function highlightStartAc() {
  const children = [...startAutocompleteEl.querySelectorAll('.autocomplete-item')];
  children.forEach(c => c.classList.remove('active'));
  if (acStartIndex >= 0 && acStartIndex < children.length) children[acStartIndex].classList.add('active');
}

function selectStartSuggestion(index) {
  const it = acStartItems[index];
  if (!it) return;
  setManualStart(it.lat, it.lon, it.displayName);
  if (startInputEl) startInputEl.value = it.displayName;
  startAutocompleteEl.hidden = true;
}

function selectStartHighlightedOrTyped() {
  if (acStartIndex === -1) { if (btnSetStartEl) btnSetStartEl.click(); return; }
  const max = acStartItems.length;
  if (acStartIndex === max) { if (btnSetStartEl) btnSetStartEl.click(); return; }
  selectStartSuggestion(acStartIndex);
}

// Init
window.addEventListener("load", () => {
  initMap();
  restoreSites();
  restoreManualStart();
  // auto-start geolocation
  startWatchingLocation();
  // attach map click handler for picking start/destination
  state.map.on('click', onMapClickPick);
});

// =====================
// Autocomplete logic
// =====================
let acIndex = -1; // keyboard highlight index
let acItems = []; // {displayName, lat, lon}
let acAbort = null;

function debounce(fn, ms) {
  let t = null;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

async function fetchSuggestions(query) {
  const params = new URLSearchParams({ q: query, format: "json", limit: "5", addressdetails: "0" });
  if (state.map) {
    const z = state.map.getZoom();
    if (z >= 9) {
      const b = state.map.getBounds();
      const viewbox = [b.getWest(), b.getNorth(), b.getEast(), b.getSouth()].join(",");
      params.set('viewbox', viewbox);
      params.set('bounded', '1');
    }
  }
  const headers = { "Accept": "application/json", "User-Agent": "RoutePlanner/1.0" };
  if (acAbort) acAbort.abort();
  acAbort = new AbortController();
  const res = await fetch(`${NOMINATIM_URL}?${params.toString()}`, { headers, signal: acAbort.signal });
  if (!res.ok) throw new Error("suggestions failed");
  const data = await res.json();
  return data.map(d => ({ displayName: d.display_name, lat: parseFloat(d.lat), lon: parseFloat(d.lon) }));
}

function renderAutocomplete(items, query) {
  acItems = items;
  acIndex = -1;
  if (!query || (!items || items.length === 0)) {
    const other = query ? `<div class="autocomplete-item" data-type="other">Use "${escapeHtml(query)}" as other destination</div>` : "<div class=\"autocomplete-empty\">Start typing to search...</div>";
    autocompleteEl.innerHTML = other;
    autocompleteEl.hidden = !query;
    return;
  }
  const list = items
    .map((it, i) => `<div class="autocomplete-item" data-index="${i}">${escapeHtml(it.displayName)}</div>`) 
    .join("");
  const other = `<div class="autocomplete-item" data-type="other">Use "${escapeHtml(query)}" as other destination</div>`;
  autocompleteEl.innerHTML = list + other;
  autocompleteEl.hidden = false;
}

const debouncedSuggest = debounce(async (value) => {
  if (!value.trim()) { renderAutocomplete([], ""); return; }
  try {
    const items = await fetchSuggestions(value.trim());
    renderAutocomplete(items, value.trim());
  } catch {
    renderAutocomplete([], value.trim());
  }
}, 300);

siteInputEl.addEventListener("input", (e) => {
  debouncedSuggest(e.target.value);
});

siteInputEl.addEventListener("keydown", (e) => {
  if (autocompleteEl.hidden) return;
  const max = acItems.length; // other option is after these
  if (e.key === "ArrowDown") {
    e.preventDefault();
    acIndex = (acIndex + 1) % (max + 1);
    highlightAc();
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    acIndex = (acIndex - 1 + (max + 1)) % (max + 1);
    highlightAc();
  } else if (e.key === "Enter") {
    e.preventDefault();
    selectHighlightedOrTyped();
  } else if (e.key === "Escape") {
    hideAutocomplete();
  }
});

autocompleteEl.addEventListener("mousedown", (e) => {
  const item = e.target.closest(".autocomplete-item");
  if (!item) return;
  const type = item.getAttribute("data-type");
  if (type === "other") {
    selectOther(siteInputEl.value.trim());
  } else {
    const index = Number(item.getAttribute("data-index"));
    selectSuggestion(index);
  }
});

function highlightAc() {
  const children = [...autocompleteEl.querySelectorAll('.autocomplete-item')];
  children.forEach(c => c.classList.remove('active'));
  if (acIndex >= 0 && acIndex < children.length) {
    children[acIndex].classList.add('active');
    children[acIndex].scrollIntoView({ block: 'nearest' });
  }
}

function selectSuggestion(index) {
  const it = acItems[index];
  if (!it) return;
  addSiteObject({ name: it.displayName, lat: it.lat, lon: it.lon });
  hideAutocomplete();
}

function selectOther(text) {
  if (!text) return;
  // Use existing add flow which geocodes typed text
  onAddSite();
  hideAutocomplete();
}

function selectHighlightedOrTyped() {
  if (acIndex === -1) { selectOther(siteInputEl.value.trim()); return; }
  const max = acItems.length;
  if (acIndex === max) { selectOther(siteInputEl.value.trim()); return; }
  selectSuggestion(acIndex);
}

function hideAutocomplete() {
  autocompleteEl.hidden = true;
}

function escapeHtml(s) {
  return s.replace(/[&<>"]+/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

function addSiteObject(obj) {
  if (state.sites.length >= MAX_SITES) {
    alert(`Maximum ${MAX_SITES} sites allowed.`);
    return;
  }
  const site = { id: state.nextSiteId++, name: obj.name, lat: obj.lat, lon: obj.lon, marker: null };
  state.sites.push(site);
  addSiteToMap(site);
  renderSitesList();
  fitMapToAll();
  optimizeRouteAndRender();
  persistSites();
  siteInputEl.value = "";
}


