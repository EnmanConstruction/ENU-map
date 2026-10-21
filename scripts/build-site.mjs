import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const output = path.join(root, "dist");
const files = [
  "styles.css",
  "config.js",
  "data.js",
  "data-loader.js",
  "identity-data.js",
  "app.js",
  "neighbourhoods-template.csv",
  "DATA_GUIDE.md"
];

await rm(output, { recursive: true, force: true });
await mkdir(output, { recursive: true });

const dataSource = await readFile(path.join(root, "data.js"), "utf8");
const snapshot = dataSource.match(/asOf:\s*["']([^"']+)["']/)?.[1] || "snapshot";
const revision = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || snapshot.replace(/[^a-z0-9-]/gi, "-");

let html = await readFile(path.join(root, "index.html"), "utf8");
for (const file of ["styles.css", "config.js", "data.js", "data-loader.js", "identity-data.js", "app.js"]) {
  const escaped = file.replace(".", "\\.");
  html = html.replace(new RegExp(`(["'])${escaped}(?:\\?[^"']*)?\\1`, "g"), `"${file}?v=${revision}"`);
}

await writeFile(path.join(output, "index.html"), html);
await Promise.all(files.map(file => cp(path.join(root, file), path.join(output, file))));

console.log(`Built ENU map revision ${revision} from City snapshot ${snapshot}.`);
