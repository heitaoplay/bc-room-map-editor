// Auto-label dictionary (Simplified Chinese; the build converts it to Traditional for the "tw" locale).
//
// Purpose: when BC adds a new part, nobody has to touch zh-labels.js for it to be usable.
// i18n.js resolves a label in this order (cn / tw):
//   1. exact translation in zh-labels.js            ("Floor:CheckerCarpetBlue" -> 蓝色格纹地毯)
//   2. composed from the tokens below               ("TileMagenta" -> 洋红色地砖)  — only if EVERY token is known
//   3. BC's own English name from MapData.js        ("Oak Planks")
//   4. the style id split into words                ("Checker Carpet Rainbow")
// Unknown words therefore never break anything, they just show in English until someone adds them here.
// Add words to WORDS / COLORS whenever convenient; it is optional polish, not a requirement.
window.MAP_ZH_COLORS = {
  White: "白色", Gray: "灰色", Grey: "灰色", Black: "黑色", Blue: "蓝色", Green: "绿色", Red: "红色",
  Orange: "橙色", Yellow: "黄色", Pink: "粉色", Purple: "紫色", Brown: "棕色", Teal: "青色",
  Cyan: "青色", Beige: "米色", Cream: "奶油色", Navy: "藏青色", Lime: "青柠色", Magenta: "洋红色",
  Maroon: "酒红色", Violet: "紫罗兰色", Turquoise: "绿松石色", Gold: "金色", Silver: "银色", Bronze: "铜色",
  Rainbow: "彩虹色", Tan: "黄褐色", Olive: "橄榄色", Lavender: "薰衣草色", Mint: "薄荷色", Peach: "桃色",
  Coral: "珊瑚色", Rose: "玫瑰色", Indigo: "靛蓝色", Ivory: "象牙色", Khaki: "卡其色", Crimson: "深红色",
};
window.MAP_ZH_MODIFIERS = { Light: "浅", Dark: "深", Bright: "亮", Pale: "淡", Deep: "深" };
window.MAP_ZH_WORDS = {
  // surfaces / materials
  Floor: "地板", Wall: "墙", Tile: "地砖", Tiles: "地砖", Carpet: "地毯", Checker: "格纹", Padded: "软垫",
  Latex: "乳胶", Slime: "史莱姆", Honey: "蜂蜜", Foam: "泡沫", Play: "游戏", Wood: "木", Wooden: "木制",
  Log: "圆木", Stone: "石", Brick: "砖", Metal: "金属", Steel: "钢", Iron: "铁", Glass: "玻璃", Marble: "大理石",
  Concrete: "水泥", Plank: "木板", Planks: "木板", Oak: "橡木", Pine: "松木", Maple: "枫木", Acacia: "金合欢木",
  Mahogany: "红木", Mangrove: "红树木", Cherry: "樱桃木", Bamboo: "竹", Tatami: "榻榻米", Hex: "六角",
  Square: "方格", Round: "圆形", Plain: "素色", Striped: "条纹", Dotted: "圆点", Fancy: "华丽", Royal: "皇家",
  Dungeon: "地牢", Japanese: "日式", Medieval: "中世纪", Modern: "现代", Old: "旧", New: "新",
  // nature / outdoor
  Grass: "草", Dirt: "泥土", Sand: "沙", Gravel: "碎石", Snow: "雪", Ice: "冰", Water: "水", Lava: "岩浆",
  Leaves: "落叶", Leaf: "叶", Tree: "树", Palm: "棕榈", Bush: "灌木", Flower: "花", Flowers: "花",
  Plant: "植物", Rock: "岩石", Rocks: "岩石", Mushroom: "蘑菇", Pumpkin: "南瓜", Cactus: "仙人掌",
  Fire: "火", Torch: "火把", Campfire: "营火", Tent: "帐篷", Lantern: "灯笼", Lamp: "灯", Candle: "蜡烛",
  Candelabra: "烛台", Spider: "蜘蛛", Web: "网", Cobweb: "蛛网",
  // furniture / props
  Chair: "椅子", Table: "桌子", Desk: "书桌", Bed: "床", Pillow: "枕头", Sofa: "沙发", Couch: "沙发",
  Bench: "长椅", Stool: "凳子", Throne: "王座", Shelf: "架子", Bookshelf: "书架", Wardrobe: "衣柜",
  Cabinet: "柜子", Locker: "储物柜", Mirror: "镜子", Window: "窗", Curtain: "窗帘", Rug: "地毯",
  Statue: "雕像", Barrel: "木桶", Box: "箱子", Crate: "板条箱", Chest: "宝箱", Fence: "栅栏",
  Barrier: "围栏", Rope: "绳", Cage: "笼子", Cell: "牢房", Chain: "锁链", Chains: "锁链", Bars: "栏杆",
  Pillar: "柱子", Column: "圆柱", Stairs: "楼梯", Ladder: "梯子", Bridge: "桥", Fountain: "喷泉",
  Toilet: "马桶", Shower: "淋浴", Bath: "浴缸", Sink: "水槽", Television: "电视", Fireplace: "壁炉",
  Piano: "钢琴", Pool: "水池", Balloon: "气球", Balloons: "气球", Cake: "蛋糕", Gift: "礼物", Present: "礼物",
  Sign: "告示牌", Banner: "旗帜", Flag: "旗帜", Key: "钥匙", Door: "门", Gate: "大门", Entry: "入口", Exit: "出口",
  Open: "打开", Closed: "关闭", Locked: "上锁", Unlocked: "未上锁", Up: "向上", Down: "向下",
  Left: "左", Right: "右", Front: "正面", Back: "背面", Side: "侧面", Top: "顶部", Bottom: "底部",
  Preview: "预览", Anim: "动画", Idle: "待机", Happy: "开心", Stand: "站立", Sit: "坐", Sleep: "睡觉",
  // animals
  Cat: "猫", Dog: "狗", Rabbit: "兔子", Chicken: "鸡", Horse: "马", Pig: "猪", Cow: "牛", Sheep: "羊",
  Fox: "狐狸", Wolf: "狼", Bear: "熊", Bird: "鸟", Fish: "鱼", Duck: "鸭", Pony: "小马", Unicorn: "独角兽",
  Caramel: "焦糖色",
  // misc
  Number: "数字", Letter: "字母", Icon: "图标", Arrow: "箭头", Heart: "爱心", Star: "星星", Skull: "骷髅",
  Lock: "锁", Conveyor: "传送带", Belt: "带", Fast: "快速", Slow: "慢速", Big: "大", Small: "小", Large: "大",
  Half: "半", Full: "完整", Dark: "深色", Light: "浅色", Blank: "空白",
};
// Display names for category groups created automatically for an unknown `Type` (see editor-ui.js).
window.MAP_ZH_TYPES = {
  Floor: "地板", FloorExterior: "室外地面", Wall: "墙壁", Water: "水域", WallPath: "门", WallDecoration: "墙面装饰",
  Banners: "旗帜", FloorObstacle: "障碍物", FloorDecoration: "地面装饰", FloorDecorationThemed: "主题装饰",
  FloorDecorationParty: "派对装饰", FloorDecorationCamping: "露营装饰", FloorDecorationExpanding: "组合家具",
  FloorDecorationAnimal: "动物", FloorFoamTiles: "泡沫地垫", FloorItem: "道具", FloorNumber: "数字标记",
  FloorLetter: "字母标记", FloorIcon: "图标标记", Functional: "功能物件", LivingRoom: "客厅", Bedroom: "卧室",
  Bathroom: "浴室", School: "学校", ABDL: "ABDL", Kitchen: "厨房", Office: "办公室", Garden: "花园",
  Dungeon: "地牢", Medieval: "中世纪", Halloween: "万圣节", Christmas: "圣诞节", Holiday: "节日",
};
