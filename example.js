// Example map builder: a small sealed room with a gold-locked door, a gold key,
// and a statue obstacle. Encodes to a /mappaste-compatible string and round-trips
// through decode to prove the format is byte-valid (length 1600, valid IDs).
const MapLib = require("./map-lib.js");

const {
  W, H, BLANK, createGrid, setCell, encode, decode, idByStyle,
} = MapLib;

// Component IDs (resolved via catalog so we never hardcode magic numbers blindly).
const FLOOR = idByStyle("Floor:OakWood");       // 100
const WALL = idByStyle("Wall:MixedWood");        // 1000
const DOOR = idByStyle("WallPath:WoodLockedGold"); // 4015
const KEY = idByStyle("FloorDecoration:KeyGold");  // 164
const STATUE = idByStyle("FloorObstacle:Statue");  // 2010
const ENTRY = idByStyle("FloorDecoration:EntryFlag"); // 110

console.log("Resolved IDs:", { FLOOR, WALL, DOOR, KEY, STATUE, ENTRY });

// --- Tiles layer: floor everywhere, wall border on the outermost ring ---
const tiles = createGrid(FLOOR);
for (let x = 0; x < W; x++) {
  setCell(tiles, x, 0, WALL);
  setCell(tiles, x, H - 1, WALL);
}
for (let y = 0; y < H; y++) {
  setCell(tiles, 0, y, WALL);
  setCell(tiles, W - 1, y, WALL);
}

// --- Objects layer: blank everywhere, then place specials ---
const objects = createGrid(BLANK);
// Gold door sits ON a wall tile (object CanEnter checked before tile CanEnter).
setCell(objects, 20, 0, DOOR);
// Gold key just inside the room.
setCell(objects, 20, 5, KEY);
// A statue obstacle as decorative/blocking doodad.
setCell(objects, 10, 12, STATUE);
// Entry flag marking the spawn point.
setCell(objects, 20, 2, ENTRY);

const map = { type: "Always", tiles, objects, fog: false };

// --- Encode ---
const str = encode(map);
console.log("\nEncoded mappaste string length:", str.length);
console.log("First 80 chars:", str.slice(0, 80) + "...");

// --- Round-trip verify ---
const back = decode(str);
const ok =
  back.Tiles.length === W * H &&
  back.Objects.length === W * H &&
  back.Tiles === encode({ type: "Always", tiles, objects }).match(/.*/) && // placeholder
  true;

// Real check: re-encoding the decoded grids must equal the original string.
const reEncoded = encode({
  type: back.Type,
  tiles: back.Tiles,
  objects: back.Objects,
  fog: back.Fog,
});

// Verify a few specific cells survived the round-trip.
const gT = MapLib.charsToGrid(back.Tiles);
const gO = MapLib.charsToGrid(back.Objects);
const checks = [
  ["border wall (0,0)", gT[0][0] === WALL],
  ["door on wall (20,0)", gO[0][20] === DOOR],
  ["key (20,5)", gO[5][20] === KEY],
  ["statue (10,12)", gO[12][10] === STATUE],
  ["entry (20,2)", gO[2][20] === ENTRY],
  ["floor interior (15,15)", gT[15][15] === FLOOR],
];

console.log("\n--- Round-trip verification ---");
let allPass = true;
for (const [name, pass] of checks) {
  console.log((pass ? "PASS" : "FAIL") + "  " + name);
  if (!pass) allPass = false;
}
console.log("re-encode stable:", reEncoded === str);
console.log("decode Type:", back.Type, "| Fog:", back.Fog);

if (allPass && reEncoded === str) {
  console.log("\nRESULT: OK — string is structurally valid for /mappaste.");
  // Emit the raw string for copy/paste.
  require("fs").writeFileSync(__dirname + "/example-map.txt", str);
  console.log("Saved to example-map.txt");
} else {
  console.log("\nRESULT: FAILED verification.");
  process.exit(1);
}
