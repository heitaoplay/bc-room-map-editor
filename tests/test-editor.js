// Headless functional test of index.html using jsdom (tests the editor's own
// logic, not the BC game). Verifies init + 示例 + 导出串 produce a valid mappaste string.
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

    // click 示例
    doc.getElementById("btnExample").click();
    // click 导出串
    doc.getElementById("btnExport").click();
    const out = doc.getElementById("output").value;
    console.log("exported string length:", out.length, out && !out.startsWith("ERROR") ? "OK" : "FAIL");

    // verify the produced string decodes & re-encodes (uses inlined MapLib)
    const MapLib = window.MapLib;
    const decoded = MapLib.decode(out);
    const ok =
      decoded.Tiles.length === 1600 &&
      decoded.Objects.length === 1600 &&
      MapLib.encode({ type: decoded.Type, tiles: decoded.Tiles, objects: decoded.Objects, fog: decoded.Fog }) === out;
    console.log("decode+reencode stable:", ok ? "OK" : "FAIL");

    // spot-check a known cell from the example: door object at (20,0)
    const gO = MapLib.charsToGrid(decoded.Objects);
    const doorOk = gO[0][20] === MapLib.idByStyle("WallPath:WoodLockedGold");
    console.log("example door placed at (20,0):", doorOk ? "OK" : "FAIL", "id=" + gO[0][20]);

    // switch to an objects category via the ☰ menu (replaces removed layerObjects button)
    selectTop(3); // "item" top = 钥匙/门/道具（全部物件）
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

    // undo/redo: after 示例 the undo stack has 1 step; undo then redo
    const undoBtn = doc.getElementById("btnUndo"), redoBtn = doc.getElementById("btnRedo");
    const undoEnabledAfterExample = !undoBtn.disabled;
    undoBtn.click(); // back to empty
    const redoEnabled = !redoBtn.disabled;
    redoBtn.click(); // forward to example
    // after redo the example door should still be at (20,0)
    const out2 = doc.getElementById("output").value || (doc.getElementById("btnExport").click(), doc.getElementById("output").value);
    const dec2 = MapLib.decode(out2);
    const doorOk2 = MapLib.charsToGrid(dec2.Objects)[0][20] === MapLib.idByStyle("WallPath:WoodLockedGold");
    console.log("undo/redo (enabled + door restored):", undoEnabledAfterExample && redoEnabled && doorOk2 ? "OK" : "FAIL");

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

    // rendering: object cells get a backgroundImage; objects use contain, tiles use cover
    doc.getElementById("btnExample").click(); // reset to known example state
    const doorObj = doc.getElementById("grid").children[20].firstChild;       // (0,20) door
    const flagObj = doc.getElementById("grid").children[2 * 40 + 20].firstChild; // (2,20) entry flag
    const wallCell = doc.getElementById("grid").children[0];                  // (0,0) wall
    const doorImg = /url\(/.test(doorObj.style.backgroundImage || "");
    const flagImg = /url\(/.test(flagObj.style.backgroundImage || "");
    const flagSize = flagObj.style.backgroundSize;
    const wallSize = wallCell.style.backgroundSize;
    console.log("object cell has bg image (door):", doorImg ? "OK" : "FAIL");
    console.log("object cell has bg image (flag):", flagImg ? "OK" : "FAIL");
    console.log("object bg-size is contain (flag):", flagSize === "contain" ? "OK" : "FAIL", "(" + flagSize + ")");
    console.log("tile bg-size is cover (wall):", wallSize === "cover" ? "OK" : "FAIL", "(" + wallSize + ")");
    const renderOk = doorImg && flagImg && flagSize === "contain" && wallSize === "cover";

    // 铺当前选中地板: select a floor brush, click 铺地板, verify whole tile layer = that id
    search.value = ""; search.dispatchEvent(new window.Event("input")); // clear prior filter
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
          doc.getElementById("btnExample").textContent === "Example" &&
          doc.getElementById("btnExport").textContent === "Generate code" &&
          doc.getElementById("curCatLabel").textContent.length > 0 &&
          doc.getElementById("toolBrush_t").textContent === "Brush" &&
          window.localStorage.getItem("bc-map-locale") === "en";
        // switch → cn
        langSel.value = "cn";
        langSel.dispatchEvent(new window.Event("change"));
        const cn =
          doc.getElementById("btnExample").textContent === "示例" &&
          doc.getElementById("btnExport").textContent === "生成代码" &&
          doc.getElementById("toolBrush_t").textContent === "笔刷" &&
          window.localStorage.getItem("bc-map-locale") === "cn";
        return en && cn;
      })();
    console.log("i18n language switch (en↔cn + persist):", langOk ? "OK" : "FAIL");

    console.log("\nJS errors captured:", errors.length);
    if (errors.length) errors.forEach((e) => console.log("  -", e));
    console.log(
      cells === 1600 && ok && doorOk && !out.startsWith("ERROR") && errors.length === 0 && renderOk && fillOk && langOk
        ? "\nRESULT: EDITOR OK"
        : "\nRESULT: EDITOR HAS ISSUES"
    );
  } catch (e) {
    console.log("TEST THREW:", e.stack);
  }
}, 100);
