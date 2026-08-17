// Build a fully self-contained index.html (works from file://, no server needed).
// Inlines LZString.js, catalog.json, map-lib.js, and the UI script into editor-src.html.
const fs = require("fs");
const path = require("path");
const root = path.join(__dirname, "..");
const dir = path.join(root, "src");

const lz = fs.readFileSync(path.join(dir, "LZString.js"), "utf8");
const cat = fs.readFileSync(path.join(dir, "catalog.json"), "utf8");
const lib = fs.readFileSync(path.join(dir, "map-lib.js"), "utf8");
const ui = fs.readFileSync(path.join(dir, "editor-ui.js"), "utf8");
const zh = fs.readFileSync(path.join(dir, "zh-labels.js"), "utf8");
const i18n = fs.readFileSync(path.join(dir, "i18n.js"), "utf8");
const images = fs.readFileSync(path.join(dir, "images.json"), "utf8");
let html = fs.readFileSync(path.join(dir, "editor-src.html"), "utf8");

html = html.replace("/*__LZSTRING__*/", () => lz);
html = html.replace("/*__CATALOG__*/", () => "window.MAP_CATALOG = " + cat + ";");
html = html.replace("/*__MAPLIB__*/", () => lib);
html = html.replace("/*__ZH_LABELS__*/", () => zh);
html = html.replace("/*__I18N__*/", () => i18n);
html = html.replace("/*__IMAGES__*/", () => "window.MAP_IMAGES = " + images + ";");
html = html.replace("/*__UI__*/", () => ui);

const out = path.join(root, "index.html");
fs.writeFileSync(out, html);
console.log("Wrote", out, "(", fs.statSync(out).size, "bytes )");

// sanity: ensure no placeholder remains
if (html.includes("/*__")) { console.error("WARNING: leftover placeholder!"); process.exit(1); }
