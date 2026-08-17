// Download BC map component images from the gitgud source repo into ./assets,
// and write images.json manifest: { "Type:Style": "assets/MapTile|MapObject/...png" }.
// Skips *:Blank and any 404 (those fall back to color blocks in the editor).
const fs = require("fs");
const path = require("path");
const https = require("https");
const cat = require("../src/catalog.json");
const root = path.join(__dirname, "..");
const BASE = "https://gitgud.io/BondageProjects/Bondage-College/-/raw/master/BondageClub/Screens/Online/ChatRoom/";

function get(url) {
  return new Promise((resolve) => {
    const req = https.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
      if (res.statusCode !== 200) { res.resume(); return resolve(null); }
      const chunks = [];
      res.on("data", (c) => chunks.push(c));
      res.on("end", () => resolve(Buffer.concat(chunks)));
    });
    req.on("error", () => resolve(null));
    req.setTimeout(20000, () => { req.destroy(); resolve(null); });
  });
}

async function run() {
  const manifest = {};
  const jobs = [];
  for (const t of cat.tiles) {
    if (t.style === "Blank") continue;
    jobs.push({ layer: "MapTile", type: t.type, style: t.style });
  }
  for (const o of cat.objects) {
    if (o.style === "Blank") continue;
    jobs.push({ layer: "MapObject", type: o.type, style: o.style });
  }
  let ok = 0, miss = 0, totalBytes = 0;
  for (let i = 0; i < jobs.length; i++) {
    const j = jobs[i];
    const rel = `${j.layer}/${j.type}/${j.style}.png`;
    const url = BASE + rel;
    const buf = await get(url);
    if (buf && buf.length > 100) {
      const out = path.join(root, "assets", rel);
      fs.mkdirSync(path.dirname(out), { recursive: true });
      fs.writeFileSync(out, buf);
      manifest[`${j.type}:${j.style}`] = "assets/" + rel;
      ok++; totalBytes += buf.length;
    } else {
      miss++;
    }
    if ((i + 1) % 25 === 0) console.log(`progress ${i + 1}/${jobs.length}  ok=${ok} miss=${miss}`);
  }
  fs.writeFileSync(path.join(root, "src", "images.json"), JSON.stringify(manifest));
  console.log(`\nDONE: ${ok} images saved, ${miss} missing/skipped. total ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
  console.log("manifest entries:", Object.keys(manifest).length);
}

run();
