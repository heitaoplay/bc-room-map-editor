// BC room-map visual editor — UI logic (v2: tools, undo/redo, incremental paint).
// Uses window.LZString, window.MAP_CATALOG, window.MapLib (all inlined by build-editor.js).
(function () {
  "use strict";
  const MapLib = window.MapLib;
  const CAT = window.MAP_CATALOG;
  const IMG = window.MAP_IMAGES || {};
  const I18N = window.MAP_I18N;
  const T = I18N.t;
  const W = MapLib.W, H = MapLib.H, BLANK = MapLib.BLANK;
  const OAK = MapLib.idByStyle("Floor:OakWood");
  const CELL_BASE = 13, ZOOM_MIN = 4, ZOOM_MAX = 40, ZOOM_STEP = 2;
  const MAX_HISTORY = 80;

  // ---------- shared lookups ----------
  function compOf(id, layer) {
    let c;
    if (layer === "tiles") c = CAT.tiles.find((t) => t.id === id);
    else c = CAT.objects.find((o) => o.id === id) || CAT.effects.find((e) => e.id === id);
    return c || { id, type: "?", style: "?", layer: "?" };
  }
  function shade(hex, dl) {
    const n = parseInt(hex.slice(1), 16);
    let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    r = Math.max(0, Math.min(255, r + dl)); g = Math.max(0, Math.min(255, g + dl)); b = Math.max(0, Math.min(255, b + dl));
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
  }
  function colorFor(comp) {
    const t = comp.type, s = comp.style || "";
    let base;
    if (t === "Wall" || s === "HalfWall") base = "#7f8c9b";
    else if (t === "Floor") base = "#b5895a";
    else if (t === "WallPath") base = "#e0a93b";
    else if (t === "FloorObstacle") base = "#c0563f";
    else if (t === "FloorDecoration") base = /^Key/.test(s) ? "#ffe14d" : (s === "EntryFlag" || s === "ExitFlag") ? "#5fd06b" : "#3fae9b";
    else if (t === "FloorItem") base = "#9b6bd6";
    else if (t === "FloorNumber" || t === "FloorLetter" || t === "FloorIcon") base = "#56c0e0";
    else if (t === "Banners") base = "#d36ba0";
    else if (t === "Water") base = "#2f7fae";
    else if (t === "FloorExterior") base = "#6f8f4f";
    else base = "#888888";
    let h = 0; for (const ch of s) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    return shade(base, (h % 24) - 12);
  }
  // Component label — delegates to the i18n layer (zh-label for cn/tw, BC style otherwise).
  function zh(comp) {
    return I18N.labelForComp(comp);
  }
  function imgFor(comp) {
    const key = (comp.type || "") + ":" + (comp.style || "");
    return IMG[key] || null;
  }
  // Paint a component onto a DOM element using longhand props (works in jsdom + real browsers).
  function paintBg(el, comp) {
    const c = colorFor(comp);
    const img = imgFor(comp);
    const isTile = comp.type === "Floor" || comp.type === "Wall" || comp.type === "Water" || comp.type === "FloorExterior";
    el.style.backgroundColor = c;
    if (img) {
      el.style.backgroundImage = `url("${img}")`;
      el.style.backgroundSize = isTile ? "cover" : "contain";
      el.style.backgroundPosition = "center";
      el.style.backgroundRepeat = "no-repeat";
    } else {
      el.style.backgroundImage = "none";
    }
  }
  function badgeFor(comp) {
    const s = comp.style || "";
    if (/Bronze/i.test(s)) return { color: "#cd7f32", label: T("badge.bronze") };
    if (/Silver/i.test(s)) return { color: "#c0c0c0", label: T("badge.silver") };
    if (/Gold/i.test(s)) return { color: "#ffd700", label: T("badge.gold") };
    return null;
  }

  // ---------- category tree (☰ side menu) ----------
  // Every catalog component (tile or object) is classified into exactly one
  // leaf category below. Leaves are grouped into 5 top-level groups. The
  // component's own `layer` field ("tile"/"object") decides paint layer —
  // there is no separate manual tiles/objects toggle anymore.
  const FURNITURE_STYLES = new Set(["TableBrown", "ChairWood", "ThroneRed", "VikingChair", "Stairs", "AirConditioner", "Blank"]);
  const BEDDING_STYLES = new Set(["BedTeal", "PillowPink", "Bed"]);
  const LEAVES = [
    { id: "floor.floor", top: "floor", labelKey: "cat.floor", match: (c) => c.layer === "tile" && c.type === "Floor" && c.style !== "HalfWall" },
    { id: "floor.exterior", top: "floor", labelKey: "cat.exterior", match: (c) => c.layer === "tile" && c.type === "FloorExterior" },
    { id: "floor.water", top: "floor", labelKey: "cat.water", match: (c) => c.layer === "tile" && c.type === "Water" },
    { id: "wall.wall", top: "wall", labelKey: "cat.wall", match: (c) => c.layer === "tile" && (c.type === "Wall" || c.style === "HalfWall") },
    { id: "wall.door", top: "wall", labelKey: "cat.door", match: (c) => c.type === "WallPath" },
    { id: "wall.walldeco", top: "wall", labelKey: "cat.walldeco", match: (c) => c.type === "WallDecoration" },
    { id: "wall.banner", top: "wall", labelKey: "cat.banners", match: (c) => c.type === "Banners" },
    { id: "deco.obstacle", top: "deco", labelKey: "cat.obstacle", match: (c) => c.type === "FloorObstacle" },
    { id: "deco.furniture", top: "deco", labelKey: "cat.furniture", match: (c) => c.type === "FloorDecorationThemed" || c.type === "FloorDecorationExpanding" || (c.type === "FloorDecoration" && FURNITURE_STYLES.has(c.style)) },
    { id: "deco.bedding", top: "deco", labelKey: "cat.bedding", match: (c) => c.type === "FloorDecoration" && BEDDING_STYLES.has(c.style) },
    { id: "deco.party", top: "deco", labelKey: "cat.party", match: (c) => c.type === "FloorDecorationParty" },
    { id: "deco.outdoor", top: "deco", labelKey: "cat.outdoorProps", match: (c) => c.type === "FloorDecorationCamping" },
    { id: "deco.animal", top: "deco", labelKey: "cat.animal", match: (c) => c.type === "FloorDecorationAnimal" },
    { id: "item.gate", top: "item", labelKey: "cat.gate", match: (c) => c.type === "FloorDecoration" && (c.style === "EntryFlag" || c.style === "ExitFlag") },
    { id: "item.key", top: "item", labelKey: "cat.key", match: (c) => c.type === "FloorDecoration" && /^Key/.test(c.style || "") },
    { id: "item.item", top: "item", labelKey: "cat.item", match: (c) => c.type === "FloorItem" },
    { id: "marker.number", top: "marker", labelKey: "cat.number", match: (c) => c.type === "FloorNumber" },
    { id: "marker.letter", top: "marker", labelKey: "cat.letter", match: (c) => c.type === "FloorLetter" },
    { id: "marker.icon", top: "marker", labelKey: "cat.icon", match: (c) => c.type === "FloorIcon" },
  ];
  const TOPS = [
    { id: "floor", labelKey: "cat2.floor", subs: ["floor.floor", "floor.exterior", "floor.water"] },
    { id: "wall", labelKey: "cat2.wall", subs: ["wall.wall", "wall.door", "wall.walldeco", "wall.banner"] },
    { id: "deco", labelKey: "cat2.deco", subs: ["deco.obstacle", "deco.furniture", "deco.bedding", "deco.party", "deco.outdoor", "deco.animal"] },
    { id: "item", labelKey: "cat2.item", subs: ["item.gate", "item.key", "item.item"] },
    { id: "marker", labelKey: "cat2.marker", subs: ["marker.number", "marker.letter", "marker.icon"] },
  ];
  function leafDef(id) { return LEAVES.find((l) => l.id === id); }
  function topDef(id) { return TOPS.find((t) => t.id === id); }
  function classify(comp) {
    for (const l of LEAVES) if (l.match(comp)) return l.id;
    return "deco.furniture"; // safety net — should not normally hit
  }
  const LEAF_ITEMS = {};
  [].concat(CAT.tiles, CAT.objects).forEach((c) => {
    const id = classify(c);
    (LEAF_ITEMS[id] = LEAF_ITEMS[id] || []).push(c);
  });

  // ---------- state ----------
  const state = {
    layer: "tiles",
    category: "floor.floor", // current ☰ selection: a leaf id ("floor.floor") or top id ("floor")
    tool: "brush",          // brush | rect | line | fill
    eraser: false,
    brush: null,            // { id, layer, type, style, label }
    tilesGrid: MapLib.createGrid(OAK),
    objGrid: MapLib.createGrid(BLANK),
    fog: false,
    type: "Always",
    mouseDown: false,
    dragStart: null,        // {x,y} for rect/line preview
    dragBase: null,         // snapshot at stroke start (for preview)
    hover: null,            // {x,y}
    zoom: CELL_BASE,
    search: "",
    history: [],
    histIdx: -1,
  };
  let cellEls = []; // cellEls[y][x] -> DOM element
  let lastStats = null; // last updateStats args, re-rendered on locale change

  // ---------- history (undo/redo) ----------
  function snapshot() {
    return {
      tiles: state.tilesGrid.map((r) => r.slice()),
      obj: state.objGrid.map((r) => r.slice()),
    };
  }
  function restore(s) {
    state.tilesGrid = s.tiles.map((r) => r.slice());
    state.objGrid = s.obj.map((r) => r.slice());
    renderGrid();
  }
  function pushHistory() {
    // drop any "future" then append current state
    if (state.histIdx < state.history.length - 1)
      state.history = state.history.slice(0, state.histIdx + 1);
    state.history.push(snapshot());
    if (state.history.length > MAX_HISTORY) state.history.shift();
    state.histIdx = state.history.length - 1;
    updateUndoButtons();
  }
  function undo() {
    if (state.histIdx <= 0) return;
    state.histIdx--;
    restore(state.history[state.histIdx]);
    updateUndoButtons();
    flash(T("flash.undo"));
  }
  function redo() {
    if (state.histIdx >= state.history.length - 1) return;
    state.histIdx++;
    restore(state.history[state.histIdx]);
    updateUndoButtons();
    flash(T("flash.redo"));
  }
  function updateUndoButtons() {
    const u = document.getElementById("btnUndo"), r = document.getElementById("btnRedo");
    if (u) u.disabled = state.histIdx <= 0;
    if (r) r.disabled = state.histIdx >= state.history.length - 1;
  }

  // ---------- palette ----------
  function componentsForCategory(catId) {
    if (!catId) return [];
    if (catId.indexOf(".") === -1) {
      const top = topDef(catId);
      return top ? [].concat.apply([], top.subs.map((s) => LEAF_ITEMS[s] || [])) : [];
    }
    return LEAF_ITEMS[catId] || [];
  }

  function matchSearch(comp) {
    if (!state.search) return true;
    const q = state.search.toLowerCase();
    return (
      zh(comp).toLowerCase().includes(q) ||
      (comp.style || "").toLowerCase().includes(q) ||
      (comp.type || "").toLowerCase().includes(q) ||
      String(comp.id) === state.search
    );
  }

  function renderPalette() {
    const root = document.getElementById("palette");
    root.innerHTML = "";
    let sections; // [{ label, items }]
    if (state.search) {
      const all = [].concat(CAT.tiles, CAT.objects).filter(matchSearch);
      const byLeaf = {};
      all.forEach((c) => { const lid = classify(c); (byLeaf[lid] = byLeaf[lid] || []).push(c); });
      sections = Object.keys(byLeaf).map((lid) => ({ label: T(leafDef(lid).labelKey), items: byLeaf[lid] }));
    } else if (state.category.indexOf(".") === -1) {
      const top = topDef(state.category);
      sections = (top ? top.subs : []).map((sid) => ({ label: T(leafDef(sid).labelKey), items: LEAF_ITEMS[sid] || [] })).filter((s) => s.items.length);
    } else {
      const leaf = leafDef(state.category);
      sections = leaf ? [{ label: T(leaf.labelKey), items: LEAF_ITEMS[state.category] || [] }] : [];
    }
    let total = 0;
    sections.forEach((sec) => {
      total += sec.items.length;
      const secEl = document.createElement("div"); secEl.className = "pal-section";
      const h = document.createElement("div"); h.className = "pal-title";
      h.textContent = sec.label + "  (" + sec.items.length + ")"; secEl.appendChild(h);
      const grid = document.createElement("div"); grid.className = "pal-grid";
      sec.items.forEach((comp) => {
        const el = document.createElement("div"); el.className = "pal-item";
        el.title = zh(comp) + "  (" + comp.type + ":" + comp.style + "  #" + comp.id + ")";
        paintBg(el, comp);
        const b = badgeFor(comp);
        if (b) {
          const badge = document.createElement("span");
          badge.className = "pal-badge"; badge.style.background = b.color; badge.textContent = b.label;
          el.appendChild(badge);
        }
        const lbl = document.createElement("span"); lbl.textContent = zh(comp); el.appendChild(lbl);
        const compLayer = comp.layer === "tile" ? "tiles" : "objects";
        if (state.brush && state.brush.id === comp.id && state.brush.layer === compLayer) el.classList.add("sel");
        el.addEventListener("click", () => selectBrush(comp));
        grid.appendChild(el);
      });
      secEl.appendChild(grid); root.appendChild(secEl);
    });
    if (!total) root.innerHTML = '<div class="hint" style="padding:10px">' + T("pal.empty") + '</div>';
  }

  // Selecting any part in the palette immediately arms it as the brush and
  // switches the active tool to "brush" (dropping eraser/rect/line/fill),
  // so the very next click on the stage paints it.
  function selectBrush(comp) {
    const layer = comp.layer === "tile" ? "tiles" : "objects";
    state.tool = "brush"; state.eraser = false;
    ["brush", "rect", "line", "fill"].forEach((t) => {
      const b = document.getElementById("tool" + t[0].toUpperCase() + t.slice(1));
      if (b) b.classList.toggle("active", t === "brush");
    });
    const er = document.getElementById("toolEraser"); if (er) er.classList.remove("active");
    state.brush = { id: comp.id, layer, type: comp.type, style: comp.style, comp };
    state.layer = layer;
    renderPalette();
    updateBrushInfo();
  }

  // ---------- ☰ category menu ----------
  function renderCatMenu() {
    const root = document.getElementById("catMenu");
    if (!root) return;
    root.innerHTML = "";
    TOPS.forEach((top) => {
      const g = document.createElement("div"); g.className = "cat-group";
      const title = document.createElement("div");
      title.className = "cat-group-title" + (state.category === top.id ? " active" : "");
      title.textContent = T(top.labelKey);
      title.addEventListener("click", () => selectCategory(top.id));
      g.appendChild(title);
      const subList = document.createElement("div"); subList.className = "cat-sub-list";
      top.subs.forEach((sid) => {
        const leaf = leafDef(sid);
        const b = document.createElement("button"); b.type = "button";
        b.className = "cat-sub-item" + (state.category === sid ? " active" : "");
        b.textContent = T(leaf.labelKey);
        b.addEventListener("click", (e) => { e.stopPropagation(); selectCategory(sid); });
        subList.appendChild(b);
      });
      g.appendChild(subList); root.appendChild(g);
    });
  }
  function updateCurCatLabel() {
    const el = document.getElementById("curCatLabel");
    if (!el) return;
    if (state.category.indexOf(".") === -1) {
      const top = topDef(state.category);
      el.textContent = top ? T(top.labelKey) : "";
    } else {
      const leaf = leafDef(state.category);
      if (!leaf) { el.textContent = ""; return; }
      el.textContent = T(topDef(leaf.top).labelKey) + " › " + T(leaf.labelKey);
    }
  }
  function selectCategory(catId) {
    state.category = catId;
    state.search = ""; const ps = document.getElementById("palSearch"); if (ps) ps.value = "";
    closeCatMenu();
    updateCurCatLabel();
    renderPalette();
  }
  function openCatMenu() { const m = document.getElementById("catMenu"); if (!m) return; renderCatMenu(); m.hidden = false; }
  function closeCatMenu() { const m = document.getElementById("catMenu"); if (m) m.hidden = true; }
  function toggleCatMenu() { const m = document.getElementById("catMenu"); if (!m) return; if (m.hidden) openCatMenu(); else closeCatMenu(); }

  function updateBrushInfo() {
    const el = document.getElementById("brushInfo");
    const toolName = { brush: T("tool.brush"), rect: T("tool.rect"), line: T("tool.line"), fill: T("tool.fill") }[state.tool];
    let s = T("info.prefix") + toolName;
    if (state.eraser) s += " " + T("info.eraser");
    else if (state.brush) s += " " + T("info.brush") + I18N.labelForComp(state.brush.comp) + T("info.to") + (state.brush.layer === "tiles" ? T("layer.tiles") : T("layer.objects"));
    else s += " " + T("info.notSelected");
    el.textContent = s;
  }

  // ---------- grid ----------
  function buildGrid() {
    const g = document.getElementById("grid");
    g.style.setProperty("--n", W);
    g.innerHTML = "";
    cellEls = Array.from({ length: H }, () => new Array(W));
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const cell = document.createElement("div");
        cell.className = "cell"; cell.dataset.x = x; cell.dataset.y = y;
        const obj = document.createElement("div"); obj.className = "obj"; cell.appendChild(obj);
        cell.addEventListener("mousedown", (e) => onCellDown(e, x, y));
        cell.addEventListener("mouseenter", () => onCellEnter(x, y));
        cell.addEventListener("contextmenu", (e) => { e.preventDefault(); });
        g.appendChild(cell);
        cellEls[y][x] = cell;
      }
    }
    renderGrid();
  }

  function updateCellDOM(x, y) {
    const cell = cellEls[y][x];
    const tid = state.tilesGrid[y][x], oid = state.objGrid[y][x];
    paintBg(cell, compOf(tid, "tiles"), true);
    if (oid !== BLANK) paintBg(cell.firstChild, compOf(oid, "objects"), false);
    else { cell.firstChild.style.backgroundImage = "none"; cell.firstChild.style.backgroundColor = "transparent"; }
  }

  function renderGrid() {
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) updateCellDOM(x, y);
  }

  // ---------- painting primitives ----------
  function targetLayer() { return state.eraser ? state.layer : (state.brush ? state.brush.layer : state.layer); }
  function paintId(layer) {
    if (state.eraser) return layer === "tiles" ? OAK : BLANK;
    return state.brush ? state.brush.id : (layer === "tiles" ? OAK : BLANK);
  }
  function setCellLayer(x, y, layer, id) {
    const grid = layer === "tiles" ? state.tilesGrid : state.objGrid;
    if (x < 0 || y < 0 || x >= W || y >= H) return;
    grid[y][x] = id; updateCellDOM(x, y);
  }
  function eraseCell(x, y) {
    const grid = state.layer === "tiles" ? state.tilesGrid : state.objGrid;
    grid[y][x] = state.layer === "tiles" ? OAK : BLANK;
    updateCellDOM(x, y);
  }
  function paintCell(x, y) {
    const layer = targetLayer();
    setCellLayer(x, y, layer, paintId(layer));
  }
  function floodFill(sx, sy) {
    const layer = targetLayer();
    const grid = layer === "tiles" ? state.tilesGrid : state.objGrid;
    const target = grid[sy][sx];
    const repl = paintId(layer);
    if (repl === target) return;
    const stack = [[sx, sy]]; const seen = new Set();
    while (stack.length) {
      const [x, y] = stack.pop();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const k = x + "," + y; if (seen.has(k)) continue; seen.add(k);
      if (grid[y][x] !== target) continue;
      grid[y][x] = repl; updateCellDOM(x, y);
      stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }
  }
  function drawLine(x0, y0, x1, y1) {
    const layer = targetLayer(); const id = paintId(layer);
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx - dy, x = x0, y = y0;
    while (true) {
      setCellLayer(x, y, layer, id);
      if (x === x1 && y === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) { err -= dy; x += sx; }
      if (e2 < dx) { err += dx; y += sy; }
    }
  }
  function drawRect(x0, y0, x1, y1) {
    const layer = targetLayer(); const id = paintId(layer);
    const xa = Math.min(x0, x1), xb = Math.max(x0, x1), ya = Math.min(y0, y1), yb = Math.max(y0, y1);
    for (let x = xa; x <= xb; x++) { setCellLayer(x, ya, layer, id); setCellLayer(x, yb, layer, id); }
    for (let y = ya; y <= yb; y++) { setCellLayer(xa, y, layer, id); setCellLayer(xb, y, layer, id); }
  }

  // ---------- pointer interaction ----------
  function onCellDown(e, x, y) {
    // only left (paint) / right (erase) act on cells; middle is reserved for panning
    if (e.button !== 0 && e.button !== 2) return;
    e.preventDefault();
    if (e.button === 2) { // right click = erase stroke (history committed on mouseup)
      state.mouseDown = true; state.eraseStroke = true; eraseCell(x, y); return;
    }
    if (state.tool === "fill") { floodFill(x, y); pushHistory(); return; }
    if (state.tool === "brush") {
      state.mouseDown = true;
      if (state.eraser) eraseCell(x, y); else paintCell(x, y);
      return; // stroke committed to history on mouseup (post-state checkpoint)
    }
    // rect / line: begin preview stroke
    state.dragBase = snapshot();
    state.dragStart = { x, y };
    state.mouseDown = true;
    applyShape(x, y);
  }
  function onCellEnter(x, y) {
    state.hover = { x, y };
    const coords = document.getElementById("coords");
    if (coords) {
      const t = compOf(state.tilesGrid[y][x], "tiles"), o = compOf(state.objGrid[y][x], "objects");
      coords.textContent = `(${x}, ${y})  ${I18N.labelForComp(t)} / ${o.style === "Blank" ? "—" : I18N.labelForComp(o)}`;
    }
    if (!state.mouseDown) return;
    if (state.eraseStroke) { eraseCell(x, y); return; }
    if (state.tool === "brush") { if (state.eraser) eraseCell(x, y); else paintCell(x, y); return; }
    if (state.tool === "rect" || state.tool === "line") applyShape(x, y);
  }
  function applyShape(x, y) {
    if (!state.dragBase || !state.dragStart) return;
    restore(state.dragBase); // back to pre-stroke, no history push
    const s = state.dragStart;
    if (state.tool === "rect") drawRect(s.x, s.y, x, y);
    else if (state.tool === "line") drawLine(s.x, s.y, x, y);
  }
  function onDocUp() {
    if (!state.mouseDown) return;
    if ((state.tool === "rect" || state.tool === "line") && state.dragBase) {
      pushHistory(); // commit the finished shape (post-state checkpoint)
    } else if (state.tool === "brush" || state.eraseStroke) {
      pushHistory(); // commit a completed paint/erase stroke (post-state checkpoint)
    }
    state.mouseDown = false; state.dragStart = null; state.dragBase = null; state.eraseStroke = false;
  }

  document.addEventListener("mouseup", onDocUp);

  // ---------- export / import ----------
  function exportStr() {
    try {
      const str = MapLib.encode({ type: state.type, tiles: state.tilesGrid, objects: state.objGrid, fog: state.fog });
      document.getElementById("output").value = str;
      updateStats(true, str.length);
      return str;
    } catch (err) {
      document.getElementById("output").value = "ERROR: " + err.message;
      updateStats(false, 0, err.message);
      return null;
    }
  }

  // Load a mappaste string from the textarea (paste or file)
  function loadFromString(str) {
    if (!str) return false;
    try {
      const data = MapLib.decode(str);
      pushHistory();
      state.tilesGrid = MapLib.charsToGrid(data.Tiles);
      state.objGrid = MapLib.charsToGrid(data.Objects);
      if (typeof data.Fog === "boolean") { state.fog = data.Fog; document.getElementById("fog").checked = data.Fog; }
      if (data.Type) { state.type = data.Type; document.getElementById("typeSel").value = data.Type; }
      renderGrid(); updateStats(true, str.length, T("flash.loaded"));
      return true;
    } catch (err) { updateStats(false, str.length, T("flash.loadFail") + err.message); return false; }
  }

  // Export as .txt download
  function exportFile() {
    const str = exportStr();
    if (!str) return;
    const blob = new Blob([str], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "bc-mappaste.txt"; a.click();
    URL.revokeObjectURL(url);
    flash(T("flash.exportedFile"));
  }

  // Import from local file
  function importFile(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      const text = (e.target.result || "").trim();
      document.getElementById("output").value = text;
      loadFromString(text);
    };
    reader.readAsText(file);
  }
  function updateStats(ok, len, msg) {
    lastStats = { ok, len, msg };
    const el = document.getElementById("stats");
    const tCount = state.tilesGrid.flat().filter((v) => v !== OAK).length;
    const oCount = state.objGrid.flat().filter((v) => v !== BLANK).length;
    el.innerHTML = T("stats.tiles") + ` ${tCount} · ` + T("stats.objs") + ` ${oCount} · ` + T("stats.len") + ` ${len}<br>` +
      (msg ? (ok ? `<span class="ok">${msg}</span>` : `<span class="err">${msg}</span>`) : (ok ? `<span class="ok">${T("stats.valid")}</span>` : `<span class="err">${T("stats.invalid")}</span>`));
  }
  function clearMap() {
    state.tilesGrid = MapLib.createGrid(OAK);
    state.objGrid = MapLib.createGrid(BLANK);
    renderGrid(); document.getElementById("output").value = "";
    updateStats(true, 0, T("flash.cleared")); pushHistory();
  }
  function fillFloor() {
    const sel = state.brush && state.brush.layer === "tiles" ? state.brush : null;
    const id = sel ? sel.id : OAK;
    state.tilesGrid = MapLib.createGrid(id);
    renderGrid();
    flash(T("flash.filled") + (sel ? I18N.labelForComp(sel.comp) : T("oak"))); pushHistory();
  }
  function copyOutput() {
    const ta = document.getElementById("output");
    if (!ta.value || ta.value.startsWith("ERROR")) return;
    ta.select();
    navigator.clipboard.writeText(ta.value).then(
      () => flash(T("flash.copied")),
      () => { document.execCommand("copy"); flash(T("flash.copiedCompat")); }
    );
  }
  function applyToGame() {
    // 先确保已导出
    const str = exportStr();
    if (!str || str.startsWith("ERROR")) return;
    // 复制 /mappaste <串> 到剪贴板，用户去游戏聊天框 Ctrl+V 即可
    const cmd = "/mappaste " + str;
    navigator.clipboard.writeText(cmd).then(
      () => flash(T("flash.applied") + " ✓"),
      () => { flash(T("flash.appliedFail")); }
    );
  }
  function flash(msg) {
    const el = document.getElementById("flash");
    el.textContent = msg; el.classList.remove("showing");
    // force reflow to restart animation
    void el.offsetWidth;
    el.style.opacity = "1"; el.classList.add("showing");
    setTimeout(() => { el.style.opacity = "0"; el.classList.remove("showing"); }, 1400);
  }

  // ---------- pan / drag (Space+drag or middle-click) ----------
  (function initPan() {
    var wrap = document.getElementById("gridWrap");
    if (!wrap) return;
    var dragging = false, sx = 0, sy = 0, sl = 0, st = 0;

    function startPan(e) {
      dragging = true; sx = e.clientX; sy = e.clientY;
      sl = wrap.scrollLeft; st = wrap.scrollTop;
      wrap.classList.add("panning");
      e.preventDefault();
    }

    wrap.addEventListener("mousedown", function (e) {
      // middle button always pans
      if (e.button === 1) { startPan(e); return; }
      // left button + Space = pan
      if (e.button === 0 && e.spaceKey) { startPan(e); return; }
    });
    // track Space key state
    document.addEventListener("keydown", function (e) {
      if (e.key === " " && !e.repeat) { e.spaceKey = true; wrap.style.cursor = "grab"; }
    });
    document.addEventListener("keyup", function (e) {
      if (e.key === " ") { e.spaceKey = false; wrap.style.cursor = ""; }
    });
    document.addEventListener("mousemove", function (e) {
      if (!dragging) return;
      wrap.scrollLeft = sl - (e.clientX - sx);
      wrap.scrollTop  = st - (e.clientY - sy);
    });
    document.addEventListener("mouseup", function () {
      if (!dragging) return;
      dragging = false;
      wrap.classList.remove("panning");
      if (!document.spaceKey) wrap.style.cursor = "";
    });
    // prevent spacebar from scrolling page when focused on grid
    wrap.addEventListener("keydown", function (e) { if (e.key === " ") e.preventDefault(); });
  })();

  // ---------- zoom ----------
  function setZoom(px) {
    state.zoom = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, px));
    var grid = document.getElementById("grid");
    grid.style.transition = "none"; // instant during drag
    grid.style.setProperty("--cell", state.zoom + "px");
    document.getElementById("zoomLevel").textContent = Math.round(state.zoom / CELL_BASE * 100) + "%";
  }
  function zoomFit() {
    const wrap = document.getElementById("gridWrap");
    const fitPx = Math.floor(Math.min((wrap.clientWidth - 20) / W, (wrap.clientHeight - 20) / H));
    setZoom(Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, fitPx)));
  }

  // ---------- tools / layer UI ----------
  function setTool(tool) {
    state.tool = tool; state.eraser = false;
    ["brush", "rect", "line", "fill"].forEach((t) => {
      const b = document.getElementById("tool" + t[0].toUpperCase() + t.slice(1));
      if (b) b.classList.toggle("active", t === tool);
    });
    document.getElementById("toolEraser").classList.remove("active");
    updateBrushInfo();
  }
  function setEraser(on) {
    state.eraser = on;
    document.getElementById("toolEraser").classList.toggle("active", on);
    if (on) ["brush", "rect", "line", "fill"].forEach((t) => document.getElementById("tool" + t[0].toUpperCase() + t.slice(1)).classList.remove("active"));
    updateBrushInfo();
  }
  // ---------- keyboard ----------
  function onKey(e) {
    const tag = (e.target && e.target.tagName) || "";
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key.toLowerCase() === "z") { e.preventDefault(); e.shiftKey ? redo() : undo(); return; }
    if (mod && e.key.toLowerCase() === "y") { e.preventDefault(); redo(); return; }
    if (mod) return;
    const k = e.key.toLowerCase();
    if (k === "b") setTool("brush");
    else if (k === "r") setTool("rect");
    else if (k === "l") setTool("line");
    else if (k === "f") setTool("fill");
    else if (k === "e") setEraser(!state.eraser);
    else if (k === "+" || k === "=") setZoom(state.zoom + ZOOM_STEP);
    else if (k === "-" || k === "_") setZoom(state.zoom - ZOOM_STEP);
    else if (k === "escape") { state.brush = null; closeCatMenu(); renderPalette(); updateBrushInfo(); }
  }

  // ---------- i18n glue ----------
  function setText(id, txt) { const el = document.getElementById(id); if (el) el.textContent = txt; }
  function setAttr(id, a, v) { const el = document.getElementById(id); if (el) el.setAttribute(a, v); }

  function initLangSelect() {
    const sel = document.getElementById("langSel");
    if (sel) {
      const optAuto = document.createElement("option");
      optAuto.value = "auto"; optAuto.textContent = I18N.localeName("auto");
      sel.appendChild(optAuto);
      I18N.available().forEach((loc) => {
        const opt = document.createElement("option");
        opt.value = loc; opt.textContent = I18N.localeName(loc);
        sel.appendChild(opt);
      });
      sel.value = I18N.getSavedLocale();
      sel.addEventListener("change", () => I18N.setLocale(sel.value));
    }
    document.addEventListener("localechange", applyLocale);
  }

  function applyLocale() {
    // header
    document.title = T("app.title");
    setText("appTitle", T("app.title"));
    setText("appSub", T("app.subtitle"));
    setText("modeLabel", T("mode.label"));
    const ts = document.getElementById("typeSel");
    if (ts) {
      const map = { Always: "mode.always", Online: "mode.online", Offline: "mode.offline" };
      Object.keys(map).forEach((v) => { const o = ts.querySelector('option[value="' + v + '"]'); if (o) o.textContent = T(map[v]); });
    }
    setText("fogLabel", T("fog"));
    // toolbar buttons
    setText("btnUndo", T("undo")); setAttr("btnUndo", "title", T("undo") + " (Ctrl+Z)");
    setText("btnRedo", T("redo")); setAttr("btnRedo", "title", T("redo") + " (Ctrl+Y)");
    setText("btnFill", T("fillFloor")); setAttr("btnFill", "title", T("fillFloor"));
    setText("btnClear", T("clear"));
    setText("btnExport", T("genCode")); setAttr("btnExport", "title", T("genCode"));
    setText("btnFileImport", T("importFile")); setAttr("btnFileImport", "title", T("importFile"));
    setText("btnFileExport", T("exportFile")); setAttr("btnFileExport", "title", T("exportFile"));
    // ☰ category menu + current-category label
    updateCurCatLabel();
    renderCatMenu();
    // search placeholder
    const ps = document.getElementById("palSearch"); if (ps) ps.placeholder = T("search.ph");
    // drawing tools
    setText("toolBrush_t", T("tool.brush")); setAttr("toolBrush", "title", T("tool.brush.title"));
    setText("toolRect_t", T("tool.rect")); setAttr("toolRect", "title", T("tool.rect.title"));
    setText("toolLine_t", T("tool.line")); setAttr("toolLine", "title", T("tool.line.title"));
    setText("toolFill_t", T("tool.fill")); setAttr("toolFill", "title", T("tool.fill.title"));
    setText("toolEraser_t", T("tool.eraser")); setAttr("toolEraser", "title", T("tool.eraser.title"));
    // zoom fit
    setText("zoomFit", T("zoom.fit")); setAttr("zoomFit", "title", T("zoom.fit.title"));
    // right panel
    setText("panelTitle", T("panel.title"));
    const out = document.getElementById("output"); if (out) out.placeholder = T("output.ph");
    setText("btnCopy", T("copy"));
    setText("btnApplyGame", T("applyGame"));
    const hint = document.getElementById("hintImport"); if (hint) hint.innerHTML = T("hint.import");
    setText("stageHint", T("stage.hint"));
    // language label + select value
    setText("langLabel", T("lang.label"));
    const ls = document.getElementById("langSel"); if (ls) ls.value = I18N.getSavedLocale();
    // dynamic re-render
    renderPalette();
    updateBrushInfo();
    if (lastStats) updateStats(lastStats.ok, lastStats.len, lastStats.msg);
  }

  // ---------- init ----------
  function init() {
    renderPalette(); updateBrushInfo(); buildGrid(); updateStats(true, 0, T("ready"));
    updateUndoButtons();
    initLangSelect();
    applyLocale();

    updateCurCatLabel();
    document.getElementById("catMenuBtn").addEventListener("click", (e) => { e.stopPropagation(); toggleCatMenu(); });
    document.addEventListener("click", (e) => {
      const menu = document.getElementById("catMenu"), btn = document.getElementById("catMenuBtn");
      if (!menu || menu.hidden) return;
      if (menu.contains(e.target) || (btn && btn.contains(e.target))) return;
      closeCatMenu();
    });
    document.getElementById("fog").addEventListener("change", (e) => { state.fog = e.target.checked; });
    document.getElementById("typeSel").addEventListener("change", (e) => { state.type = e.target.value; });
    document.getElementById("btnClear").addEventListener("click", clearMap);
    document.getElementById("btnFill").addEventListener("click", fillFloor);
    document.getElementById("btnExport").addEventListener("click", exportStr);
    document.getElementById("btnCopy").addEventListener("click", copyOutput);
    document.getElementById("btnApplyGame").addEventListener("click", applyToGame);
    document.getElementById("btnFileExport").addEventListener("click", exportFile);
    document.getElementById("btnFileImport").addEventListener("click", () => {
      const fi = document.getElementById("fileImport");
      fi.value = ""; // reset so same file re-triggers
      fi.click();
    });
    document.getElementById("fileImport").addEventListener("change", (e) => {
      if (e.target.files && e.target.files[0]) importFile(e.target.files[0]);
    });
    // paste auto-detect in textarea
    document.getElementById("output").addEventListener("paste", () => {
      setTimeout(() => loadFromString(document.getElementById("output").value.trim()), 50);
    });
    document.getElementById("btnUndo").addEventListener("click", undo);
    document.getElementById("btnRedo").addEventListener("click", redo);
    document.getElementById("toolBrush").addEventListener("click", () => setTool("brush"));
    document.getElementById("toolRect").addEventListener("click", () => setTool("rect"));
    document.getElementById("toolLine").addEventListener("click", () => setTool("line"));
    document.getElementById("toolFill").addEventListener("click", () => setTool("fill"));
    document.getElementById("toolEraser").addEventListener("click", () => setEraser(!state.eraser));
    document.getElementById("zoomIn").addEventListener("click", () => setZoom(state.zoom + ZOOM_STEP));
    document.getElementById("zoomOut").addEventListener("click", () => setZoom(state.zoom - ZOOM_STEP));
    document.getElementById("zoomFit").addEventListener("click", zoomFit);
    document.getElementById("gridWrap").addEventListener("wheel", (e) => {
      e.preventDefault(); setZoom(state.zoom + (e.deltaY < 0 ? ZOOM_STEP : -ZOOM_STEP));
    }, { passive: false });
    const search = document.getElementById("palSearch");
    if (search) search.addEventListener("input", (e) => { state.search = e.target.value.trim(); renderPalette(); });

    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", () => { if (state.zoom === CELL_BASE) zoomFit(); });

    // seed history with initial (empty) state
    state.history = [snapshot()]; state.histIdx = 0; updateUndoButtons();

    setTool("brush");
    setZoom(CELL_BASE);
    selectBrush(CAT.tiles.find((t) => t.type === "Floor") || CAT.tiles[0]);
  }

  // ── BMM 实时联动桥接（仅当被 BMM 以 window.open 打开时启用）──
  (function () {
    function start() {
      if (!window.opener) return; // 独立打开编辑器时不启用
      const opener = window.opener;
      let throttle = null;
      function send(msg) { try { opener.postMessage(Object.assign({ source: "bmm-editor" }, msg), "*"); } catch (e) {} }
      function liveNow() { const s = exportStr(); if (s) send({ type: "live", map: s }); }
      function liveThrottled() { if (throttle) return; throttle = setTimeout(function () { throttle = null; liveNow(); }, 120); }

      // 接收 BMM 指令
      window.addEventListener("message", function (e) {
        const d = e.data || {};
        if (d.source !== "bmm") return;
        if (d.type === "load" && d.map) { try { loadFromString(d.map); liveNow(); } catch (err) {} }
        else if (d.type === "request-sync") { liveNow(); }
        else if (d.type === "ping") { send({ type: "pong" }); }
      });

      // 每次编辑提交 → 节流回传当前地图给 BMM
      const _origPush = pushHistory;
      pushHistory = function () { const r = _origPush.apply(this, arguments); liveThrottled(); return r; };

      // 「应用到游戏」按钮已在 HTML 模板中定义（id=btnApplyGame，调 applyToGame 复制剪贴板）
      // 若从 BMM 打开（联动模式），增强其行为：复制剪贴板 + 同步回传 BMM
      const applyBtn = document.getElementById("btnApplyGame");
      if (applyBtn && window.opener) {
        const _origHandler = applyBtn.onclick || null;
        applyBtn.addEventListener("click", function () {
          const s = exportStr();
          if (s) send({ type: "export", map: s });
        });
      }

      // 标题栏加「BMM联动」标记（用 MutationObserver 防止 i18n 重写标题时丢失）
      const hdr = document.getElementById("appTitle");
      if (hdr) {
        const mkBadge = () => {
          if (document.getElementById("bmmLinkBadge")) return;
          const b = document.createElement("span");
          b.id = "bmmLinkBadge";
          b.textContent = " · BMM联动";
          b.style.cssText = "color:#14b478;font-size:12px;";
          hdr.appendChild(b);
        };
        mkBadge();
        new MutationObserver(mkBadge).observe(hdr, { childList: true });
      }

      // 通知 BMM：编辑器就绪
      send({ type: "ready" });
    }
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
    else start();
  })();

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
