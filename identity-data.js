(function (root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  root.ENUIdentity = api;
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const ALIASES = Object.freeze([
    Object.freeze({ name: "Langdale", officialNames: Object.freeze(["Windermere"]), kind: "local community" }),
    Object.freeze({ name: "Callingwood", officialNames: Object.freeze(["Callingwood North", "Callingwood South"]), kind: "area" }),
    Object.freeze({
      name: "Riverbend",
      officialNames: Object.freeze(["Brander Gardens", "Brookside", "Bulyea Heights", "Ramsay Heights", "Rhatigan Ridge"]),
      kind: "area"
    })
  ]);

  function normalize(value) {
    return String(value ?? "").trim().toLocaleLowerCase("en-CA");
  }

  function findAlias(value) {
    const query = normalize(value);
    return ALIASES.find(alias => normalize(alias.name) === query) || null;
  }

  function resolve(value, rows) {
    const query = normalize(value);
    const official = rows.find(row => normalize(row.name) === query);
    if (official) return { type: "official", name: official.name, rows: [official] };

    const alias = findAlias(value);
    if (!alias) return null;
    const matches = alias.officialNames.map(name => rows.find(row => normalize(row.name) === normalize(name))).filter(Boolean);
    if (matches.length !== alias.officialNames.length) return null;
    return { type: matches.length === 1 ? "alias" : "area", name: alias.name, kind: alias.kind, rows: matches };
  }

  return Object.freeze({ aliases: ALIASES, findAlias, resolve });
});
