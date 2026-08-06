import { writeFile } from "node:fs/promises";

const SNAPSHOT_DATE = "2026-08-06";
const HOUSING_START_DATE = "2024-08-06T00:00:00.000";
const OUTPUT_URL = new URL("../data.js", import.meta.url);

const ENDPOINTS = Object.freeze({
  neighbourhoods: "https://data.edmonton.ca/resource/65fr-66s6.json",
  centroids: "https://data.edmonton.ca/resource/3b6m-fezs.json",
  developmentPermits: "https://data.edmonton.ca/resource/2ccn-pwtu.json",
  buildingPermits: "https://data.edmonton.ca/resource/24uj-dj8v.json"
});

const COUNCILLORS = Object.freeze({
  "Anirniq": "Erin Rutherford",
  "Dene": "Aaron Paquette",
  "Ipiihkoohkanipiaohtsi": "Jon Morgan",
  "Karhiio": "Keren Tang",
  "Métis": "Ashley Salvador",
  "Nakota Isga": "Reed Clarke",
  "O-day'min": "Anne Stevenson",
  "papastew": "Michael Janz",
  "pihêsiwin": "Mike Elliott",
  "sipiwiyiniwak": "Thu Parmar",
  "Sspomitapi": "Jo-Anne Wright",
  "tastawiyiniwak": "Karen Principe"
});

// Temporary ENU review results already shown in the public map.
// New City rows remain unknown until ENU confirms them.
const ENU_PRESENCE_OVERRIDES = Object.freeze({
  "Wîhkwêntôwin": true,
  "Downtown": true,
  "Strathcona": true,
  "Ritchie": true,
  "Westmount": false,
  "Garneau": false,
  "Glenora": false,
  "Highlands": false,
  "Bonnie Doon": false,
  "Keswick": false,
  "Windermere": false,
  "Laurel": false
});

function apiUrl(endpoint, params) {
  const url = new URL(endpoint);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url;
}

async function fetchJson(url, label) {
  const response = await fetch(url, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`${label} request failed with HTTP ${response.status}.`);
  return response.json();
}

function normalizeName(value) {
  return String(value ?? "").trim().toLocaleUpperCase("en-CA");
}

function numericCount(value) {
  const count = Number(value);
  return Number.isFinite(count) && count >= 0 ? count : 0;
}

async function buildRows() {
  const requests = [
    fetchJson(apiUrl(ENDPOINTS.neighbourhoods, {
      "$select": "name,neighbourhood_number,descriptive_name,civic_ward_name,district",
      "$limit": "5000"
    }), "Neighbourhood metadata"),
    fetchJson(apiUrl(ENDPOINTS.centroids, {
      "$select": "number,name_mixed,latitude,longitude",
      "$limit": "5000"
    }), "Neighbourhood centroids"),
    fetchJson(apiUrl(ENDPOINTS.developmentPermits, {
      "$select": "neighbourhood,count(*) as active_permits",
      "$where": "status='In Progress'",
      "$group": "neighbourhood",
      "$limit": "5000"
    }), "Development permits"),
    fetchJson(apiUrl(ENDPOINTS.buildingPermits, {
      "$select": "neighbourhood,count(*) as housing_permits",
      "$where": `issue_date >= '${HOUSING_START_DATE}' AND work_type='(01) Building - New' AND units_added > 0`,
      "$group": "neighbourhood",
      "$limit": "5000"
    }), "Building permits")
  ];

  const [neighbourhoods, centroids, developmentPermits, buildingPermits] = await Promise.all(requests);
  const centroidByNumber = new Map(centroids.map(row => [String(row.number), row]));
  const centroidByName = new Map(centroids.map(row => [normalizeName(row.name_mixed), row]));
  const permitsByName = new Map(developmentPermits.map(row => [normalizeName(row.neighbourhood), numericCount(row.active_permits)]));
  const housingByName = new Map(buildingPermits.map(row => [normalizeName(row.neighbourhood), numericCount(row.housing_permits)]));

  const missingCentroids = [];
  const rows = neighbourhoods.flatMap(neighbourhood => {
    const name = String(neighbourhood.descriptive_name || neighbourhood.name || "").trim();
    const centroid = centroidByNumber.get(String(neighbourhood.neighbourhood_number)) || centroidByName.get(normalizeName(name));
    const lat = Number(centroid?.latitude);
    const lng = Number(centroid?.longitude);
    if (!name || !Number.isFinite(lat) || !Number.isFinite(lng)) {
      missingCentroids.push(name || neighbourhood.neighbourhood_number || "Unnamed neighbourhood");
      return [];
    }

    const ward = String(neighbourhood.civic_ward_name || "").trim();
    const presence = Object.hasOwn(ENU_PRESENCE_OVERRIDES, name) ? ENU_PRESENCE_OVERRIDES[name] : null;
    return [{
      name,
      lat,
      lng,
      permits: permitsByName.get(normalizeName(name)) || 0,
      infill: housingByName.get(normalizeName(name)) || 0,
      enuPresence: presence,
      ward,
      councillor: COUNCILLORS[ward] || "TBD",
      leader: "",
      leaderEmail: "",
      notes: ""
    }];
  }).sort((a, b) => a.name.localeCompare(b.name, "en-CA"));

  if (missingCentroids.length) {
    console.warn(`Skipped ${missingCentroids.length} row(s) without coordinates: ${missingCentroids.join(", ")}`);
  }
  if (!rows.length) throw new Error("No City neighbourhood rows were generated.");
  return rows;
}

function serialize(rows) {
  const data = JSON.stringify(rows, null, 2);
  return `// Generated by scripts/build-city-data.mjs. Do not hand-edit City metrics.\n` +
    `// Sources: City of Edmonton neighbourhoods, centroids, development permits, and building permits.\n` +
    `const ENU_DATA_SNAPSHOT = Object.freeze({ asOf: "${SNAPSHOT_DATE}", housingStart: "${HOUSING_START_DATE.slice(0, 10)}", rowCount: ${rows.length} });\n` +
    `const FALLBACK_PUBLIC_DATA = ${data};\n`;
}

const rows = await buildRows();
await writeFile(OUTPUT_URL, serialize(rows), "utf8");

const knownYes = rows.filter(row => row.enuPresence === true).length;
const knownNo = rows.filter(row => row.enuPresence === false).length;
console.log(`Generated ${rows.length} neighbourhoods (${knownYes} Yes, ${knownNo} No, ${rows.length - knownYes - knownNo} Unknown).`);
