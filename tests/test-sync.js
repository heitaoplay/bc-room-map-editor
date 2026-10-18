// Offline test of the sync pipeline + resilience to NEW upstream content.
// Uses a throw-away copy of the repo and a fake "upstream" folder, so it needs no network.
const fs = require("fs");
const os = require("os");
const path = require("path");
const zlib = require("zlib");
const cp = require("child_process");
const { JSDOM } = require("jsdom");

const repo = path.join(__dirname, "..");
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bc-sync-test-"));
let fail = 0;
const ok = (c, m) => { console.log((c ? "OK   " : "FAIL ") + m); if (!c) fail++; };

// --- throw-away project copy ---
for (const d of ["scripts", "src"]) fs.cpSync(path.join(repo, d), path.join(tmp, d), { recursive: true });
fs.copyFileSync(path.join(repo, "package.json"), path.join(tmp, "package.json"));
fs.symlinkSync(path.join(repo, "node_modules"), path.join(tmp, "node_modules"));
fs.mkdirSync(path.join(tmp, "assets"));
fs.writeFileSync(path.join(tmp, "src", "images.json"), "{}"); // start with NO thumbnails
const run = (script, args = []) => cp.spawnSync(process.execPath, [path.join(tmp, "scripts", script), ...args], { env: { ...process.env, BC_ROOT: tmp }, encoding: "utf8" });

// --- fake upstream ---
function png() { // minimal valid 2x2 PNG
  const crc = (b) => { let c, t = []; for (let n = 0; n < 256; n++) { c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } let x = 0xffffffff; for (const v of b) x = t[(x ^ v) & 255] ^ (x >>> 8); return (x ^ 0xffffffff) >>> 0; };
  const chunk = (type, data) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(2, 0); ihdr.writeUInt32BE(2, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.alloc(2 * (1 + 6), 200);
  for (let y = 0; y < 2; y++) raw[y * 7] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}
const up = path.join(tmp, "fake-upstream");
const mapData = path.join(repo, "src", "catalog.json"); // only used for counts below
fs.mkdirSync(path.join(up, "Assets", "Map", "Tiles", "Floor"), { recursive: true });
fs.mkdirSync(path.join(up, "Assets", "Map", "Objects", "Functional"), { recursive: true });
const realMapData = process.env.BC_MAPDATA_FIXTURE || path.join(__dirname, "fixtures", "MapData.js");
fs.copyFileSync(realMapData, path.join(up, "Assets", "MapData.js"));
fs.writeFileSync(path.join(up, "Assets", "Map", "Tiles", "Floor", "OakWood.png"), png());
fs.writeFileSync(path.join(up, "Assets", "Map", "Tiles", "Floor", "TileBlue.png"), png());
fs.writeFileSync(path.join(up, "Assets", "Map", "Objects", "Functional", "KeyGold.png"), png());
fs.writeFileSync(path.join(up, "Assets", "Map", "Tiles", "Floor", "Broken.png"), "<html>error page</html>"); // must be ignored

// 1) first sync
let r = run("sync-upstream.js", ["--source=" + up]);
ok(r.status === 0, "first sync exits 0" + (r.status ? "\n" + r.stderr + r.stdout : ""));
const img = JSON.parse(fs.readFileSync(path.join(tmp, "src", "images.json"), "utf8"));
ok(img["Floor:OakWood"] && img["Floor:TileBlue"] && img["Functional:KeyGold"], "thumbnails copied + manifest written");
ok(fs.existsSync(path.join(tmp, "assets", "MapTile", "Floor", "TileBlue.png")), "png placed under assets/MapTile/Floor/");
ok(!img["Floor:Broken"], "non-PNG payload ignored");
const state = JSON.parse(fs.readFileSync(path.join(tmp, "data", "upstream-state.json"), "utf8"));
ok(state.counts.tiles > 100 && Array.isArray(state.missingImages) && state.missingImages.length > 0, "state file records counts + missing list (" + state.missingImages.length + " missing)");
ok(fs.existsSync(path.join(tmp, "index.html")), "index.html rebuilt");

// 2) second sync, nothing new -> must not touch anything
const before = fs.statSync(path.join(tmp, "data", "upstream-state.json")).mtimeMs;
const htmlBefore = fs.statSync(path.join(tmp, "index.html")).mtimeMs;
r = run("sync-upstream.js", ["--source=" + up]);
ok(r.status === 0 && /NO update needed/.test(r.stdout), "second sync reports NO update needed");
ok(fs.statSync(path.join(tmp, "data", "upstream-state.json")).mtimeMs === before && fs.statSync(path.join(tmp, "index.html")).mtimeMs === htmlBefore, "no files rewritten when upstream unchanged");

// 3) upstream adds a new thumbnail + a brand-new style in a known type + a brand-new Type
fs.writeFileSync(path.join(up, "Assets", "Map", "Tiles", "Floor", "TileGreen.png"), png());
let md = fs.readFileSync(path.join(up, "Assets", "MapData.js"), "utf8");
md = md.replace(/(\t\{ ID: 100, Type: "Floor", Style: "OakWood", Name: "Oak Planks"\},)/, '$1\n\t{ ID: 9001, Type: "Floor", Style: "TileMagenta", Name: "Magenta Tiles"},\n\t{ ID: 9002, Type: "Floor", Style: "ZorpGlimmer", Name: "Glimmering Zorp"},\n\t{ ID: 9003, Type: "BrandNewType", Style: "LightBlueCrystalChair", Name: "Crystal Chair"},');
// the 3rd line above must live in the OBJECT list: move it there
const objIdx = md.indexOf("AssetsMapDataObjects");
const crystal = '\t{ ID: 9003, Type: "BrandNewType", Style: "LightBlueCrystalChair", Name: "Crystal Chair"},\n';
md = md.replace(crystal, "");
md = md.replace(/(AssetsMapDataObjects[^\[]*\[\s*\n)/, "$1" + crystal);
fs.writeFileSync(path.join(up, "Assets", "MapData.js"), md);
r = run("sync-upstream.js", ["--source=" + up]);
ok(r.status === 0, "sync after upstream change exits 0" + (r.status ? "\n" + r.stderr + r.stdout : ""));
const cat = JSON.parse(fs.readFileSync(path.join(tmp, "src", "catalog.json"), "utf8"));
ok(cat.byStyle["Floor:TileMagenta"] === 9001 && cat.byStyle["BrandNewType:LightBlueCrystalChair"] === 9003, "new parts appear in catalog automatically");
ok(JSON.parse(fs.readFileSync(path.join(tmp, "src", "images.json"), "utf8"))["Floor:TileGreen"], "newly published thumbnail picked up");

// 4) the rebuilt editor handles the new parts with ZERO manual translation / category work
function load(locale) {
  const html = fs.readFileSync(path.join(tmp, "index.html"), "utf8");
  const errors = [];
  const dom = new JSDOM(html, { runScripts: "dangerously", url: "http://localhost/", beforeParse(w) {
    w.navigator.clipboard = { writeText: () => Promise.resolve() };
    try { w.localStorage.setItem("bc-map-locale", locale); } catch (e) {}
    w.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
  } });
  return { w: dom.window, errors };
}
const tw = load("tw");
setTimeout(() => {
try {
const L = (type, style) => tw.w.MAP_I18N.labelForComp({ type, style });
ok(L("Floor", "TileMagenta") === "洋紅色地磚", "auto Traditional label from tokens: TileMagenta -> " + L("Floor", "TileMagenta"));
ok(L("Floor", "ZorpGlimmer") === "ZorpGlimmer".replace(/([a-z])([A-Z])/g, "$1 $2"), "unknown words fall back to readable English: " + L("Floor", "ZorpGlimmer"));
ok(tw.w.MAP_I18N.labelForComp({ type: "Floor", style: "ZorpGlimmer", name: "Glimmering Zorp" }) === "Glimmering Zorp", "BC English name used when present");
ok(L("Floor", "CheckerCarpetBlue") === "藍色格紋地毯", "existing label converted to Traditional: " + L("Floor", "CheckerCarpetBlue"));
tw.w.document.getElementById("catMenuBtn").click();
const tops = [...tw.w.document.querySelectorAll(".cat-group-title")].map((e) => e.textContent);
ok(tops.length === 6 && /其他/.test(tops[5]), "automatic 'Other (new)' group appears for the unknown Type: " + tops.join(" | "));
const subs = [...tw.w.document.querySelectorAll(".cat-sub-item")].map((e) => e.textContent);
ok(subs.includes("Brand New Type"), "sub-group named after the new Type: " + subs.slice(-2).join(","));
tw.w.document.querySelectorAll(".cat-group-title")[5].click();
const pal = [...tw.w.document.querySelectorAll(".pal-item")];
ok(pal.length === 1, "new part is listed in the palette");
pal[0].click();
tw.w.document.querySelector("#grid").children[0] && tw.w.document.querySelector("#grid").children[0].dispatchEvent(new tw.w.MouseEvent("mousedown", { bubbles: true, button: 0 }));
tw.w.document.dispatchEvent(new tw.w.MouseEvent("mouseup", { bubbles: true }));
ok(tw.errors.length === 0, "0 JS errors with new content (" + tw.errors.join("; ") + ")");

} catch (e) { console.log("FAIL exception: " + e.stack); fail++; }
fs.rmSync(tmp, { recursive: true, force: true });
console.log(fail ? "\nRESULT: SYNC TEST FAILED" : "\nRESULT: SYNC OK");
process.exit(fail ? 1 : 0);
}, 300);
