# 《四季三餐·好好吃饭》微信小程序 V2.03 技术设计方案 (Technical Design)

> **文档版本**：V2.03  
> **文档归档**：`docs/technical-design.md`  
> **更新时间**：2026-09-26  
> **核心原则**：轻量原生、零独立服务器运维、数据驱动、算法与 UI 彻底解耦、本地+云开发双层支持。

---

## 一、 系统技术架构与选型

### 1.1 技术架构全景图

```
┌─────────────────────────────────────────────────────────────────┐
│                    微信小程序前端 (Native + TypeScript)          │
├─────────────────┬───────────────────┬───────────────────────────┤
│  Pages (视图层) │ Components (组件) │ Services (核心业务逻辑层) │
│  • 首页/点菜    │ • 菜品卡片 (锁/换)│ • 推荐引擎 (核心打分算法) │
│  • 菜单结果     │ • 时令食材标签    │ • 历史与防重记录器        │
│  • 采购清单     │ • 分类与快捷筛选  │ • 采购清单聚合器          │
│  • 菜库与偏好   │ • 便签复制弹窗    │ • 本地/云端存储适配器     │
└────────┬────────┴───────────────────┴─────────────┬─────────────┘
         │                                          │
         ▼                                          ▼
┌───────────────────┐                      ┌──────────────────────┐
│ 本地缓存 (Storage)│                      │ 微信云开发 (CloudBase│
│ • 预置静态菜品库  │                      │ • 云数据库 (JSON Doc)│
│ • 本地用户偏好    │                      │ • 云函数 (同步/备份) │
│ • 离线 30 天历史  │                      │ • 微信原生免密 OpenID│
└───────────────────┘                      └──────────────────────┘
```

### 1.2 技术选型决策与理由
1. **开发框架**：**微信小程序原生 + TypeScript**
   - **理由**：微信官方原生支持最稳定，零额外打包构建开销；小程序体积小、启动快；类型提示完备，便于长期重构与维护。
2. **后端与数据持久化**：**微信云开发 (CloudBase) + 本地 Storage 降级容灾**
   - **理由**：
     - 免自建服务器、免购买公网 IP、免备案域名与 SSL 证书配置；
     - 原生支持微信用户登录体系，天然自带 `_openid` 权限隔离；
     - 冷启动期间可将预置菜品数据直接存为本地 JSON，即便弱网/无网环境下也能 100% 毫秒级生成菜单，再异步向云数据库同步。

---

## 二、 工程目录结构设计

```text
├── docs/                       # 架构、需求与开发规划文档
│   ├── product-plan.md         # 产品规划与需求规格
│   ├── technical-design.md     # 技术设计方案 (本文档)
│   └── development-plan.md     # 阶段实施与里程碑路线
├── miniprogram/                # 小程序主体工程
│   ├── app.ts                  # 小程序入口逻辑 (初始化云环境)
│   ├── app.json                # 全局页面路由与 TabBar 配置
│   ├── app.wxss                # 全局温暖生活风格样式表 (主题色变量)
│   ├── pages/                  # 业务页面目录
│   │   ├── index/              # 首页 (时令展示、模式切换、触发点菜)
│   │   ├── menu/               # 菜单结果页 & 采购单页
│   │   │   ├── result/         # 今日菜单组合展示、锁定、单菜换一换
│   │   │   └── shopping/       # 采购清单合并展示、复制给大厨
│   │   ├── dishes/             # 菜库浏览、搜索、筛选
│   │   ├── history/            # 吃饭历史记录
│   │   └── mine/               # 口味偏好与设置
│   ├── components/             # 公共可复用 UI 组件
│   │   ├── dish-card/          # 单道菜品卡片 (含锁定锁头、换一换动效)
│   │   ├── season-badge/       # 时令/当季指示胶囊标签
│   │   └── meal-type-tag/      # 主荤/副荤/素菜/汤 属性标签
│   ├── services/               # 纯核心逻辑层 (独立于任何页面)
│   │   ├── menuRecommendation.ts # 核心推荐算法引擎
│   │   ├── shoppingListService.ts# 食材合并与采购单聚合服务
│   │   ├── historyService.ts   # 历史去重与历史记录维护服务
│   │   ├── preferenceService.ts# 用户偏好存取服务
│   │   └── dataProvider.ts     # 数据提供层 (本地静态 + 云端适配)
│   ├── types/                  # 全局 TypeScript 接口类型定义
│   │   ├── dish.ts             # 菜品与分类定义
│   │   ├── ingredient.ts       # 食材与时令定义
│   │   ├── menu.ts             # 菜单与餐桌组合定义
│   │   └── user.ts             # 用户与偏好设置定义
│   └── data/                   # 预置高质量初始数据集 (解耦维护)
│       ├── dishes.json         # 150~200 道初始家常菜品数据库
│       ├── ingredients.json    # 川渝 12 个月时令食材索引库
│       └── seasons.json        # 24节气与月份推荐映射
├── cloudfunctions/             # 微信云函数目录 (后续接入)
│   ├── syncHistory/            # 历史记录同步云函数
│   └── updateDishes/           # 菜品库批量维护云函数
└── project.config.json         # 微信开发者工具配置
```

---

## 三、 TypeScript 核心类型定义 (Type Interfaces)

### 3.1 菜品定义 (`types/dish.ts`)
```typescript
/** 菜品分类枚举 */
export type DishCategory = 
  | 'main_meat'       // 主荤 (大肉/排骨/整鸡/大鱼等)
  | 'secondary_meat'  // 副荤/小荤 (肉丝/肉沫/鸡丁等半荤半素)
  | 'egg'             // 蛋类 (番茄炒蛋/蒸水蛋等)
  | 'tofu'            // 豆制品 (家常豆腐/麻婆豆腐等)
  | 'vegetable'       // 素菜 (绿叶蔬菜/瓜类/菌菇/根茎)
  | 'soup';           // 汤类 (排骨汤/圆子汤/青菜钵等)

/** 烹饪方式枚举 */
export type CookingMethod = 
  | 'stir_fry'        // 炒 / 爆炒
  | 'clear_fry'       // 清炒
  | 'braise'          // 红烧 / 酱烧
  | 'stew'            // 炖 / 煨
  | 'steam'           // 蒸
  | 'boil_soup';      // 煮汤 / 滚汤

/** 菜品主料辅料结构 */
export interface RecipeIngredient {
  name: string;       // 食材标准化名称，如 "猪里脊"
  amount: number;     // 2人份基准数值，如 200
  unit: string;       // 计量单位，如 "g", "个", "根", "适量"
  isMain: boolean;    // 是否为核心主要食材
}

/** 完整菜品结构 */
export interface Dish {
  id: string;                    // 唯一标识
  name: string;                  // 菜名，如 "青椒肉丝"
  category: DishCategory;        // 分类
  cookingMethod: CookingMethod;  // 烹饪方式
  taste: string[];               // 口味标签: ["微辣", "下饭", "咸鲜"]
  spicyLevel: 0 | 1 | 2 | 3;     // 辣度: 0-不辣, 1-微辣, 2-中辣, 3-重辣
  
  ingredients: RecipeIngredient[];// 配方食材明细
  mainIngredient: string;        // 核心主食材 (用于防重复计算，如 "猪肉")
  
  bestMonths: number[];          // 最佳月份 (1-12)
  availableMonths: number[];     // 正常应季/常见月份 (1-12)
  regions: string[];             // 适用地区: ["川渝", "全国"]
  
  cookingTimeMinutes: number;    // 制作耗时 (分钟)
  difficulty: 1 | 2 | 3;         // 难度等级: 1-快手, 2-一般, 3-功夫菜
  estimatedCostLevel: 1 | 2 | 3; // 预算成本等级: 1-经济, 2-适中, 3-较高
  
  recommendedForTwo: boolean;    // 是否适合 2 人分量 (V1 为 true)
  tags: string[];                // 标签: ["快手", "当季推荐", "大厨拿手"]
  enabled: boolean;              // 是否启用状态
}
```

### 3.2 时令食材定义 (`types/ingredient.ts`)
```typescript
export interface SeasonalIngredient {
  id: string;
  name: string;                  // 食材名称，如 "莲藕"
  category: 'leaf' | 'melon' | 'root' | 'fungus' | 'meat' | 'aquatic';
  bestMonths: number[];          // 最佳品尝月，如 [9, 10, 11, 12]
  availableMonths: number[];     // 常见月
  regions: string[];             // ["川渝", "全国"]
  seasonWeight: number;          // 时令推荐系数 (1.0 ~ 1.5)
  description?: string;          // 时令说明 (如 "秋季莲藕脆甜粉糯")
}
```

### 3.3 餐桌与菜单组合定义 (`types/menu.ts`)
```typescript
/** 餐桌模式 */
export type MealMode = 'routine_2_1' | 'hearty_3_1'; // 2菜1汤 vs 3菜1汤

/** 槽位菜品包装 (支持锁定机制) */
export interface TableSlot {
  slotIndex: number;             // 槽位序号 (0, 1, 2, 3)
  slotRole: 'main_meat' | 'sub_meat_or_tofu' | 'vegetable' | 'soup';
  dish: Dish;                    // 对应菜品
  isLocked: boolean;             // 是否被锁定
}

/** 完整生成的餐桌菜单 */
export interface TableMenu {
  id: string;
  mode: MealMode;
  date: string;                  // "YYYY-MM-DD"
  month: number;
  slots: TableSlot[];            // 菜品槽位列表
  totalTimeMinutes: number;      // 预估烹饪时间
  createdAt: number;
}
```

---

## 四、 数据库 Schema 设计 (CloudBase Collections)

### 4.1 集合清单
1. **`dishes`**：菜品库（云端权威数据源，只读/管理员可写）。
2. **`ingredients`**：时令食材字典库。
3. **`users`**：用户基本信息（微信 OpenID、昵称、注册时间）。
4. **`preferences`**：用户口味、辣度、忌口与默认设置。
5. **`meal_history`**：用户正式确认开饭的就餐历史。
6. **`favorites`**：用户收藏菜品。

### 4.2 核心集合字段规格

#### `preferences` 集合
```json
{
  "_id": "pref_openid_xxxx",
  "_openid": "wx_openid_12345",
  "peopleCount": 2,
  "defaultMealMode": "hearty_3_1",
  "spicyLevel": 1,
  "dislikedIngredients": ["香菜", "羊肉", "苦瓜", "内脏"],
  "favoriteCategories": ["main_meat", "vegetable"],
  "blockedDishIds": ["dish_089"],
  "region": "川渝",
  "updatedAt": 1727236800000
}
```

#### `meal_history` 集合
```json
{
  "_id": "hist_20260925_xxxx",
  "_openid": "wx_openid_12345",
  "date": "2026-09-25",
  "dishIds": ["dish_001", "dish_015", "dish_042", "dish_078"],
  "mealMode": "hearty_3_1",
  "createdAt": 1727236800000
}
```

---

## 五、 推荐算法引擎架构设计 (`menuRecommendation.ts`)

```
                  ┌──────────────────────┐
                  │ 菜品全库 (200道家常菜) │
                  └──────────┬───────────┘
                             │
                             ▼
         [ 阶段一：硬过滤管道 (Hard Filter Pipeline) ]
         • 排除启用状态为 false 的菜品
         • 排除用户黑名单 / 永不推荐菜 (blockedDishes)
         • 排除用户忌口食材 (dislikedIngredients)
         • 排除辣度超标菜 (spicyLevel > userMaxSpicy)
         • 仅保留适合 2 人份菜品 (recommendedForTwo == true)
                             │
                             ▼
         [ 阶段二：多维权重评分器 (Multi-Factor Scoring) ]
         • 时令得分 (Season Score): 最佳月 1.0 / 常见月 0.7 / 反季 0.3 (占比 30%)
         • 用户偏好 (Preference Score): 口味标签契合度 (占比 20%)
         • 历史去重 (History Recency Penalty): 
           - 3天内吃过: 系数 0.1 (严重降权)
           - 7天内吃过: 系数 0.4 (明显降权)
           - 14天内吃过: 系数 0.7 (轻度降权)
           - >14天: 系数 1.0 (正常) (占比 20%)
         • 收藏加权 (Favorite Boost): +5%
         • 制作难度与耗时平滑 (Difficulty & Time): 适中加权 (占比 10%)
                             │
                             ▼
         [ 阶段三：餐桌结构组合求解器 (Combination Solver) ]
         • 槽位分配：
           - 2菜1汤：[主荤/副荤] + [素菜/蛋/豆腐] + [汤]
           - 3菜1汤：[主荤] + [副荤/蛋/豆腐] + [素菜] + [汤]
         • 锁定保护：已锁定槽位原样保留
         • 主食材防重检查：同一主要食材 (如"猪肉") 全桌不得超过 2 次；主素菜主料不得重复
         • 烹饪方式均衡：避免全桌皆红烧或全桌皆油炸，保证清炒+炖/烧+汤的和谐搭配
                             │
                             ▼
                  ┌──────────────────────┐
                  │ 完美今日菜单 TableMenu│
                  └──────────────────────┘
```

### 5.1 时令匹配分计算公式
```typescript
function calculateSeasonScore(dish: Dish, currentMonth: number): number {
  if (dish.bestMonths.includes(currentMonth)) {
    return 1.0; // 当季黄金时期
  }
  if (dish.availableMonths.includes(currentMonth)) {
    return 0.7; // 正常上市供应期
  }
  return 0.3;   // 反季/非旺季 (降权但不彻底禁止，保证候选池充盈)
}
```

### 5.2 历史降权衰减系数公式
```typescript
function calculateHistoryPenalty(dishId: string, historyRecords: MealRecord[]): number {
  const daysDiff = getDaysSinceLastEaten(dishId, historyRecords);
  if (daysDiff === -1 || daysDiff > 14) return 1.0;  // 14天外或从未吃过，无惩罚
  if (daysDiff <= 3) return 0.1;                     // 3天内吃过，90% 降权
  if (daysDiff <= 7) return 0.4;                     // 7天内吃过，60% 降权
  return 0.7;                                        // 8-14天内吃过，30% 降权
}
```

### 5.3 综合得分计算
$$\text{TotalScore} = (S_{\text{season}} \times 0.30) + (S_{\text{pref}} \times 0.20) + (P_{\text{history}} \times 0.20) + (S_{\text{match}} \times 0.15) + (S_{\text{fav}} \times 0.05) + (S_{\text{cost}} \times 0.05) + (S_{\text{diff}} \times 0.05)$$

---

## 六、 采购清单合并服务设计 (`shoppingListService.ts`)

```typescript
export interface MergedIngredientItem {
  name: string;        // 食材标准名，如 "猪肉"
  displayAmount: string;// 展示文案，如 "约 350g" 或 "2 个"
  subNotes: string[];  // 来源菜品标注，如 ["青椒肉丝 200g", "芹菜肉丝 150g"]
}

export function aggregateShoppingList(dishes: Dish[]): MergedIngredientItem[] {
  // 1. 扁平化所有菜品的配料列表
  // 2. 根据食材别名与标准化字典归一 (如 "猪里脊" 与 "后腿肉" 均归到 "猪肉")
  // 3. 数值相加并格式化输出
  // 4. 生成适合微信粘贴的纯文本格式
}
```

---

## 七、 界面 UI 与视觉规范

- **基调**：简单、温暖、生活化、烟火气、干净舒服。
- **色彩体系**：
  - 主背景色：`#FAF8F5` (温润米白，护眼舒适)
  - 卡片底色：`#FFFFFF` (纯白圆角轻投影)
  - 核心主色：`#4A7C59` (青翠浅绿，代表新鲜时蔬与健康)
  - 暖调强调色：`#E88D38` (落日暖橙，用于点菜按钮与高亮行动点)
  - 辅助浅黄：`#F7E7CE` (用于节气与当季标签底色)
  - 主字色：`#2D312E` (深黛墨色，非生硬纯黑，阅读柔和)
- **字体与排版**：圆角卡片（`border-radius: 16rpx`），大触控热区（按钮高度 $\ge 88\text{rpx}$），拒绝拥挤与过度渐变。
