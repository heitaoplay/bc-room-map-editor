// BC room-map string library (Node + browser compatible).
// Builds the 40x40 Tiles/Objects char-code strings and encodes them into a
// `/mappaste`-compatible string: LZString.compressToBase64(JSON.stringify({Type,Tiles,Objects,Fog})).
(function (root, factory) {
	const LZString = typeof require !== "undefined" ? require("./LZString") : root.LZString;
	const catalog = typeof require !== "undefined" ? require("./catalog.json") : root.MAP_CATALOG;
	const lib = factory(LZString, catalog);
	if (typeof module !== "undefined" && module.exports) module.exports = lib;
	if (typeof window !== "undefined") window.MapLib = lib;
})(typeof self !== "undefined" ? self : this, function (LZString, catalog) {
	const W = catalog.width; // 40
	const H = catalog.height; // 40
	const BLANK = catalog.blankId; // 100

	function idx(x, y) {
		return x + y * W;
	}

	// Create a 40x40 grid filled with `fill` (default blank id 100).
	function createGrid(fill = BLANK) {
		return Array.from({ length: H }, () => Array.from({ length: W }, () => fill));
	}

	function inBounds(x, y) {
		return x >= 0 && x < W && y >= 0 && y < H;
	}

	function setCell(grid, x, y, id) {
		if (!inBounds(x, y)) throw new Error(`out of bounds ${x},${y}`);
		grid[y][x] = id;
	}

	// Flatten a grid to the 1600-char string. index = x + y*W, char = fromCharCode(id).
	function gridToChars(grid) {
		let s = "";
		for (let y = 0; y < H; y++) {
			for (let x = 0; x < W; x++) {
				s += String.fromCharCode(grid[y][x]);
			}
		}
		return s;
	}

	function charsToGrid(str) {
		const g = createGrid(BLANK);
		for (let i = 0; i < str.length && i < W * H; i++) {
			g[Math.floor(i / W)][i % W] = str.charCodeAt(i);
		}
		return g;
	}

	// Validate ids exist in catalog; throws on unknown.
	function validateId(id) {
		if (!catalog.byId[id]) throw new Error(`unknown map component id: ${id}`);
		return true;
	}

	// Encode a map description into a mappaste string.
	// map = { type, tiles (grid|string), objects (grid|string), fog }
	function encode(map) {
		const tiles = typeof map.tiles === "string" ? map.tiles : gridToChars(map.tiles);
		const objects = typeof map.objects === "string" ? map.objects : gridToChars(map.objects);
		if (tiles.length !== W * H) throw new Error(`Tiles length ${tiles.length} != ${W * H}`);
		if (objects.length !== W * H) throw new Error(`Objects length ${objects.length} != ${W * H}`);
		for (const ch of tiles) validateId(ch.charCodeAt(0));
		for (const ch of objects) validateId(ch.charCodeAt(0));
		const payload = { Type: map.type || "Always", Tiles: tiles, Objects: objects };
		if (typeof map.fog === "boolean") payload.Fog = map.fog;
		return LZString.compressToBase64(JSON.stringify(payload));
	}

	// Decode a mappaste string back to { type, tiles, objects, fog } (for verification).
	function decode(str) {
		const json = LZString.decompressFromBase64(str);
		if (!json) throw new Error("decompress failed");
		const data = JSON.parse(json);
		if (typeof data.Tiles !== "string" || data.Tiles.length !== W * H)
			throw new Error("bad Tiles");
		if (typeof data.Objects !== "string" || data.Objects.length !== W * H)
			throw new Error("bad Objects");
		return data;
	}

	// Convenience: look up an id by "Type:Style" (e.g. "WallPath:WoodLockedGold").
	function idByStyle(key) {
		return catalog.byStyle[key];
	}

	return {
		W,
		H,
		BLANK,
		catalog,
		idx,
		createGrid,
		inBounds,
		setCell,
		gridToChars,
		charsToGrid,
		validateId,
		encode,
		decode,
		idByStyle,
	};
});
