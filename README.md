# BC 房间地图串生成器 + 可视化编辑器

把「文字描述 / 网格点选」转成可直接 `/mappaste` 的 BC 地图数据串的可视化编辑器。**纯本地逻辑**，无需读实机、无需 mod。

> 适用游戏：Bondage Club（BC）。地图数据与游戏内 `/mappaste` 完全兼容。

## 核心机制（已对照 BC 源码 `ChatRoomMapView.js` 验证）
- 地图 = 40×40 网格，两层：**Tiles**（地面/墙体）与 **Objects**（门/钥匙/障碍/装饰/标记）。
- 每层是一个 1600 字符的字符串：`index = X + Y*40`，每字符 `String.fromCharCode(部件ID)`。
- 空白格 = ID 100（在 Tiles 层是 OakWood 地板，在 Objects 层是 Blank 装饰）。
- mappaste 串格式：`LZString.compressToBase64(JSON.stringify({ Type, Tiles, Objects, Fog }))`。
- **门控通行**：源码 `ChatRoomMapViewPositionIsBlocked`（1174–1179 行）先查 object 的 `CanEnter` 再查 tile。所以把 `WallPath` 门（如 WoodLockedGold 4015）放在墙瓦片上，门的开/锁判定覆盖底层墙——密室逃脱的钥匙门**零 mod** 即可做。
- 原生钥匙：`KeyBronze/Silver/Gold`(160/162/164) 拾取写入 `HasKeyX`，对应 `WoodLocked*/MetalLocked*` 门读该标志放行。
- **边界**：灯光/染色效果（Effects ID 10–17）不在 mappaste 串内（legacy 可省），编辑器已显式排除并提示。

## 功能
- 左：部件面板——「地板/墙体层」与「物件层」切换，支持搜索、分类、选中高亮。
- 中：40×40 网格画布——左键画、右键擦（当前层）、拖动连续刷。
- 右：mappaste 数据串文本框，支持「生成代码」「导出文件」「导入文件」，以及直接粘贴自动识别。
- **多语言**：简体中文 / 繁體中文 / English / Deutsch / Français / Русский / Українська / 自动（跟随浏览器），选择记忆在 `localStorage`。
- **画布平移**：放大后按住 **空格 + 左键拖拽** 或 **鼠标中键拖拽** 平移地图。
- **深色主题** + 自定义滚动条 + 入场/交互动画。

## 目录结构
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
`index.html` 与 `assets/` 必须留在仓库根目录：两者路径互相引用，也是 GitHub Pages 的部署入口。其余原始文件放进 `src/`、`scripts/`、`tests/`、`examples/`，不影响 `npm run build` / `npm test` 的运作。

## 用法
1. 浏览器打开 `index.html`（或访问部署的 GitHub Pages 地址）。
2. 选「地板/墙体层」先用墙（Wall）画房间轮廓；切「物件层」放门（Door）/钥匙（Key）/障碍（Obstacle）/标记（Marker）。
3. 左键画、右键擦（擦当前层）、可在格子上拖动连续刷；放大后空格/中键拖拽平移。
4. 点「生成代码」→「复制」，进游戏聊天框输入 `/mappaste <串>` 铺设。
5. 反向：把已有串贴进下方文本框（自动识别）即可在编辑器里继续改；或点「导入文件」载入本地 `.txt`。

## 开发 / 验证
```bash
npm install          # 装 jsdom（仅测试需要）
npm run build        # 重建 index.html（src/ → 根目录 index.html）
npm test             # jsdom 冒烟测试
npm run example      # 跑 examples/example.js
```
- `node examples/example.js`：示例地图 encode→decode 往返，长度 1600、ID 合法、重编码稳定 ✅
- jsdom 冒烟测试 `index.html`：1600 格渲染、53+225 部件面板、示例→导出产出有效串、door 落位正确、多语言切换、铺地板、**0 个 JS 错误** ✅
- 真机铺设效果待用户在游戏内 `/mappaste` 实测确认。

## 许可
本编辑器为独立工具，部件名/图片来自 Bondage Club 游戏资源，仅供该游戏社区内使用。
