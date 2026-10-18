// Extract the BC map component catalog (tiles / objects / effects) → src/catalog.json
//
// BC R133+ keeps the lists in Assets/MapData.js (AssetsMapDataTiles / Objects / Effects),
// no longer in ChatRoomMapView.js. We evaluate that file in a sandbox with stubbed globals.
//
// Usage:  node scripts/extract-catalog.js [path/to/BondageClub/Assets/MapData.js]
// Default path: $BC_MAPDATA, else /tmp/bc-map/MapData.js
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const SRC = process.argv[2] || process.env.BC_MAPDATA || "/tmp/bc-map/MapData.js";
const OUT = path.join(__dirname, "..", "src", "catalog.json");

let code = fs.readFileSync(SRC, "utf8");
code += "\n;globalThis.__R = { E: AssetsMapDataEffects, T: AssetsMapDataTiles, O: AssetsMapDataObjects };";
const ctx = {
	console, CurrentTime: 0, Player: {}, MapManager: {},
	ChatRoomMapSignTextMaxLength: 100,
	ChatRoomMapViewMove() {}, ChatRoomPlayerIsAdmin() {}, ElementCreate() {}, ChatRoomMapViewShowDialogMenu() {},
};
ctx.globalThis = ctx;
vm.createContext(ctx);
vm.runInContext(code, ctx);
const { E, T, O } = ctx.__R;

function compact(list, layer) {
	return list.map((e) => {
		const o = { id: e.ID, layer, type: e.Type, style: e.Style };
		if (e.Name) o.name = e.Name;
		if (e.BlockVision) o.blockVision = true;
		if (e.BlockHearing) o.blockHearing = true;
		if (e.Exit) o.exit = true;
		if (e.Unique) o.unique = true;
		if (e.OccupiedStyle) o.occupiedStyle = e.OccupiedStyle;
		if (e.AssetName) o.asset = `${e.AssetGroup}:${e.AssetName}`;
		if (typeof e.Rotation === "number") o.rotation = e.Rotation;
		if (typeof e.Top === "number") o.top = e.Top;
		if (typeof e.Height === "number") o.height = e.Height;
		if (typeof e.Left === "number") o.left = e.Left;
		if (typeof e.Width === "number") o.width = e.Width;
		if (typeof e.CanEnter === "function") o.canEnter = true;
		if (typeof e.OnEnter === "function") o.onEnter = true;
		if (typeof e.OnClick === "function") o.onClick = true; // e.g. Sign* (text stored in CellData)
		if (typeof e.IsVisible === "function") o.isVisible = true;
		if (typeof e.BuildImageName === "function") o.animated = true;
		return o;
	});
}

const tiles = compact(T, "tile");
const objects = compact(O, "object");
// Conveyor belts share one Style per speed; the walking direction is only visible in the OnEnter logic.
// Recover it from the source text: ID: 3500, ... CreateOnEnterConveyorLogic("West", ...)
{
	const re = /ID:\s*(\d+)[^}]*?ChatRoomMapViewCreateOnEnterConveyorLogic\("(\w+)"/g;
	let m;
	while ((m = re.exec(code))) {
		const obj = objects.find((x) => x.id === Number(m[1]));
		if (obj) obj.dir = m[2];
	}
}
const effects = E.map((e) => ({ id: e.ID, layer: "effect", type: e.Type, color: e.Color }));

const byId = {};
for (const e of [...tiles, ...objects, ...effects]) byId[e.id] = e;
const byStyle = {};
for (const e of [...tiles, ...objects]) byStyle[`${e.type}:${e.style}`] = e.id;

// Legacy aliases: BC re-typed many objects in R133 (FloorDecoration:KeyGold → Functional:KeyGold …).
// Read the previous catalog (if any) so old "Type:Style" keys keep resolving.
// NOTE: tile IDs and object IDs overlap (both start at 100), so compare per layer, never via byId.
const legacy = {};
try {
	const prev = JSON.parse(fs.readFileSync(OUT, "utf8"));
	Object.assign(legacy, prev.legacy || {});
	const curTile = new Map(tiles.map((e) => [e.id, e]));
	const curObj = new Map(objects.map((e) => [e.id, e]));
	for (const [list, cur] of [[prev.tiles, curTile], [prev.objects, curObj]]) {
		for (const e of list) {
			const c = cur.get(e.id);
			if (c && (c.type !== e.type || c.style !== e.style)) legacy[`${e.type}:${e.style}`] = e.id;
		}
	}
} catch (e) { /* first run */ }
for (const k of Object.keys(legacy)) if (!byStyle[k]) byStyle[k] = legacy[k];

const catalog = { width: 40, height: 40, blankId: 100, tiles, objects, effects, legacy, byId, byStyle };
fs.writeFileSync(OUT, JSON.stringify(catalog));
console.log(`catalog written: ${tiles.length} tiles, ${objects.length} objects, ${effects.length} effects, ${Object.keys(legacy).length} legacy aliases`);
console.log(`KeyGold id = ${byStyle["Functional:KeyGold"]} (legacy FloorDecoration:KeyGold = ${byStyle["FloorDecoration:KeyGold"]})`);
console.log(`WoodLockedGold id = ${byStyle["WallPath:WoodLockedGold"]}`);
