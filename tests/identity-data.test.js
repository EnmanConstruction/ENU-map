const assert = require("node:assert/strict");
const { resolve } = require("../identity-data.js");

const rows = [
  { name: "Windermere" },
  { name: "Callingwood North" },
  { name: "Callingwood South" },
  { name: "Brander Gardens" },
  { name: "Brookside" },
  { name: "Bulyea Heights" },
  { name: "Ramsay Heights" },
  { name: "Rhatigan Ridge" }
];

assert.equal(resolve("Windermere", rows).type, "official");
assert.equal(resolve("langdale", rows).rows[0].name, "Windermere");
assert.equal(resolve("Callingwood", rows).rows.length, 2);
assert.equal(resolve("Riverbend", rows).rows.length, 5);
assert.equal(resolve("Not a place", rows), null);

console.log("identity-data tests passed");
