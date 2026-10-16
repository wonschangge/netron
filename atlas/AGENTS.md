# AGENTS.md — ONNX Operator Atlas

面向在本目录继续工作的 AI agent / 开发者的交接文档。
记录**为什么这样做**、**哪些坑已经踩过**、**怎么验证没有改坏**。

---

## 0. 最高优先级约束

> **本目录现在是 Netron 仓库的一部分，`atlas/` 之外的 Netron 文件保持上游原样。**

历史状态已作废：早期规则是"绝对不要修改 `../netron` 仓库"，工具放在仓库外面。
现在反过来——atlas 已并入 Netron（fork），并被接进 `build web`。
所以：

1. **改动只允许落在 `atlas/`、`package.js`（只加 `case 'atlas'` 与 `build('web')` 末尾那行调用）、
   `eslint.config.js`（只加 `atlas/**` 忽略）、`.gitignore`、`.github/workflows/pages.yml`、
   以及 README 的 "Fork additions" 一节。** 其他 Netron 文件不要动，越少碰越容易跟上游合并。
2. **`atlas/**` 被 eslint 忽略是有意的**：这些是经典 `<script>`（不是 ES module），
   与 Netron 的 lint 配置（`sourceType: 'module'`）不兼容。不要"修好"它、不要加 eslint 指令注释。
3. **`atlas/data/` 与 `atlas/onnx-operator-atlas.html` 是生成物，不提交**（见 `.gitignore`），
   由 `node package.js build web` → `atlas/build.js` 在构建时生成。
4. 上游 `source/onnx-metadata.json` 更新后，**必须重新基线化 `verify.js` 顶部的 `SNAPSHOT`**
   （见第 8 节），否则回归检查会因为旧数字而红。

改数据来源时只做一件事：重新跑构建读上游 JSON，见第 3 节。

---

## 1. 这是什么

把 Netron 的 `source/onnx-metadata.json`（ONNX 算子规格元数据）变成可交互图形的静态页面。
两个产物，同一份源码：

```
dist/web/atlas/index.html               ← 多文件版本（随 Netron 站点发布，/atlas/）
dist/web/atlas/onnx-operator-atlas.html ← 单文件版本，约 4.9 MB，双击即用
./                                      ← 源文件（要改就改这里）
```

线上地址：<https://wonschangge.github.io/netron/atlas/>

---

## 2. 常用命令

```bash
node build-data.js    # ../source/onnx-metadata.json -> data/onnx-metadata.js
node bundle.js        # 内联所有资源 -> ./onnx-operator-atlas.html
node build.js         # 上面两步 + 拷贝到 ../dist/web/atlas（`npm run atlas`）
node verify.js        # 23 项回归检查（纯 node + headless Chrome）
node build-data.js && node bundle.js && node verify.js   # 改完必跑

cd .. && node package.js build web    # 整站构建（含 atlas），输出 dist/web
METADATA=/path/to/onnx-metadata.json node build-data.js  # 读别的副本
python3 -m http.server 8080                              # 开发时看源目录
```

`verify.js` 接受可选参数：`node verify.js index.html` 检查多文件版本而不检查 bundle。

---

## 3. 数据结构（已核实的事实，别再重新推导）

`source/onnx-metadata.json` 是一个**扁平数组**，每个元素是一条「算子 × 版本」记录。

### 规模

| 指标 | 值 |
| --- | --- |
| 记录数 | **872** |
| 算子数（`module/name` 组合） | **406** |
| 不同算子名 | **368** |
| 跨 domain 重名的名字 | **31** |
| domain 数 | **7** |
| 类型字符串种类 | **126** → 拆包装后 **30** 种基础类型 |
| 带 `status: "experimental"` 的记录 | 6 |

### 每个 domain（记录数 / 算子数 / 最高版本）

| domain | records | operators | max version |
| --- | --- | --- | --- |
| `ai.onnx` | 657 | 219 | 28 |
| `com.microsoft` | 136 | 136 | 1 |
| `com.ms.internal.nhwc` | 41 | 19 | 20 |
| `ai.onnx.ml` | 25 | 19 | 5 |
| `com.microsoft.nchwc` | 8 | 8 | 1 |
| `ai.onnx.preview.training` | 4 | 4 | 1 |
| `ai.onnx.preview` | 1 | 1 | 1 |

### 记录字段

```
name, module, version, description,
attributes[], inputs[], min_input, max_input, outputs[], min_output, max_output,
type_constraints[], examples[], inputs_range, outputs_range, category, status
```

- `attributes[]` → `{ name, type, required, description, default }`
  `type` 取值：`DataType, float32, float32[], graph, int64, int64[], sparse_tensor, string, string[], tensor, type_proto`
- `inputs[]` / `outputs[]` → `{ name, type, description, list, option }`
  `list: true` 表示 variadic，`option` 表示可选
- `examples[]` → `{ summary, code }`（Python 参考代码）
- `type_constraints[]` → `{ description, type_param_str, allowed_type_strs[] }`
- `category` 是 **Netron 自己的标注，覆盖极低**：只有 89/406 个算子、260/872 条记录有。
  这就是树状图**不按 category 分组/着色**的原因。

### 陷阱（每一条都真实咬过人）

1. **arity 字段是单数**：`min_input` / `max_input` / `min_output` / `max_output`。
   写成 `min_inputs` 会静默得到 `undefined`，界面上显示成 "arity undefined"。
   相关代码集中在 `js/model.js` 的 `arity()`、`js/detail.js` 的 `ioCard()`、`js/compare.js` 的 `ioList()`，
   三处都用 `side === 'inputs' ? 'input' : 'output'` 做映射。`verify.js` 有专门的回归断言。
2. **无上界用哨兵值**：`max_input === 2147483647` 表示 ∞。用 `Atlas.misc.UNBOUNDED`（1000000）
   做阈值判断，用 `Atlas.format.rangeLabel()` 渲染。
3. **`inputs_range` / `outputs_range` 里是 HTML 实体**（如 `&#8734;`），不是纯文本。当前 UI 不使用
   这两个字段，改用 min/max 自己渲染，就是为了避开这个坑。
4. **算子身份必须用 `module/name`**：31 个名字跨 domain 重名（`Conv` 同时存在于 `ai.onnx`、
   `com.microsoft.nchwc`、`com.ms.internal.nhwc`）。任何以 `name` 为 key 的索引都是错的。
5. **opset 版本号是 per-domain 的**：`com.microsoft` 从 1 独立计数，`com.ms.internal.nhwc` 到 20。
   把 7 个 domain 混在一张"opset 时间轴"上会误导，所以演进图必须带 domain 切换。
6. **类型字符串是嵌套的**：`optional(seq(tensor(float8e4m3fn)))`。
   用 `Atlas.color.parseType()` 拆成 `{ base: [...], structures: [...] }`。
   `map(int64, float)` 没有 `tensor()` 包装，`parseType` 里有专门的回退分支。

### 可用于回归的锚点

这些数字集中在 `verify.js` 顶部的 `SNAPSHOT`，两段检查共用；上游数据一变就改那一处。

- opset 1 时存在的算子：**291**（`ai.onnx` 114 + `com.microsoft` 136 + `ai.onnx.ml` 18
  + `com.ms.internal.nhwc` 10 + `com.microsoft.nchwc` 8 + training 4 + preview 1）
- `ai.onnx/Conv` 版本：**1, 11, 22**
- `ai.onnx/MaxPool` 版本：**1, 8, 10, 11, 12, 22**（6 个）
- 最新 opset 下 Matrix 规模：**406 × 31**（30 个类型列 + 1 个算子列），**2933** 个命中格
- `com.microsoft` 单 domain 筛选后的树状图 tile 数：**136**

---

## 4. 架构

### 关键决定：经典 script，不是 ES module

`index.html` 用普通 `<script src>`，全部挂在 `globalThis.Atlas` 上。
**不要改成 `type="module"`**：ES module 在 `file://` 下会被 CORS 拦掉，而"双击就能打开"是硬需求。
同理数据不用 `fetch()`，而是由 `build-data.js` 生成 `globalThis.ONNX_METADATA = [...]`。

### 脚本加载顺序（有依赖，别乱调）

```
util → ui → treemap → model → overview → detail → matrix → compare → catalog → app
```

`app.js` 在末尾立即 `boot()`（DOM 已就绪）。视图函数在 `render()` 里**运行时**才从
`Atlas.viewXxx` 取，所以文件之间的循环引用不会出问题。

### `globalThis.Atlas` 命名空间

| 成员 | 作用 |
| --- | --- |
| `Atlas.dom` | `create/svg/clear/append`（`create` 支持 `text`/`html`/`class`/`on*` 简写） |
| `Atlas.format` | `integer/escapeHtml/rangeLabel/plural` |
| `Atlas.color` | `DOMAIN_COLORS/DOMAIN_LABELS/CATEGORY_COLORS/DTYPE_FAMILIES/dtypeFamily/parseType` |
| `Atlas.misc` | `debounce/download/UNBOUNDED` |
| `Atlas.ui` | `badge/card/section/chipRow/dtypeTag/codeBlock/emptyState/kv/formatDoc/highlightPython` |
| `Atlas.tooltip` | `show/move/hide/attach(node, htmlOrFn)` |
| `Atlas.layoutTreemap` | squarified treemap 布局 |
| `Atlas.Model` | 建索引 + diff 引擎 |
| `Atlas.viewOverview/viewDetail/viewMatrix/viewCompare` | 四个视图，签名统一 `(root, app)` |
| `Atlas.renderCatalog` | 渲染侧栏 |
| `Atlas.app` | 应用单例：`model/state/filtered()/select()/set()` |

### 文件职责

| 文件 | 职责 |
| --- | --- |
| `js/util.js` | DOM/格式化/配色/类型解析，无依赖 |
| `js/ui.js` | tooltip、badge、轻量 markdown（`formatDoc`）、Python 高亮 |
| `js/treemap.js` | squarified 布局，纯函数，可被 node 直接加载测试 |
| `js/model.js` | 建索引（算子、timeline、dtype 集合）+ `diff(from, to)` |
| `js/app.js` | state、URL 路由、视图注册、顶栏 |
| `js/catalog.js` | 侧栏筛选 + 算子列表 |
| `js/overview.js` | 视图 1：统计卡、演进图、树状图、属性/类型条形图、同名跨域 |
| `js/detail.js` | 视图 2：version ladder、diff 卡、签名、类型演化矩阵、属性表、示例 |
| `js/matrix.js` | 视图 3：算子 × 元素类型热力矩阵 |
| `js/compare.js` | 视图 4：两版本并排 diff |

---

## 5. Target opset 语义（最容易写错的地方）

右上角 Target opset 是"把整个 UI 钉在某个时间点"，**不是**只影响一个视图。
唯一入口是 `app.js` 上的四个方法，视图一律通过它们取数据：

```js
app.opset()          // state.opset || model.latestOpset
app.revisions(op)    // 版本号 <= opset 的 records
app.effective(op)    // 该时间点的 schema（model.effective 会兜底到 first，所以调用前要先过滤）
app.dtypes(op)       // 该时间点支持的 基础元素类型 集合
```

- `app.filtered()` 会**排除** `operator.first.version > opset` 的算子。这是"291"这个数字的来源。
- 视图里**不要**直接用 `operator.latest` / `operator.dtypes` / `operator.records.length`——
  它们都是"全历史"视图，会在 Target 生效时给出不一致的数字。用 `app.effective()` / `app.dtypes()` /
  `app.revisions().length`。
- `app.selectedRecord()` 在显式选中的版本高于 Target 时，会回落到 Target 的 schema。

---

## 6. URL 路由

状态写在 hash：`#view=matrix&op=ai.onnx%2FMaxPool@12&opset=17&domain=…&metric=…&color=…&q=…`

- 写：`writeHash()` 用 `history.replaceState`——**不触发** `hashchange`/`popstate`，所以没有回环。
- 读：`parseHash()`。**它会先把所有 hash 承载的字段重置为默认值再解析。**
  这一点很重要：从 `#opset=1` 导航到 `#view=matrix` 必须清掉 opset，而不是继承旧状态。
- 监听：`popstate`（历史前进后退）**和** `hashchange`（同文档内改 fragment / 点链接）都要监听。
  只监听 `popstate` 曾导致同文档 hash 导航不生效。

新增一个 hash 承载的字段时，三处都要改：`state` 初值、`parseHash` 的重置列表与读取、`writeHash` 的写入。

---

## 7. 已知踩过的坑（别再犯）

### 7.1 squarified treemap 的方向搞反 → 满屏细条

`worstRatio` 里的 `side` 是**条带长度**，也就是 `min(w, h)`；`placeRow` 必须沿着**同一个**边铺。

- 矩形是横向的（`w >= h`）→ 短边是高 → 铺一条**竖直**的列，宽 `sum/h`，元素从上往下堆。
- 矩形是纵向的（`w < h`）→ 短边是宽 → 铺一条**水平**的带，高 `sum/w`，元素从左往右排。

最初写成了反的，结果每个"行"只放一个元素，整张图变成几百条 2px 细条。
`verify.js` 的 `layout` 段专门守这个：铺满率必须 ≈ 1.0000、不能有负矩形、最小边 > 5px。

### 7.2 别用肉眼判断树状图"有大片空白"

深色小方块在深色背景上看起来像空洞。判断布局对不对要用几何方法，不要靠截图：
把每个 tile 的矩形栅格化到一张网格上统计覆盖率。
实测 406 个 tile 铺满 100% 容器，所谓"空白"其实是 `#64748b` 的低透明度填充。
`verify.js` 的 `layout` 段就是这么做的。

### 7.3 `min_inputs` vs `min_input`

见 3.陷阱.1。第一次实现时 detail / compare / model 三处全错，界面显示 "arity undefined"。

### 7.4 Target opset 曾经只管 Matrix

一开始只有矩阵读了 opset，导致统计卡、树状图、侧栏列表仍显示全历史数字，自相矛盾。
现在统一走 `app.opset()/effective()/dtypes()/revisions()`。

### 7.5 树状图不要按 category 分组

category 只覆盖 89/406 个算子，按它分组会让 317 个算子挤进一个 "Other" 巨块，完全没信息量。
现在**按 domain 分组**（7 组，大小有区分度），**颜色默认按改版次数**（churn）着色——
这既是这份数据最有价值的信号，也让配色天然分层（灰 1 次 → 蓝 2–3 → 青 4–6 → 黄 7–9 → 红 10+）。
颜色方案可通过 `state.treemapColor` 切成 `dtypes` / `domain` / `category`。

### 7.6 颜色只覆盖到最新版本会被 Target opset 打脸

`dtypeClass()` 之类的颜色/尺寸计算必须基于 `app.effective(op)`，否则在 opset 1 下会按最新
schema 上色。

---

## 8. 验证

```bash
node verify.js
```

三段，共 23 项：

1. **layout（纯 node）** —— 直接 `new Function()` 加载 `js/util.js` + `js/treemap.js`（它们是经典脚本，
   不能用 `import`）。检查铺满率、负矩形、细条。
2. **dataset（纯 node）** —— 读 `../source/onnx-metadata.json`，核对 `SNAPSHOT`
   （872/406/291）、arity 字段齐全、MaxPool 版本列表。
3. **browser（headless Chrome）** —— 打开构建产物，检查启动无报错、四个视图渲染、
   bundle 零外部引用、Target opset 生效、筛选联动、空状态。

两段检查共用 `verify.js` 顶部的 `SNAPSHOT`：上游元数据一更新，`dataset` 段会先红，
提醒你把 `SNAPSHOT` 改成新数字（`node build-data.js` 会把 totals 打出来），
`browser` 段的期望值随之自动跟上。

### Playwright 的坑

`playwright-core` **不是本项目的依赖**（上游 netron 的 `node_modules` 是空的）。
`verify.js` 会按顺序搜索：`PLAYWRIGHT_CORE` 环境变量 → 本地 `playwright-core` →
`~/.npm/_npx/*/node_modules/playwright-core` → `~/.cache/codex-runtimes/*/dependencies/node/node_modules/playwright-core`
→ `~/.bun/install/cache/playwright-core/*`。

**必须用系统 Chrome**：`executablePath: '/usr/bin/google-chrome'` + `args: ['--no-sandbox']`。
Playwright 自带的浏览器缓存版本经常和已安装的 playwright 对不上
（例如缓存里只有 `chromium-1228`，而 playwright 1.63 想要 `chromium_headless_shell-1243`）。
`resolveChrome()` 会探测常见路径，也可用 `CHROME_PATH` 覆盖。

找不到时 `verify.js` 会打印 `skip` 而不是失败——但**别把 skip 当通过**。

### 视觉检查

用 Playwright 截图然后直接看图（`page.screenshot` + 读图），
需要看清局部时用 `deviceScaleFactor: 2` 并对元素截图（`elementHandle.screenshot()`），
比截整页再放大清楚得多。

---

## 9. 设计取舍（为什么是这四张图）

数据的本质是三个正交维度：**算子 × 版本时间轴 × 类型约束**。平铺 JSON 把三者压扁了，
所以每个视图负责一个切面：

| 视图 | 回答 | 图形手法 |
| --- | --- | --- |
| Overview | spec 的整体形状 | 演进时间轴（堆叠柱 + 累计折线）、树状图、属性/类型条形图、同名跨域对照 |
| Operator | 这个算子怎么演进的 | version ladder（横轴是真实 opset 坐标，非等距）、逐区间 diff 卡、类型支持演化热力矩阵 |
| Matrix | 谁能吃哪些 dtype | 406×30 热力矩阵，列按类型族着色 |
| Compare | 两个版本差在哪 | 并排渲染 + 增删高亮 |

其他刻意的决定：

- **版本阶梯用真实坐标而非等距**：`Conv` 的 1→11→22 和 `MaxPool` 的密集改版，
  用等距排列会丢掉"改动是集中还是分散"这个信息。
- **diff 引擎按语义分类**（`+attr` / `−attr` / `~attr` / `inputs` / `outputs` / `±dtype` / `doc`），
  不是文本 diff。`~attr` 在 `Conv` v1→v11 上会命中 3 条"description updated"——这是对的，不是 bug
  （曾经误读成属性被删除）。
- **深色主题**：树状图/矩阵这类大面积色块在深色背景上对比度更好。
- **类型族配色固定在 `Atlas.color.DTYPE_FAMILIES`**：新增类型会自动落到 `other` 族，
  但常见的低精度类型（`float8*`、`int4` 等）需要补进 `LOW_PRECISION` 列表才会被算作 "Low precision"。

---

## 10. 局限与可做的下一步

- `data/onnx-metadata.js`（4.7 MB）与 `onnx-operator-atlas.html`（4.9 MB）都是生成物，
  **不提交**（`.gitignore` 已覆盖），由 `node package.js build web` 现算现用。
- 没有跨算子的"相似度/聚类"视图。可考虑按共享属性名或类型签名做力导向图，
  但目前数据里没有算子间的显式边，容易做成噪声。
- 树状图在 406 个 tile 时只有约 46 个能显示标签，其余靠悬停。
  若要更可读需要分层下钻（先 domain，再 category，再算子）。
- 矩阵没有"导出 CSV"。
- 未处理 `inputs_range` / `outputs_range`（见 3.陷阱.3）。
- 无 i18n：界面是英文，文档是中文。

---

## 11. 与 Netron 的集成方式（fork 特有）

```
source/onnx-metadata.json ──build-data.js──> atlas/data/onnx-metadata.js
                                             │
                                     bundle.js ──> atlas/onnx-operator-atlas.html
                                             │
                     atlas/build.js ─────────┴──> dist/web/atlas/{index.html,styles.css,js/,data/,onnx-operator-atlas.html}
```

- 入口：`node package.js build web`（`npm run build web`）→ `case 'web'` 末尾调用 `build('atlas')`
  → `node atlas/build.js`。单跑 atlas 用 `npm run atlas` / `node package.js build atlas`。
- 发布：`.github/workflows/pages.yml` 在 push 到 `main` 时构建 `dist/web` 并用
  `actions/deploy-pages` 发布到 GitHub Pages（fork 的 Pages，source = workflow）。
  线上 = `https://wonschangge.github.io/netron/`，atlas 在 `/atlas/`。
- 上游自带的 `npm run publish web`（推 `gh-pages` 分支）**没有**被改动，但它与本 workflow 是两套
  发布路径，同时用会互相覆盖；fork 里以 workflow 为准。
- 与 Netron UI 的耦合：**零**。netron 页面不链接 atlas、atlas 不链接 netron，两边互不依赖，
  唯一的共享物是 `source/onnx-metadata.json`。想在应用内跳转需要另做（见第 0 节第 1 条）。
