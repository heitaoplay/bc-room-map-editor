// Headless functional test of index.html using jsdom (tests the editor's own
// logic, not the BC game). Verifies init + 清空/绘制 + 导出串 produce a valid mappaste string.
const fs = require("fs");
const path = require("path");
const { JSDOM } = require("jsdom");

const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const errors = [];
const dom = new JSDOM(html, {
  runScripts: "dangerously",
  url: "http://localhost/",
  beforeParse(window) {
    window.navigator.clipboard = { writeText: () => Promise.resolve() };
    // Force the editor's default locale to cn so the "钥匙" palette search works in the test.
    try { window.localStorage.setItem("bc-map-locale", "cn"); } catch (e) {}
    window.addEventListener("error", (e) => errors.push(String(e.error || e.message)));
  },
});
const { window } = dom;
const doc = window.document;

// Helper: open the ☰ category menu and select the i-th TOP category.
// The palette was redesigned from two layer buttons (layerTiles/layerObjects)
// into a category menu (catMenuBtn + catMenu). TOPS order: 0 floor, 1 wall,
// 2 deco, 3 item, 4 marker. Indices 0/1 are tile-ish; 2/3/4 are object categories.
function selectTop(i) {
  const m = doc.getElementById("catMenu");
  if (m.hidden) doc.getElementById("catMenuBtn").click(); // open + renderCatMenu
  const tops = doc.querySelectorAll(".cat-group-title");
  tops[i].click(); // selectCategory(top.id) + closeCatMenu
}

// init runs on DOMContentLoaded; jsdom fires it. Give microtasks a tick.
setTimeout(() => {
  try {
    const cells = doc.getElementById("grid").children.length;
    console.log("grid cells:", cells, cells === 1600 ? "OK" : "FAIL");
    const paletteItems = doc.querySelectorAll(".pal-item").length;
    console.log("palette items (tiles layer):", paletteItems, paletteItems > 0 ? "OK" : "FAIL");

    const MapLib = window.MapLib;

    // 清空，然后选入口旗（well-known object，带贴图）放到 (10,5)，建立已知状态
    doc.getElementById("btnClear").click();
    selectTop(3); // "Props" top = 钥匙/门/旗/道具（全部物件）
    const FLAG = MapLib.idByStyle("FloorDecoration:EntryFlag");
    const flagItem = Array.from(doc.querySelectorAll(".pal-item")).find((el) => /#\d+/.test(el.title) && parseInt(el.title.match(/#(\d+)/)[1], 10) === FLAG);
    flagItem.click(); // select brush = entry flag (objects layer)
    const cellFlag = doc.getElementById("grid").children[5 * 40 + 10];
    cellFlag.dispatchEvent(new window.MouseEvent("mousedown", { bubbles: true }));
    // a brush stroke commits to history on mouseup (matches real user input)
    doc.dispatchEvent(new window.MouseEvent("mouseup", { bubbles: true }));
    // 导出串
    doc.getElementById("btnExport").click();
    const out = doc.getElementById("output").value;
    console.log("exported string length:", out.length, out && !out.startsWith("ERROR") ? "OK" : "FAIL");

    // verify the produced string decodes & re-encodes (uses inlined MapLib)
    const decoded = MapLib.decode(out);
    const ok =
      decoded.Tiles.length === 1600 &&
      decoded.Objects.length === 1600 &&
      MapLib.encode({ type: decoded.Type, tiles: decoded.Tiles, objects: decoded.Objects, fog: decoded.Fog }) === out;
    console.log("decode+reencode stable:", ok ? "OK" : "FAIL");

    // spot-check the placed entry flag at (10,5)
    const gO = MapLib.charsToGrid(decoded.Objects);
    const flagOk = gO[5][10] === FLAG;
    console.log("entry flag placed at (10,5):", flagOk ? "OK" : "FAIL", "id=" + gO[5][10]);

    // switch to an objects category via the ☰ menu (replaces removed layerObjects button)
    selectTop(3); // "Props" top = 钥匙/门/旗/道具（全部物件）
    const objItems = doc.querySelectorAll(".pal-item").length;
    console.log("palette items (objects layer):", objItems, objItems > 0 ? "OK" : "FAIL");

    // ---- v2 UI checks: coords readout, tool toggles, undo/redo, search ----
    const coords = doc.getElementById("coords");
    const search = doc.getElementById("palSearch");
    console.log("coords element present:", coords ? "OK" : "FAIL");
    console.log("palSearch element present:", search ? "OK" : "FAIL");

    // tool toggle: switch to 矩形, expect it active and 笔刷 inactive
    doc.getElementById("toolRect").click();
    const rectActive = doc.getElementById("toolRect").classList.contains("active");
    const brushInactive = !doc.getElementById("toolBrush").classList.contains("active");
    console.log("tool toggle (rect active / brush inactive):", rectActive && brushInactive ? "OK" : "FAIL");

    // undo/redo: after placing the flag the undo stack has a step; undo then redo.
    // obj[5][10] = FLAG (110) when painted; BLANK (100) after undo; FLAG again after redo.
    // (Note: BLANK's id coincides with OAK's id 100, so we distinguish undo-state by the
    // object layer only — the tile layer stays OAK=100 throughout.)
    const undoBtn = doc.getElementById("btnUndo"), redoBtn = doc.getElementById("btnRedo");
    const undoEnabledAfterPaint = !undoBtn.disabled;
    function objAt(x, y) {
      doc.getElementById("btnExport").click();
      return MapLib.charsToGrid(MapLib.decode(doc.getElementById("output").value).Objects)[y][x];
    }
    undoBtn.click(); // back to empty (object layer blank)
    const redoEnabled = !redoBtn.disabled;
    const objAfterUndo = objAt(10, 5);
    redoBtn.click(); // forward to flag-placed
    const objAfterRedo = objAt(10, 5);
    const undoRedoOk = undoEnabledAfterPaint && redoEnabled && objAfterUndo === MapLib.BLANK && objAfterRedo === FLAG;
    console.log("undo/redo (enabled + flag→blank→flag):", undoRedoOk ? "OK" : "FAIL", "undo=" + objAfterUndo, "redo=" + objAfterRedo);

    // palette search filters items
    search.value = "钥匙";
    search.dispatchEvent(new window.Event("input"));
    const keyItems = doc.querySelectorAll(".pal-item").length;
    console.log("palette search '钥匙' filters:", keyItems > 0 && keyItems < objItems ? "OK" : "FAIL", "(" + keyItems + " of " + objItems + ")");

    // coords readout updates on cell hover
    coords.textContent = "—";
    const c00 = doc.getElementById("grid").children[0];
    c00.dispatchEvent(new window.MouseEvent("mouseenter"));
    const coordOk = /\(0, 0\)/.test(coords.textContent);
    console.log("coords readout on hover:", coordOk ? "OK" : "FAIL", JSON.stringify(coords.textContent));

    // rendering: object cells carry a raster image (EntryFlag has a PNG in IMG) sized
    // contain; tile cells carry a raster image sized cover. We assert the actual rendered
    // inline styles rather than assuming.
    search.value = ""; search.dispatchEvent(new window.Event("input")); // clear filter
    const flagObj = doc.getElementById("grid").children[5 * 40 + 10].firstChild; // (10,5) entry flag
    const wallCell = doc.getElementById("grid").children[0];                       // (0,0) oak tile
    const objImg = /url\(/.test(flagObj.style.backgroundImage || "");
    const objSize = flagObj.style.backgroundSize;
    const wallImg = /url\(/.test(wallCell.style.backgroundImage || "");
    const wallSize = wallCell.style.backgroundSize;
    console.log("object cell has raster image (flag):", objImg ? "OK" : "FAIL");
    console.log("object bg-size is contain (flag):", objSize === "contain" ? "OK" : "FAIL", "(" + objSize + ")");
    console.log("tile has raster image + cover (wall):", wallImg && wallSize === "cover" ? "OK" : "FAIL", "(" + wallSize + ")");
    const renderOk = objImg && objSize === "contain" && wallImg && wallSize === "cover";

    // 铺当前选中地板: select a floor brush, click 铺地板, verify whole tile layer = that id
    selectTop(0); // back to 地板 (tiles/floor) category
    const firstFloorItem = doc.querySelector(".pal-item"); // tiles layer first section is 地板 Floor
    firstFloorItem.click();
    const selItem = doc.querySelector(".pal-item.sel");
    const selId = selItem ? parseInt((selItem.title.match(/#(\d+)/) || [])[1], 10) : null;
    doc.getElementById("btnFill").click();
    doc.getElementById("btnExport").click();
    const decFill = MapLib.decode(doc.getElementById("output").value);
    const gFill = MapLib.charsToGrid(decFill.Tiles);
    const allSame = gFill.every((row) => row.every((v) => v === selId));
    console.log("铺当前选中地板 (whole layer = selected id " + selId + "):", (selId != null && allSame) ? "OK" : "FAIL");
    const fillOk = selId != null && allSame;

    // ---- i18n: language switch ----
    const langSel = doc.getElementById("langSel");
    const langOk =
      !!langSel &&
      langSel.options.length === 8 &&
      (() => {
        // switch → en
        langSel.value = "en";
        langSel.dispatchEvent(new window.Event("change"));
        const en =
          doc.getElementById("btnExport").textContent === "Generate code" &&
          doc.getElementById("curCatLabel").textContent.length > 0 &&
          doc.getElementById("toolBrush_t").textContent === "Brush" &&
          window.localStorage.getItem("bc-map-locale") === "en";
        // switch → cn
        langSel.value = "cn";
        langSel.dispatchEvent(new window.Event("change"));
        const cn =
          doc.getElementById("btnExport").textContent === "生成代码" &&
          doc.getElementById("toolBrush_t").textContent === "笔刷" &&
          window.localStorage.getItem("bc-map-locale") === "cn";
        return en && cn;
      })();
    console.log("i18n language switch (en↔cn + persist):", langOk ? "OK" : "FAIL");

    console.log("\nJS errors captured:", errors.length);
    if (errors.length) errors.forEach((e) => console.log("  -", e));
    console.log(
      cells === 1600 && ok && flagOk && !out.startsWith("ERROR") && errors.length === 0 && renderOk && fillOk && langOk
        ? "\nRESULT: EDITOR OK"
        : "\nRESULT: EDITOR HAS ISSUES"
    );
  } catch (e) {
    console.log("TEST THREW:", e.stack);
  }
}, 100);
