(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ENUData = api;
})(typeof window !== "undefined" ? window : globalThis, function () {
  const HEADER_ALIASES = Object.freeze({
    name: ["name", "neighbourhood", "neighborhood"],
    lat: ["lat", "latitude"],
    lng: ["lng", "lon", "long", "longitude"],
    permits: ["permits", "active_permits", "development_permits"],
    infill: ["infill", "infill_permits"],
    enuPresence: ["enu_presence", "enupresence", "enu"],
    ward: ["ward"],
    councillor: ["councillor", "councilor"],
    leader: ["leader", "enu_leader"],
    leaderEmail: ["leader_email", "leaderemail"],
    notes: ["notes", "public_notes"],
    lastUpdated: ["last_updated", "lastupdated", "updated_at"]
  });

  function parseCsv(text) {
    const rows = [];
    let row = [];
    let field = "";
    let quoted = false;

    for (let i = 0; i < text.length; i += 1) {
      const char = text[i];
      const next = text[i + 1];

      if (char === '"' && quoted && next === '"') {
        field += '"';
        i += 1;
      } else if (char === '"') {
        quoted = !quoted;
      } else if (char === "," && !quoted) {
        row.push(field);
        field = "";
      } else if ((char === "\n" || char === "\r") && !quoted) {
        if (char === "\r" && next === "\n") i += 1;
        row.push(field);
        if (row.some(value => value.trim() !== "")) rows.push(row);
        row = [];
        field = "";
      } else {
        field += char;
      }
    }

    row.push(field);
    if (row.some(value => value.trim() !== "")) rows.push(row);
    return rows;
  }

  function normalizeHeader(value) {
    return value.trim().toLowerCase().replace(/[\s-]+/g, "_");
  }

  function findColumn(headers, aliases) {
    return headers.findIndex(header => aliases.includes(header));
  }

  function textValue(value, maxLength = 240) {
    return String(value ?? "").trim().slice(0, maxLength);
  }

  function numberValue(value) {
    const parsed = Number(String(value ?? "").replace(/,/g, "").trim());
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
  }

  function coordinateValue(value) {
    const parsed = Number(String(value ?? "").trim());
    return Number.isFinite(parsed) ? parsed : null;
  }

  function presenceValue(value) {
    const normalized = String(value ?? "").trim().toLowerCase();
    if (["yes", "y", "true", "1"].includes(normalized)) return true;
    if (["no", "n", "false", "0"].includes(normalized)) return false;
    if (["", "unknown", "unconfirmed", "pending", "tbd"].includes(normalized)) return null;
    return undefined;
  }

  function updatedDateValue(value) {
    const normalized = textValue(value, 60);
    if (!normalized) return null;
    const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(normalized);
    const parsed = Date.parse(dateOnly ? `${normalized}T12:00:00` : normalized);
    return Number.isFinite(parsed) ? parsed : null;
  }

  function normalizePublicCsv(csvText) {
    const matrix = parseCsv(csvText.replace(/^\uFEFF/, ""));
    if (matrix.length < 2) throw new Error("The sheet has no data rows.");

    const headers = matrix[0].map(normalizeHeader);
    const indexes = Object.fromEntries(
      Object.entries(HEADER_ALIASES).map(([key, aliases]) => [key, findColumn(headers, aliases)])
    );
    const required = ["name", "lat", "lng", "permits", "infill", "enuPresence", "ward"];
    const missing = required.filter(key => indexes[key] < 0);
    if (missing.length) throw new Error(`Missing required columns: ${missing.join(", ")}.`);

    const issues = [];
    const rows = [];
    const updatedDates = [];

    matrix.slice(1).forEach((cells, offset) => {
      const rowNumber = offset + 2;
      const read = key => indexes[key] < 0 ? "" : cells[indexes[key]];
      const name = textValue(read("name"), 100);
      const lat = coordinateValue(read("lat"));
      const lng = coordinateValue(read("lng"));
      const permits = numberValue(read("permits"));
      const infill = numberValue(read("infill"));
      const enuPresence = presenceValue(read("enuPresence"));
      const ward = textValue(read("ward"), 100);

      if (!name || lat === null || lng === null || permits === null || infill === null || enuPresence === undefined || !ward || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        issues.push(`Row ${rowNumber} was skipped because a required value is missing or invalid.`);
        return;
      }

      const parsedDate = updatedDateValue(read("lastUpdated"));
      if (parsedDate !== null) updatedDates.push(parsedDate);

      rows.push({
        name,
        lat,
        lng,
        permits,
        infill,
        enuPresence,
        ward,
        councillor: textValue(read("councillor"), 100) || "TBD",
        leader: textValue(read("leader"), 100),
        leaderEmail: textValue(read("leaderEmail"), 160),
        notes: textValue(read("notes"), 500)
      });
    });

    if (!rows.length) throw new Error("The sheet did not contain any valid neighbourhood rows.");
    return {
      rows,
      issues,
      updatedAt: updatedDates.length ? new Date(Math.max(...updatedDates)) : new Date()
    };
  }

  async function loadPublicData(config, fallbackRows) {
    const url = String(config?.publicCsvUrl || "").trim();
    if (!url) {
      return { rows: fallbackRows, source: "demo", issues: [], updatedAt: null, error: null };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), Number(config.timeoutMs) || 8000);

    try {
      const response = await fetch(url, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`The sheet returned HTTP ${response.status}.`);
      const result = normalizePublicCsv(await response.text());
      return { ...result, source: "live", error: null };
    } catch (error) {
      return {
        rows: fallbackRows,
        source: "fallback",
        issues: [],
        updatedAt: null,
        error: error?.name === "AbortError" ? "The sheet request timed out." : error?.message || "The sheet could not be loaded."
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { parseCsv, normalizePublicCsv, loadPublicData };
});
