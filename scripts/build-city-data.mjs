import { writeFile } from "node:fs/promises";

const now = new Date();
const snapshotDate = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const housingStartDate = new Date(snapshotDate);
housingStartDate.setUTCFullYear(housingStartDate.getUTCFullYear() - 2);

const SNAPSHOT_DATE = snapshotDate.toISOString().slice(0, 10);
const HOUSING_START_DATE = `${housingStartDate.toISOString().slice(0, 10)}T00:00:00.000`;
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
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, { headers: { Accept: "application/json" } });
      if (!response.ok) throw new Error(`${label} request failed with HTTP ${response.status}.`);
      return await response.json();
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 1000));
    }
  }
  throw lastError;
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
  validateRows(rows, missingCentroids);
  return rows;
}

function validateRows(rows, missingCentroids) {
  const expectedWards = Object.keys(COUNCILLORS).sort();
  const actualWards = [...new Set(rows.map(row => row.ward))].sort();
  const duplicateNames = rows.filter((row, index) => rows.findIndex(item => item.name === row.name) !== index);
  const invalidCoordinates = rows.filter(row => row.lat < 53.3 || row.lat > 53.8 || row.lng < -114 || row.lng > -113.1);
  const missingOverrides = Object.keys(ENU_PRESENCE_OVERRIDES).filter(name => !rows.some(row => row.name === name));
  const totalPermits = rows.reduce((sum, row) => sum + row.permits, 0);
  const totalHousingPermits = rows.reduce((sum, row) => sum + row.infill, 0);

  const failures = [];
  if (rows.length < 380) failures.push(`Only ${rows.length} neighbourhoods were returned; expected at least 380.`);
  if (missingCentroids.length > 5) failures.push(`${missingCentroids.length} neighbourhoods are missing coordinates.`);
  if (JSON.stringify(actualWards) !== JSON.stringify(expectedWards)) failures.push("The City ward list is incomplete or has changed.");
  if (rows.some(row => row.councillor === "TBD")) failures.push("At least one ward does not have a councillor mapping.");
  if (duplicateNames.length) failures.push("Duplicate neighbourhood names were returned.");
  if (invalidCoordinates.length) failures.push("At least one neighbourhood coordinate falls outside Edmonton's expected bounds.");
  if (missingOverrides.length) failures.push(`ENU review rows disappeared: ${missingOverrides.join(", ")}.`);
  if (totalPermits < 100) failures.push("The active permit total is unexpectedly low.");
  if (totalHousingPermits < 100) failures.push("The housing permit total is unexpectedly low.");

  if (failures.length) throw new Error(`City data validation failed:\n- ${failures.join("\n- ")}`);
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
