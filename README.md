# BC 房间地图串生成器 + 可视化编辑器
# BC Room Map String Generator + Visual Editor

把「文字描述 / 网格点选」转成可直接 `/mappaste` 的 BC 地图数据串的可视化编辑器。**纯本地逻辑**，无需读实机、无需 mod。
A visual editor that turns "text descriptions / grid clicks" into a BC map data string ready for `/mappaste`. **Purely local logic** — no need to read the live client, no mod required.

> 适用游戏：Bondage Club（BC）。地图数据与游戏内 `/mappaste` 完全兼容。
> Target game: Bondage Club (BC). The map data is fully compatible with the in-game `/mappaste` command.

## 核心机制（已对照 BC 源码 `ChatRoomMapView.js` 验证）
## Core Mechanics (verified against BC source `ChatRoomMapView.js`)

- 地图 = 40×40 网格，两层：**Tiles**（地面/墙体）与 **Objects**（门/钥匙/障碍/装饰/标记）。
  The map is a 40×40 grid with two layers: **Tiles** (floor/walls) and **Objects** (doors/keys/obstacles/decorations/markers).
- 每层是一个 1600 字符的字符串：`index = X + Y*40`，每字符 `String.fromCharCode(部件ID)`。
  Each layer is a 1600-character string: `index = X + Y*40`, with each character being `String.fromCharCode(partID)`.
- 空白格 = ID 100（在 Tiles 层是 OakWood 地板，在 Objects 层是 Blank 装饰）。
  An empty cell = ID 100 (OakWood floor on the Tiles layer, Blank decoration on the Objects layer).
- mappaste 串格式：`LZString.compressToBase64(JSON.stringify({ Type, Tiles, Objects, Fog }))`。
  The mappaste string format is: `LZString.compressToBase64(JSON.stringify({ Type, Tiles, Objects, Fog }))`.
- **门控通行**：源码 `ChatRoomMapViewPositionIsBlocked`（1174–1179 行）先查 object 的 `CanEnter` 再查 tile。所以把 `WallPath` 门（如 WoodLockedGold 4015）放在墙瓦片上，门的开/锁判定覆盖底层墙——密室逃脱的钥匙门**零 mod** 即可做。
  **Door-gated passage**: in the source, `ChatRoomMapViewPositionIsBlocked` (lines 1174–1179) checks the object's `CanEnter` before checking the tile. So placing a `WallPath` door (e.g. WoodLockedGold 4015) on a wall tile lets the door's open/locked state override the underlying wall — escape-room key-door puzzles can be built with **zero mods**.
- 原生钥匙：`KeyBronze/Silver/Gold`(160/162/164) 拾取写入 `HasKeyX`，对应 `WoodLocked*/MetalLocked*` 门读该标志放行。
  Native keys: picking up `KeyBronze/Silver/Gold` (160/162/164) sets `HasKeyX`, and the corresponding `WoodLocked*/MetalLocked*` doors read that flag to allow passage.
- **边界**：灯光/染色效果（Effects ID 10–17）不在 mappaste 串内（legacy 可省），编辑器已显式排除并提示。
  **Boundary**: lighting/tint effects (Effects ID 10–17) are not part of the mappaste string (can be omitted for legacy compatibility); the editor explicitly excludes these and shows a notice.

## 功能
## Features

- 左：部件面板——「地板/墙体层」与「物件层」切换，支持搜索、分类、选中高亮。
  Left: parts panel — toggle between "Floor/Wall layer" and "Object layer", with search, categories, and selection highlighting.
- 中：40×40 网格画布——左键画、右键擦（当前层）、拖动连续刷。
  Center: 40×40 grid canvas — left-click to paint, right-click to erase (current layer), drag to paint continuously.
- 右：mappaste 数据串文本框，支持「生成代码」「导出文件」「导入文件」，以及直接粘贴自动识别。
  Right: mappaste data string textbox, supporting "Generate Code", "Export File", "Import File", and automatic recognition on paste.
- **多语言**：简体中文 / 繁體中文 / English / Deutsch / Français / Русский / Українська / 自动（跟随浏览器），选择记忆在 `localStorage`。
  **Multilingual**: Simplified Chinese / Traditional Chinese / English / Deutsch / Français / Русский / Українська / Auto (follows browser), with the choice remembered in `localStorage`.
- **画布平移**：放大后按住 **空格 + 左键拖拽** 或 **鼠标中键拖拽** 平移地图。
  **Canvas panning**: after zooming in, hold **Space + left-click drag** or **middle-click drag** to pan the map.
- **深色主题** + 自定义滚动条 + 入场/交互动画。
  **Dark theme** + custom scrollbars + entrance/interaction animations.

## 目录结构
## Directory Structure

```
.
├── index.html          # 自包含可视化编辑器（构建产物，勿手改；双击即可用）
├── assets/             # 部件缩略图（配合 index.html 同目录使用，或部署到 GitHub Pages）
├── src/                # 编辑器源码（构建前的原始文件）
│   ├── editor-src.html #   带占位符的 HTML 模板
│   ├── editor-ui.js    #   编辑器交互逻辑
│   ├── i18n.js          #   多语言框架
│   ├── zh-labels.js    #   部件中文名（cn/tw 界面用）
│   ├── map-lib.js      #   编码库（Node + 浏览器通用）：encode/decode/gridToChars/charsToGrid/validateId/idByStyle
│   ├── LZString.js     #   压缩库
│   ├── catalog.json    #   部件目录：53 地板/墙体 + 225 物件 + 8 效果，含 byId/byStyle 索引
│   └── images.json     #   部件缩略图路径清单
├── scripts/            # 构建 / 维护脚本
│   ├── build-editor.js #   把 src/ 下所有源码内联进 index.html
│   ├── extract-catalog.js  # 从 BC 源码抽部件表 → src/catalog.json
│   └── download-assets.js  # 下载缩略图 → assets/ + src/images.json
├── tests/
│   └── test-editor.js  # jsdom 无头冒烟测试（读取根目录 index.html）
└── examples/
    ├── example.js       # 示例：外墙 + 金锁门 + 金钥匙 + 雕像 + 入口旗，encode→decode 往返验证
    └── example-map.txt  # 上面脚本输出的可直接 /mappaste 的串
```

```
.
├── index.html          # Self-contained visual editor (build output, do not edit by hand; just double-click to use)
├── assets/             # Part thumbnails (used alongside index.html in the same folder, or deployed to GitHub Pages)
├── src/                # Editor source code (raw files before build)
│   ├── editor-src.html #   HTML template with placeholders
│   ├── editor-ui.js    #   Editor interaction logic
│   ├── i18n.js          #   Multilingual framework
│   ├── zh-labels.js    #   Chinese names for parts (used by cn/tw interfaces)
│   ├── map-lib.js      #   Encoding library (Node + browser compatible): encode/decode/gridToChars/charsToGrid/validateId/idByStyle
│   ├── LZString.js     #   Compression library
│   ├── catalog.json    #   Parts catalog: 53 floors/walls + 225 objects + 8 effects, with byId/byStyle indexes
│   └── images.json     #   List of part thumbnail paths
├── scripts/            # Build / maintenance scripts
│   ├── build-editor.js #   Inlines all source files under src/ into index.html
│   ├── extract-catalog.js  # Extracts the parts table from BC source → src/catalog.json
│   └── download-assets.js  # Downloads thumbnails → assets/ + src/images.json
├── tests/
│   └── test-editor.js  # jsdom headless smoke test (reads index.html from the repo root)
└── examples/
    ├── example.js       # Example: outer wall + gold-locked door + gold key + statue + entrance flag, encode→decode round-trip verification
    └── example-map.txt  # The ready-to-/mappaste string output by the script above
```

`index.html` 与 `assets/` 必须留在仓库根目录：两者路径互相引用，也是 GitHub Pages 的部署入口。其余原始文件放进 `src/`、`scripts/`、`tests/`、`examples/`，不影响 `npm run build` / `npm test` 的运作。
`index.html` and `assets/` must stay at the repository root: they reference each other's paths, and the root is also the GitHub Pages deployment entry point. The other raw files live in `src/`, `scripts/`, `tests/`, and `examples/`, which doesn't affect how `npm run build` / `npm test` operate.

## 用法
## Usage

1. 浏览器打开 `index.html`（或访问部署的 GitHub Pages 地址）。
   Open `index.html` in a browser (or visit the deployed GitHub Pages URL).
2. 选「地板/墙体层」先用墙（Wall）画房间轮廓；切「物件层」放门（Door）/钥匙（Key）/障碍（Obstacle）/标记（Marker）。
   Select the "Floor/Wall layer" and use Wall to draw the room outline first; switch to the "Object layer" to place Doors/Keys/Obstacles/Markers.
3. 左键画、右键擦（擦当前层）、可在格子上拖动连续刷；放大后空格/中键拖拽平移。
   Left-click to paint, right-click to erase (erases the current layer), drag across cells to paint continuously; after zooming in, use Space/middle-click drag to pan.
4. 点「生成代码」→「复制」，进游戏聊天框输入 `/mappaste <串>` 铺设。
   Click "Generate Code" → "Copy", then type `/mappaste <string>` in the game's chat box to lay out the map.
5. 反向：把已有串贴进下方文本框（自动识别）即可在编辑器里继续改；或点「导入文件」载入本地 `.txt`。
   Reverse direction: paste an existing string into the textbox below (auto-detected) to continue editing it in the editor; or click "Import File" to load a local `.txt` file.

## 开发 / 验证
## Development / Verification

```
npm install          # 装 jsdom（仅测试需要）
npm run build        # 重建 index.html（src/ → 根目录 index.html）
npm test             # jsdom 冒烟测试
npm run example      # 跑 examples/example.js
```

```
npm install          # Installs jsdom (only needed for tests)
npm run build        # Rebuilds index.html (src/ → root index.html)
npm test             # Runs jsdom smoke tests
npm run example      # Runs examples/example.js
```

- `node examples/example.js`：示例地图 encode→decode 往返，长度 1600、ID 合法、重编码稳定 ✅
  `node examples/example.js`: example map encode→decode round-trip — length 1600, valid IDs, stable re-encoding ✅
- jsdom 冒烟测试 `index.html`：1600 格渲染、53+225 部件面板、示例→导出产出有效串、door 落位正确、多语言切换、铺地板、**0 个 JS 错误** ✅
  jsdom smoke test on `index.html`: renders 1600 cells, 53+225 part panels, example→export produces a valid string, door placement is correct, multilingual switching works, floor painting works, **0 JS errors** ✅
- 真机铺设效果待用户在游戏内 `/mappaste` 实测确认。
  Real in-game placement results are still pending confirmation from users testing `/mappaste` live.

## 许可
## License

本编辑器为独立工具，部件名/图片来自 Bondage Club 游戏资源，仅供该游戏社区内使用。
This editor is an independent tool. Part names/images are sourced from Bondage Club game assets and are intended for use within that game's community only.
