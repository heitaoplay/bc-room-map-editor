// Build a fully self-contained index.html (works from file://, no server needed).
// Inlines LZString.js, catalog.json, map-lib.js, and the UI script into editor-src.html.
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const root = process.env.BC_ROOT || path.join(__dirname, "..");
const dir = path.join(root, "src");

const lz = fs.readFileSync(path.join(dir, "LZString.js"), "utf8");
const cat = fs.readFileSync(path.join(dir, "catalog.json"), "utf8");
const lib = fs.readFileSync(path.join(dir, "map-lib.js"), "utf8");
const ui = fs.readFileSync(path.join(dir, "editor-ui.js"), "utf8");
const zh = fs.readFileSync(path.join(dir, "zh-labels.js"), "utf8");
const i18n = fs.readFileSync(path.join(dir, "i18n.js"), "utf8");
const images = fs.readFileSync(path.join(dir, "images.json"), "utf8");
const autoLabels = fs.readFileSync(path.join(dir, "auto-labels.js"), "utf8");
let html = fs.readFileSync(path.join(dir, "editor-src.html"), "utf8");

// Traditional-Chinese (Taiwan wording) tables are DERIVED from the Simplified sources at build time,
// so zh-labels.js / auto-labels.js stay the single source of truth and nobody maintains a second copy.
// If opencc-js is not installed the tw locale simply shows the Simplified text (same as before).
function buildTwTables() {
	let conv;
	try { conv = require("opencc-js").Converter({ from: "cn", to: "twp" }); }
	catch (e) { console.warn("opencc-js not available -> tw tables skipped (run npm install)"); return "/* tw tables skipped */"; }
	const sandbox = { window: {} };
	vm.createContext(sandbox);
	vm.runInContext(zh + "\n" + autoLabels, sandbox);
	const w = sandbox.window;
	const mapVals = (o) => Object.fromEntries(Object.entries(o || {}).map(([k, v]) => [k, conv(v)]));
	return [
		"window.MAP_ZH_LABELS_TW = " + JSON.stringify(mapVals(w.MAP_ZH_LABELS)) + ";",
		"window.MAP_ZH_COLORS_TW = " + JSON.stringify(mapVals(w.MAP_ZH_COLORS)) + ";",
		"window.MAP_ZH_MODIFIERS_TW = " + JSON.stringify(mapVals(w.MAP_ZH_MODIFIERS)) + ";",
		"window.MAP_ZH_WORDS_TW = " + JSON.stringify(mapVals(w.MAP_ZH_WORDS)) + ";",
		"window.MAP_ZH_TYPES_TW = " + JSON.stringify(mapVals(w.MAP_ZH_TYPES)) + ";",
	].join("\n");
}

html = html.replace("/*__LZSTRING__*/", () => lz);
html = html.replace("/*__CATALOG__*/", () => "window.MAP_CATALOG = " + cat + ";");
html = html.replace("/*__MAPLIB__*/", () => lib);
html = html.replace("/*__AUTO_LABELS__*/", () => autoLabels);
html = html.replace("/*__ZH_LABELS__*/", () => zh);
html = html.replace("/*__ZH_TW__*/", () => buildTwTables());
html = html.replace("/*__I18N__*/", () => i18n);
html = html.replace("/*__IMAGES__*/", () => "window.MAP_IMAGES = " + images + ";");
html = html.replace("/*__UI__*/", () => ui);

const out = path.join(root, "index.html");
fs.writeFileSync(out, html);
console.log("Wrote", out, "(", fs.statSync(out).size, "bytes )");

// sanity: ensure no placeholder remains
if (html.includes("/*__")) { console.error("WARNING: leftover placeholder!"); process.exit(1); }
