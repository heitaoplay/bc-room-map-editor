// Extract the ChatRoomMap component catalog from the BC source.
// Reads /tmp/bc-map/ChatRoomMapView.js, evaluates the three constant arrays,
// and writes a compact catalog.json for the generator to consume.
const fs = require("fs");
const path = require("path");

const SRC = "/tmp/bc-map/ChatRoomMapView.js";
const OUT = path.join(__dirname, "catalog.json");

const src = fs.readFileSync(SRC, "utf8");

// Pull a top-level `const NAME = [ ... ];` array literal and evaluate it.
function extractArray(name) {
	const start = src.indexOf(`const ${name} = [`);
	if (start < 0) throw new Error(`cannot find ${name}`);
	let i = src.indexOf("[", start);
	let depth = 0;
	for (; i < src.length; i++) {
		const c = src[i];
		if (c === "[") depth++;
		else if (c === "]") {
			depth--;
			if (depth === 0) {
				const text = src.slice(src.indexOf("[", start), i + 1);
				// eslint-disable-next-line no-new-func
				return new Function(`return ${text};`)();
			}
		}
	}
	throw new Error(`unbalanced array ${name}`);
}

function compact(list, layer) {
	return list.map((e) => {
		const o = {
			id: e.ID,
			layer,
			type: e.Type,
			style: e.Style,
		};
		if (e.BlockVision) o.blockVision = true;
		if (e.BlockHearing) o.blockHearing = true;
		if (e.Exit) o.exit = true;
		if (e.Unique) o.unique = true;
		if (e.OccupiedStyle) o.occupiedStyle = e.OccupiedStyle;
		if (e.AssetName) o.asset = `${e.AssetGroup}:${e.AssetName}`;
		if (typeof e.Top === "number") o.top = e.Top;
		if (typeof e.Height === "number") o.height = e.Height;
		if (typeof e.Left === "number") o.left = e.Left;
		if (typeof e.Width === "number") o.width = e.Width;
		if (typeof e.CanEnter === "function") o.canEnter = true;
		if (typeof e.OnEnter === "function") o.onEnter = true;
		if (typeof e.IsVisible === "function") o.isVisible = true;
		if (typeof e.BuildImageName === "function") o.animated = true;
		return o;
	});
}

const tiles = compact(extractArray("ChatRoomMapViewTileList"), "tile");
const objects = compact(extractArray("ChatRoomMapViewObjectList"), "object");
const effects = extractArray("ChatRoomMapViewEffectList").map((e) => ({
	id: e.ID,
	layer: "effect",
	type: e.Type,
	color: e.Color,
}));

const byId = {};
for (const e of [...tiles, ...objects, ...effects]) byId[e.id] = e;
// friendly lookup: "Type:Style" -> id
const byStyle = {};
for (const e of [...tiles, ...objects]) byStyle[`${e.type}:${e.style}`] = e.id;

const catalog = {
	width: 40,
	height: 40,
	blankId: 100, // default empty tile (OakWood) / empty object (Blank)
	tiles,
	objects,
	effects,
	byId,
	byStyle,
};

fs.writeFileSync(OUT, JSON.stringify(catalog, null, 0));
console.log(
	`catalog written: ${tiles.length} tiles, ${objects.length} objects, ${effects.length} effects`,
);
console.log(`sample tile ids: ${tiles.slice(0, 3).map((t) => t.id).join(",")}`);
console.log(`sample object ids: ${objects.slice(0, 3).map((t) => t.id).join(",")}`);
console.log(`KeyBronze id = ${catalog.byStyle["FloorDecoration:KeyBronze"]}`);
console.log(`WoodLockedGold id = ${catalog.byStyle["WallPath:WoodLockedGold"]}`);
