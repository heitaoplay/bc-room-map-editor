#!/usr/bin/env node
// Sync map data + thumbnails from the official Bondage Club repository.
//
//   node scripts/sync-upstream.js                 # normal run (what the daily workflow does)
//   node scripts/sync-upstream.js --force         # ignore the saved state, re-sync everything
//   node scripts/sync-upstream.js --check-only    # only report whether upstream changed
//   node scripts/sync-upstream.js --source=<dir>  # use a local BondageClub checkout (dir that contains Assets/)
//
// How "only update when something is new" works:
//   1. `git ls-remote` (one tiny request) -> if the upstream commit is the one we synced last, stop.
//   2. Otherwise a blobless, depth-1 clone fetches only tree objects; the git object ids of
//      `Assets/MapData.js` and `Assets/Map/` are compared with data/upstream-state.json.
//      Same ids -> nothing relevant changed -> stop (nothing is written, so no commit is produced).
//   3. Only when one of them differs, the sparse checkout downloads just those files, then
//      catalog.json, images.json, assets/ and index.html are regenerated.
//
// Output for CI: appends `updated=true|false` to $GITHUB_OUTPUT when it is set.
"use strict";
const fs = require("fs");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const https = require("https");
const cp = require("child_process");

const ROOT = process.env.BC_ROOT || path.join(__dirname, "..");
const args = process.argv.slice(2);
const flag = (n) => args.includes("--" + n);
const opt = (n) => (args.find((a) => a.startsWith("--" + n + "=")) || "").slice(n.length + 3);

const FORCE = flag("force");
const CHECK_ONLY = flag("check-only");
const LOCAL_SRC = opt("source") || process.env.BC_SOURCE_DIR || "";
const REPO = opt("repo") || process.env.BC_UPSTREAM_REPO || "https://gitgud.io/BondageProjects/Bondage-College.git";
const BRANCH = opt("branch") || process.env.BC_UPSTREAM_BRANCH || "master";
const SUBDIR = "BondageClub"; // folder inside the upstream repo that holds Assets/
// MapData.js only (no PNGs) is also mirrored on GitHub; used if gitgud can't be reached from CI.
const MIRROR_MAPDATA = "https://raw.githubusercontent.com/awdrrawd/Bondage-College-Mirror/bondageclub/Assets/MapData.js";

const STATE_FILE = path.join(ROOT, "data", "upstream-state.json");
const CATALOG_FILE = path.join(ROOT, "src", "catalog.json");
const IMAGES_FILE = path.join(ROOT, "src", "images.json");

const log = (...a) => console.log("[sync]", ...a);

// ---------- helpers ----------
function run(cmd, cmdArgs, opts = {}) {
	const r = cp.spawnSync(cmd, cmdArgs, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 64 * 1024 * 1024, ...opts });
	if (r.status !== 0) {
		const err = new Error(`${cmd} ${cmdArgs.join(" ")} failed (${r.status}): ${(r.stderr || r.error || "").toString().trim().slice(0, 400)}`);
		err.status = r.status;
		throw err;
	}
	return (r.stdout || "").trim();
}
function retry(fn, times = 3, label = "") {
	let last;
	for (let i = 1; i <= times; i++) {
		try { return fn(); } catch (e) { last = e; log(`${label} attempt ${i}/${times} failed: ${e.message.split("\n")[0]}`); }
	}
	throw last;
}
function readJson(file, fallback) {
	try { return JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { return fallback; }
}
function writeIfChanged(file, text) {
	if (fs.existsSync(file) && fs.readFileSync(file, "utf8") === text) return false;
	fs.mkdirSync(path.dirname(file), { recursive: true });
	fs.writeFileSync(file, text);
	return true;
}
function gitBlobSha(buf) {
	return crypto.createHash("sha1").update(Buffer.concat([Buffer.from(`blob ${buf.length}\0`), buf])).digest("hex");
}
function httpGet(url) {
	return new Promise((resolve) => {
		const req = https.get(url, { headers: { "User-Agent": "bc-room-map-editor-sync" } }, (res) => {
			if (res.statusCode !== 200) { res.resume(); return resolve(null); }
			const chunks = [];
			res.on("data", (c) => chunks.push(c));
			res.on("end", () => resolve(Buffer.concat(chunks)));
		});
		req.on("error", () => resolve(null));
		req.setTimeout(30000, () => { req.destroy(); resolve(null); });
	});
}
const isPng = (buf) => buf && buf.length >= 67 && buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47;

// ---------- 1. obtain upstream files ----------
// Returns { unchanged: true } or { srcRoot, meta, cleanup }.
function fromLocalDir(dir, state) {
	const mapData = path.join(dir, "Assets", "MapData.js");
	if (!fs.existsSync(mapData)) throw new Error(`--source: ${mapData} not found`);
	// Content digest of Assets/Map stands in for git's tree id so "unchanged" detection works offline too.
	const h = crypto.createHash("sha1");
	(function walk(d, rel) {
		if (!fs.existsSync(d)) return;
		for (const n of fs.readdirSync(d).sort()) {
			const p = path.join(d, n);
			if (fs.statSync(p).isDirectory()) walk(p, rel + n + "/");
			else h.update(rel + n + "\0").update(fs.readFileSync(p));
		}
	})(path.join(dir, "Assets", "Map"), "");
	const meta = { repo: "local:" + path.resolve(dir), branch: "", commit: "", mapTree: h.digest("hex"), mapDataBlob: gitBlobSha(fs.readFileSync(mapData)) };
	if (!FORCE && state.mapTree === meta.mapTree && state.mapDataBlob === meta.mapDataBlob) { log("local source identical to last sync"); return { unchanged: true }; }
	return { srcRoot: dir, meta, cleanup() {} };
}

function fromGit(state) {
	const remoteLine = retry(() => run("git", ["ls-remote", REPO, `refs/heads/${BRANCH}`]), 3, "ls-remote");
	const commit = remoteLine.split(/\s+/)[0];
	if (!commit) throw new Error(`branch ${BRANCH} not found on ${REPO}`);
	log(`upstream ${BRANCH} @ ${commit.slice(0, 10)}`);
	if (!FORCE && state.upstream && state.upstream.commit === commit) {
		log("upstream commit unchanged since last sync");
		return { unchanged: true };
	}

	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bc-upstream-"));
	const cleanup = () => { try { fs.rmSync(tmp, { recursive: true, force: true }); } catch (e) { /* ignore */ } };
	try {
		retry(() => {
			fs.rmSync(tmp, { recursive: true, force: true });
			run("git", ["clone", "--depth", "1", "--branch", BRANCH, "--filter=blob:none", "--no-checkout", REPO, tmp]);
		}, 3, "clone");
		const mapTree = run("git", ["-C", tmp, "rev-parse", `HEAD:${SUBDIR}/Assets/Map`]);
		const mapDataBlob = run("git", ["-C", tmp, "rev-parse", `HEAD:${SUBDIR}/Assets/MapData.js`]);
		const meta = { repo: REPO, branch: BRANCH, commit, mapTree, mapDataBlob };
		if (!FORCE && state.mapTree === mapTree && state.mapDataBlob === mapDataBlob) {
			log("Assets/Map and Assets/MapData.js identical to last sync -> nothing to update");
			cleanup();
			return { unchanged: true, meta };
		}
		log(`changed: MapData ${state.mapDataBlob === mapDataBlob ? "same" : "NEW"}, Map dir ${state.mapTree === mapTree ? "same" : "NEW"} -> fetching those files only`);
		run("git", ["-C", tmp, "sparse-checkout", "set", "--no-cone", `/${SUBDIR}/Assets/Map/`, `/${SUBDIR}/Assets/MapData.js`]);
		retry(() => run("git", ["-C", tmp, "checkout", "HEAD"]), 3, "checkout");
		return { srcRoot: path.join(tmp, SUBDIR), meta, cleanup };
	} catch (e) { cleanup(); throw e; }
}

// ---------- 2. apply ----------
function applyFromDir(srcRoot, meta, state) {
	// 2a. catalog (tiles / objects / effects) — fully derived from upstream MapData.js
	const mapDataPath = path.join(srcRoot, "Assets", "MapData.js");
	run(process.execPath, [path.join(__dirname, "extract-catalog.js"), mapDataPath], { env: { ...process.env, BC_ROOT: ROOT } });
	const cat = readJson(CATALOG_FILE);

	// 2b. thumbnails — copy what upstream has, keep what we already have, report what is still missing
	const oldManifest = readJson(IMAGES_FILE, {});
	const manifest = {};
	const missing = [];
	let added = 0, updated = 0, kept = 0;
	const jobs = [
		...cat.tiles.map((e) => ({ dir: "Tiles", layerDir: "MapTile", e })),
		...cat.objects.map((e) => ({ dir: "Objects", layerDir: "MapObject", e })),
	];
	const referenced = new Set();
	for (const { dir, layerDir, e } of jobs) {
		if (e.style === "Blank") continue;
		const key = `${e.type}:${e.style}`;
		const rel = `${layerDir}/${e.type}/${e.style}.png`;
		referenced.add(`${dir}/${e.type}/${e.style}.png`);
		const dest = path.join(ROOT, "assets", rel);
		const from = path.join(srcRoot, "Assets", "Map", dir, e.type, `${e.style}.png`);
		let buf = null;
		try { buf = fs.readFileSync(from); } catch (err) { /* not upstream (yet) */ }
		if (buf && isPng(buf)) {
			const had = fs.existsSync(dest);
			if (!had || !fs.readFileSync(dest).equals(buf)) {
				fs.mkdirSync(path.dirname(dest), { recursive: true });
				fs.writeFileSync(dest, buf);
				had ? updated++ : added++;
			} else kept++;
			manifest[key] = "assets/" + rel;
		} else if (fs.existsSync(dest)) {
			manifest[key] = "assets/" + rel; kept++;
		} else if (oldManifest[key] && fs.existsSync(path.join(ROOT, oldManifest[key]))) {
			manifest[key] = oldManifest[key]; kept++;
		} else missing.push(key);
	}
	writeIfChanged(IMAGES_FILE, JSON.stringify(manifest));

	// Upstream PNGs that the catalog does not reference (informational only).
	const unreferenced = [];
	for (const dir of ["Tiles", "Objects"]) {
		const base = path.join(srcRoot, "Assets", "Map", dir);
		if (!fs.existsSync(base)) continue;
		for (const type of fs.readdirSync(base)) {
			const tdir = path.join(base, type);
			if (!fs.statSync(tdir).isDirectory()) continue;
			for (const f of fs.readdirSync(tdir)) if (f.endsWith(".png") && !referenced.has(`${dir}/${type}/${f}`)) unreferenced.push(`${dir}/${type}/${f}`);
		}
	}
	log(`images: +${added} new, ${updated} updated, ${kept} unchanged, ${missing.length} still missing`);
	return { cat, missing, unreferenced };
}

// Fallback when git over HTTPS to gitgud is blocked: MapData.js from the GitHub mirror,
// images through the HTTP mirrors tried by download-assets.js (incremental).
async function fallbackHttp(state) {
	log("git source failed -> falling back to GitHub mirror (MapData) + HTTP image mirrors");
	const buf = await httpGet(MIRROR_MAPDATA);
	if (!buf || buf.length < 1000) throw new Error("fallback: cannot download MapData.js from mirror");
	const blob = gitBlobSha(buf);
	if (!FORCE && state.mapDataBlob === blob) { log("MapData.js identical to last sync (fallback)"); return { unchanged: true }; }
	const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "bc-fallback-"));
	fs.mkdirSync(path.join(tmp, "Assets"), { recursive: true });
	fs.writeFileSync(path.join(tmp, "Assets", "MapData.js"), buf);
	return {
		srcRoot: tmp,
		meta: { repo: MIRROR_MAPDATA, branch: "bondageclub", commit: "", mapTree: "", mapDataBlob: blob },
		cleanup() { fs.rmSync(tmp, { recursive: true, force: true }); },
		httpImages: true,
	};
}

async function main() {
	const state = readJson(STATE_FILE, {});
	let src;
	if (LOCAL_SRC) src = fromLocalDir(LOCAL_SRC, state);
	else {
		try { src = fromGit(state); }
		catch (e) {
			log("git sync error:", e.message.split("\n")[0]);
			src = await fallbackHttp(state);
		}
	}

	if (src.unchanged) {
		log("result: NO update needed");
		emit(false);
		return;
	}
	if (CHECK_ONLY) { log("result: upstream HAS changes (check-only, nothing written)"); src.cleanup(); emit(true); return; }

	try {
		const { cat, missing, unreferenced } = applyFromDir(src.srcRoot, src.meta, state);
		let stillMissing = missing;
		if (src.httpImages && missing.length) {
			// Fallback path has no image checkout: let the HTTP downloader fill the gaps, then recount.
			try { run(process.execPath, [path.join(__dirname, "download-assets.js")], { env: { ...process.env, BC_ROOT: ROOT }, stdio: ["ignore", "inherit", "inherit"] }); } catch (e) { log("download-assets:", e.message); }
			const m = readJson(IMAGES_FILE, {});
			stillMissing = missing.filter((k) => !m[k]);
		}
		const next = {
			upstream: { repo: src.meta.repo, branch: src.meta.branch, commit: src.meta.commit },
			mapTree: src.meta.mapTree,
			mapDataBlob: src.meta.mapDataBlob,
			syncedAt: new Date().toISOString(),
			counts: { tiles: cat.tiles.length, objects: cat.objects.length, effects: cat.effects.length, missingImages: stillMissing.length },
			missingImages: stillMissing,
			unreferencedUpstreamImages: unreferenced,
		};
		writeIfChanged(STATE_FILE, JSON.stringify(next, null, 2) + "\n");
		run(process.execPath, [path.join(__dirname, "build-editor.js")], { env: { ...process.env, BC_ROOT: ROOT }, stdio: ["ignore", "inherit", "inherit"] });
		log(`done: ${cat.tiles.length} tiles / ${cat.objects.length} objects, ${stillMissing.length} images still missing`);
		emit(true);
	} finally { src.cleanup(); }
}

function emit(updated) {
	if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `updated=${updated}\n`);
}

main().catch((e) => { console.error("[sync] FAILED:", e.message); process.exit(1); });
