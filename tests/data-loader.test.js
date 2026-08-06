const assert = require("node:assert/strict");
const { parseCsv, normalizePublicCsv } = require("../data-loader.js");

const parsed = parseCsv('name,notes\nOliver,"Supports commas, and ""quotes"""\n');
assert.deepEqual(parsed, [
  ["name", "notes"],
  ["Oliver", 'Supports commas, and "quotes"']
]);

const validCsv = [
  "name,lat,lng,permits,infill,enu_presence,ward,councillor,public_notes,last_updated",
  "Oliver,53.544,-113.516,210,120,Yes,O-day'min,TBD,Ready,2026-08-06",
  "Downtown,53.540,-113.499,100,10,Unknown,O-day'min,TBD,Reviewing,2026-08-06",
  "Broken,not-a-number,-113.5,10,5,Yes,Ward,TBD,,2026-08-06"
].join("\n");

const normalized = normalizePublicCsv(validCsv);
assert.equal(normalized.rows.length, 2);
assert.equal(normalized.rows[0].name, "Oliver");
assert.equal(normalized.rows[0].enuPresence, true);
assert.equal(normalized.rows[0].lng, -113.516);
assert.equal(normalized.rows[1].enuPresence, null);
assert.equal(normalized.issues.length, 1);

assert.throws(
  () => normalizePublicCsv("name,lat\nOliver,53.5"),
  /Missing required columns/
);

console.log("data-loader tests passed");
