// Download BC map component images into ./assets and write src/images.json:
//   { "Type:Style": "assets/MapTile|MapObject/<Type>/<Style>.png" }
//
// R133+ layout:  Assets/Map/Tiles/<Type>/<Style>.png  and  Assets/Map/Objects/<Type>/<Style>.png
// (older games used Screens/Online/ChatRoom/MapTile|MapObject/...). Several mirrors are tried in order.
//
// Incremental: entries already present in images.json (and on disk) are kept; only missing ones are fetched.
// Re-typed legacy objects (e.g. FloorDecoration:KeyGold → Functional:KeyGold) reuse the old file.
//
// Usage:  node scripts/download-assets.js [--force] [--base=<url ending in />]
const fs = require("fs");
const path = require("path");
const https = require("https");
const root = process.env.BC_ROOT || path.join(__dirname, "..");
const cat = JSON.parse(fs.readFileSync(path.join(root, "src", "catalog.json"), "utf8"));
const force = process.argv.includes("--force");
const customBase = (process.argv.find((a) => a.startsWith("--base=")) || "").slice(7);

// Order matters: first hit wins. Add the club domain you can reach.
const BASES = [
	customBase,
	"https://www.bondageprojects.elementfx.com/R133/BondageClub/",
	"https://www.bondage-europe.com/BondageClub/",
	"https://gitgud.io/BondageProjects/Bondage-College/-/raw/master/BondageClub/",
].filter(Boolean);

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

async function fetchImage(layer, type, style) {
	const dir = layer === "MapTile" ? "Tiles" : "Objects";
	const legacyDir = layer; // MapTile / MapObject
	for (const base of BASES) {
		for (const rel of [`Assets/Map/${dir}/${type}/${style}.png`, `Screens/Online/ChatRoom/${legacyDir}/${type}/${style}.png`]) {
			const buf = await get(base + rel);
			if (buf && buf.length > 100) return buf;
		}
	}
	return null;
}

async function run() {
	const manifestPath = path.join(root, "src", "images.json");
	const manifest = fs.existsSync(manifestPath) ? JSON.parse(fs.readFileSync(manifestPath, "utf8")) : {};
	const jobs = [];
	for (const t of cat.tiles) if (t.style !== "Blank") jobs.push({ layer: "MapTile", type: t.type, style: t.style });
	for (const o of cat.objects) if (o.style !== "Blank") jobs.push({ layer: "MapObject", type: o.type, style: o.style });

	let ok = 0, kept = 0, miss = 0, totalBytes = 0;
	const missing = [];
	for (let i = 0; i < jobs.length; i++) {
		const j = jobs[i];
		const key = `${j.type}:${j.style}`;
		if (!force && manifest[key] && fs.existsSync(path.join(root, manifest[key]))) { kept++; continue; }
		const rel = `${j.layer}/${j.type}/${j.style}.png`;
		const buf = await fetchImage(j.layer, j.type, j.style);
		if (buf) {
			const out = path.join(root, "assets", rel);
			fs.mkdirSync(path.dirname(out), { recursive: true });
			fs.writeFileSync(out, buf);
			manifest[key] = "assets/" + rel;
			ok++; totalBytes += buf.length;
		} else { miss++; missing.push(key); }
		if ((i + 1) % 25 === 0) console.log(`progress ${i + 1}/${jobs.length}  new=${ok} kept=${kept} miss=${miss}`);
	}
	fs.writeFileSync(manifestPath, JSON.stringify(manifest));
	console.log(`\nDONE: ${ok} new, ${kept} kept, ${miss} missing. new data ${(totalBytes / 1024 / 1024).toFixed(1)} MB`);
	if (missing.length) console.log("missing (editor falls back to color blocks):", missing.join(", "));
	console.log("manifest entries:", Object.keys(manifest).length, "— now run: npm run build");
}

run();
