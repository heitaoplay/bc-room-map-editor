# BMM 插件新增功能 · UI 位置与实现方案规划（不写代码）

> 分析对象：`liko - BMM` v1.1.0（`awdrrawd/liko-Plugin-Repository`）
> 目标：在 BMM 中规划 4 项新功能的 UI 落点与实现思路，评估可行性。本文**不涉及代码实现**。

---

## 0. 现状回顾（BMM v1.1.0 UI 结构）

BMM 有两层 UI 面：

1. **BC 画布内切换按钮**（游戏画面右上角）
   - 在 `GameRun` 每帧 `DrawButton(955, 0, 45, 45, …)` 画出 🗺️（隐藏时）/▼（展开时）。
   - 点击命中在 `ChatRoomClick` 的 `MouseIn(955,0,45,45)` → `togglePanel()`。
   - 仅当 `canShowMapButton()` 为真（ChatRoom 画面 + 处于地图房 `inMapMode` + 无 `CurrentCharacter`）才绘制。

2. **DOM 浮动面板** `#bc-minimap-root`（`position:fixed; top:60px; left:80px; z-index:99999`，可拖拽）
   - **Header** `#bc-minimap-hdr`：标题（双击切主题色）+ 铜/银/金钥匙指示 + 模式按钮组 `[局部][全圖][完整][✕]`。
   - **Canvas** `#bc-minimap-canvas`：迷你地图本体；尺寸随模式变化（局部 300 / 全圖 500 / 完整 640）。
   - **Footer** `#bc-minimap-ftr`：左侧 📍坐标、中间悬停/选中信息、右侧 👤人数（可点击展开人员侧栏）。
   - **人员侧栏** `#bc-minimap-people`：主面板右侧浮出的 220px 名单。
   - 面板高度 = `HDR_H(36) + canvas + FTR_H(32)`，由 `setMode()` / `togglePanel()` 计算并 `setProperty`。

**关键数据**：`getMapData()` 返回 `ChatRoomData.MapData`（`{Type,Tiles,Objects,Fog}`，Tiles/Objects 为 1600 字符定长字符串）。这与本工作区的 **bc-room-map-editor 完全同源**（同一套 LZString 编码），是后续"跳转编辑器 / 导出互通"联动的基础。

---

## 1. 功能一：跳转「BC 地图在线编辑」按钮

### 推荐 UI 位置
- **主推**：在面板 Header 的模式按钮组旁新增一个 `🌐 編輯` 按钮（沿用 `.mm-btn` 样式），或归入下方新增的「工具列」行首项。
- **备选（不优先）**：在 BC 画布 `(905,0,45,45)` 再加一个 `DrawButton`（✎）。缺点：需每帧绘制 + 在 `ChatRoomClick` 增加 `MouseIn` 命中逻辑，且与现有 (955,0) 按钮挤占右上角，复杂度高、收益低。

### 实现思路
- **最简版（P1 即可做）**：按钮 `click` → `window.open('https://heitaoplay.github.io/bc-room-map-editor/', '_blank')`。纯打开网页，用户自行在编辑器里粘贴/导入地图。
- **进阶版（联动加分）**：读取 `ChatRoomData.MapData` → `LZString.compressToBase64(JSON.stringify({Type,Tiles,Objects,Fog}))` 编码 → `window.open(url + '#map=' + encoded, '_blank')`。**前置依赖**：bc-room-map-editor 需支持读取 `location.hash` 中的 `map` 参数自动载入（当前编辑器可能未实现，属对方改造项，列为风险）。

### 可行性
- **高（最简版）/ 中（进阶版）**。最简版零依赖；进阶版受编辑器侧配合度制约。
- 弹窗拦截：用按钮 `click` 事件内同步调用 `window.open` 可规避浏览器拦截（需用户手势触发）。

---

## 2. 功能二：地图保存 / 载入（IndexedDB）

### (a) 保存当前地图
- **UI 入口**：工具列 `💾 保存` 按钮 → 点击后弹出轻量命名输入（面板内浮层 `<input>`，或 `window.prompt` 兜底）→ 写入 IndexedDB。
- **数据**：`{id, name, savedAt, Type, Tiles, Objects, Fog}`（直接取自 `ChatRoomData.MapData`）。单条约 3–4KB，极小。

### (b) 载入储存的地图
- **UI 入口**：工具列 `📂 載入` 按钮 → 展开已存地图列表浮层（名称 + 保存时间 + 缩略），点击某条载入。
- **载入语义（两种，建议分级）**：
  1. **查看模式（推荐默认）**：将面板地图数据源临时覆盖为该存档，离线也可在 BMM 内查看/缩放/点击坐标。纯本地，无服务器交互。
  2. **套用到当前房间（管理员增强）**：若是房管，调用游戏内地图更新 API 把 `MapData` 推回服务器。需权限校验 + 结构校验，列为高级项。
- **设计决策点**：当前面板显示条件 `canShowMapButton()` 要求 `inMapMode`，若要做"离线查看存档地图"，需放宽显示条件（存在存档且用户进入"查看模式"时允许显示面板）。建议在 P0/P1 一并处理。

### IndexedDB 实现思路（概念，非代码）
- 库 `bmm_maps`，对象仓库 `maps`（keyPath `id` 或 `name`）；封装 Promise：openDB / putMap / getAllMaps / getMap / deleteMap。
- userscript `@grant none` 在页面上下文可直接用全局 `indexedDB`，**无需任何外部库**。

### 可行性
- **高**。全部 API 在 BC 页面内原生可用。

### 风险 / 注意
- **同源隔离**：IndexedDB 按页面 origin 划分。在 `asia` / `europe` / `elementfx` 不同域名下存的地图**互不通**，换浏览器或清站点数据会丢失。属"本地个人库"预期行为，需在 UI 注明"仅本机本域可用"。
- **显示条件限制**：见上方"设计决策点"。

---

## 3. 功能三：一键批量导出（所有已存地图 → 本地）

### UI 入口
- 工具列 `⬇ 匯出` 按钮 → 点击即从 IndexedDB 读出全部地图并触发下载。

### 文件输出方式（三方案比较）
| 方案 | 输出 | 优点 | 缺点 |
|---|---|---|---|
| **A（推荐主）** | 1 个合并 `.json`（`[{name,savedAt,Type,Tiles,Objects,Fog},…]`） | 单文件易备份、易再导入、无多下载拦截 | 与编辑器单图导入需做数组嗅探 |
| **B（推荐可选）** | 每图 1 个 `.bcroom`（与 bc-room-map-editor 导入格式对齐） | 可直接被编辑器识别 | N 次下载，浏览器可能拦截/需用户允许 |
| C（不优先） | 打包 `.zip` | 整洁 | 需内嵌 zip 实现（`@grant none` 无 @require，不便） |

- **推荐 A 为主、B 可选**；两者均复用同一 LZString 编码，确保能被 bc-room-map-editor 识别。

### 实现思路
- `getAllMaps()` → 组装 `Blob('application/json')` → 动态创建 `<a download="bmm-maps-<日期>.json">` 触发点击。纯前端，零依赖。

### 可行性
- **高**。

---

## 4. 功能四：批量导入（本地文件 → 插件）

### UI 入口
- 工具列 `⬆ 匯入` 按钮 → 触发隐藏 `<input type="file" multiple accept=".json,.bcroom,.txt">`。

### 导入交互
- 选文件后逐个 `FileReader.readAsText` → **格式嗅探**（合并 json 数组 / 单条 json / bcroom 编码串）→ 校验结构（Tiles/Objects 长度与存在性）→ `upsert` 入 IndexedDB（按 `name`/`id` 去重）。
- 导入后刷新"已存地图列表"；重名策略：覆盖 / 跳过 / 加时间戳，建议弹浮层让用户选。

### 可行性
- **高**。File API 全支持。

### 风险
- 需兼容 3 种来源格式（自身合并 json、单条 json、编辑器 bcroom 编码）→ 解析层要做格式嗅探与降级。

---

## 5. 综合 UI 布局建议（新增「工具列」行）

```
┌─────────────────────────────────────┐
│ 🗺️ RoomName    🔑🔑🔑 [局部][全圖][完整][✕] │ ← Header（现有）
├─────────────────────────────────────┤
│                                     │
│          （迷你地图 Canvas）          │
│                                     │
├─────────────────────────────────────┤
│ [🌐編輯][💾保存][📂載入][⬇匯出][⬆匯入] │ ← 新增「工具列」行（map 管理/外部）
├─────────────────────────────────────┤
│ 📍(x,y)   悬停信息        👤 N人      │ ← Footer（现有）
└─────────────────────────────────────┘
```

- **位置**：工具列行放在 **Canvas 与 Footer 之间**（或 Header 下方）。放在 Canvas 下更贴近"对地图做操作"的语义，且 Footer 仍保留坐标/人数。
- **高度计算需调整**：新增常量 `TOOLBAR_H`（约 30px），面板高度改为 `HDR_H + canvas + TOOLBAR_H + FTR_H`；`setMode()` / `togglePanel()` 里同步更新。
- **拥挤处理**：5 个 9px 按钮在 300px「局部」模式下偏挤。建议：① 用图标 + tooltip 精简文字；② 或把 `🌐編輯` 留在 Header、其余 4 个放工具列；③ 工具列 `flex-wrap` 允许换行。
- **次级界面**（载入列表浮层、文件选择、命名输入）一律在面板内浮层呈现，**不占用 BC 画布**，避免与 `GameRun`/`ChatRoomClick` 每帧绘制逻辑耦合。

---

## 6. 可行性总评与风险汇总

| 功能 | 可行性 | 主要风险 |
|---|---|---|
| 1 跳转编辑器（最简打开） | 高 | 无 |
| 1 跳转编辑器（带地图） | 中 | 依赖 bc-room-map-editor 实现 hash 载入 |
| 2 保存/载入（IndexedDB） | 高 | 同源隔离、离线查看需放宽显示条件 |
| 3 批量导出 | 高 | 若选方案 B，多文件下载可能被浏览器拦截 |
| 4 批量导入 | 高 | 多格式嗅探与校验 |

- **整体**：四项功能均为纯前端、无外部依赖（IndexedDB / File / Blob / `window.open` 在 `@grant none` 页内均可直接调用），**可行性高**。
- **建议分期**：
  - **P0**：新增工具列行 + 保存/載入/匯出/匯入 的 IndexedDB 全链路；同时放宽面板显示条件以支持"离线查看存档"。
  - **P1**：跳转编辑器（先纯打开，后带地图联动）；导入冲突策略浮层。

---

## 7. 与 bc-room-map-editor 的联动（加分项）

BMM 与编辑器共用同一 `MapData` 编码，可形成闭环：
- **BMM 导出 ⇄ 编辑器导入**：双向互通（方案 B / bcroom 格式）。
- **功能一"带地图打开编辑器"**：最高价值联动——在 BMM 里看实时地图，一键甩进在线编辑器精细绘制，再导回。建议作为联动演示优先做。

> 下一步若推进实现，需先与 bc-room-map-editor 确认其「导入文件」的确切格式（单图 `.bcroom` 的包装结构），以保证导出/导入互通无误。
