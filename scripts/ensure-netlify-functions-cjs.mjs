/**
 * Netlify Functions v1 are bundled to CommonJS wrappers under
 * `.netlify/functions-serve/<name>/<name>.js` (`module.exports = require(...)`).
 * With a root `"type": "module"`, those wrappers crash unless a nearby
 * `package.json` sets `"type":"commonjs"`.
 *
 * The CLI sometimes omits that file for newly bundled functions (esp. fertilizer).
 * We write:
 *   1) `.netlify/functions-serve/package.json` — covers every function folder
 *   2) each `.netlify/functions-serve/<name>/package.json` — belt-and-suspenders
 */
import fs from "node:fs";
import path from "node:path";

const marker = `${JSON.stringify({ type: "commonjs" }, null, 2)}\n`;
const serveRoot = path.resolve(".netlify/functions-serve");

if (!fs.existsSync(serveRoot)) process.exit(0);

function writeMarker(filePath) {
  const prev = fs.existsSync(filePath)
    ? fs.readFileSync(filePath, "utf8")
    : null;
  if (prev === marker) return false;
  fs.writeFileSync(filePath, marker);
  return true;
}

let fixed = 0;

if (writeMarker(path.join(serveRoot, "package.json"))) fixed += 1;

for (const name of fs.readdirSync(serveRoot)) {
  const dir = path.join(serveRoot, name);
  if (!fs.statSync(dir).isDirectory()) continue;

  const entry = path.join(dir, `${name}.js`);
  if (!fs.existsSync(entry)) continue;

  if (writeMarker(path.join(dir, "package.json"))) fixed += 1;
}

if (fixed > 0) {
  console.log(
    `ensure-netlify-functions-cjs: wrote/updated ${fixed} package.json marker(s)`
  );
}
