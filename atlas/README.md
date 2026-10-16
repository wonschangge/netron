# ONNX Operator Atlas

一个零依赖的交互式可视化工具，用来**看**和**探索** Netron 的 `source/onnx-metadata.json`。
它现在是本仓库（Netron fork）的一部分，随 `build web` 一起构建，并随 GitHub Pages 一起发布。

- 多文件版本（随站点发布）：<https://wonschangge.github.io/netron/atlas/>
- 单文件版本（同一个站点的静态文件，下载后可离线双击打开）：
  <https://wonschangge.github.io/netron/atlas/onnx-operator-atlas.html>

## 交付物

| 产物 | 说明 |
| --- | --- |
| `dist/web/atlas/index.html` | 多文件版本，随 Netron 站点发布在 `/atlas/` |
| `dist/web/atlas/onnx-operator-atlas.html` | 单个自包含 HTML（约 4.9 MB），数据、样式、脚本全部内联。双击即用，不需要服务器、不需要联网 |

两个文件都由 `node package.js build web`（构建期）生成，仓库里不提交。

## 这份数据是什么样的

`source/onnx-metadata.json` 是 872 条「算子 × 版本」记录：

| 维度 | 数值 |
| --- | --- |
| 记录数（算子 × 版本） | 872 |
| 算子（domain/name 组合） | 406 |
| 不同算子名 | 368（其中 31 个名字跨 domain 重名） |
| domain | 7（`ai.onnx`、`ai.onnx.ml`、`com.microsoft`、`com.microsoft.nchwc`、`com.ms.internal.nhwc`、`ai.onnx.preview`、`ai.onnx.preview.training`）|
| opset 版本范围 | 1 – 28 |
| 元素类型字符串 | 126 种（去掉 seq/optional/sparse/map 包装后 30 种基础类型）|

它是线性排列的，直接翻很难看出结构：某个算子是怎么演进的？哪些算子最常被改版？哪些算子只支持 float？
同一个名字在不同 domain 下差在哪？Atlas 把这些关系变成可交互的图形。

## 四个视图

### 1. Overview — 全局形状

- **Opset evolution**：横轴是 opset 版本，柱子分成「新增算子」（蓝）和「已有算子改版」（灰），
  绿线是累计活跃算子数。点击任意一年会展开该版本新增/改版的算子清单，可以直接跳转。
  注意 opset 编号是 per-domain 的，所以这张图带 domain 切换。
- **Operator landscape（树状图，squarified treemap）**：按 domain 分组，每块面积 = 该算子的属性数量
  （可切换成版本数 / 元素类型数 / 输入个数）。**颜色默认按「改版次数」着色**
  （灰 = 1 次，蓝 = 2–3，青 = 4–6，黄 = 7–9，红 = 10+），一眼能看出 spec 里哪些算子在剧烈变动。
  也可切换成按元素类型、domain、category 着色。点击任意方块进入算子详情。
- **Cross-cutting signals**：最常被复用的属性名（点击 = 交叉筛选到 Matrix）、各元素类型覆盖了多少算子。
- **Same name, different domain**：同名跨 domain 算子（例如 `Conv` 同时存在于 `ai.onnx`、
  `com.microsoft.nchwc`、`com.ms.internal.nhwc`），点击互相对照。

### 2. Operator — 单个算子的版本演进

- **Version ladder**：横轴是**真实 opset 坐标**（不是等距，所以能看出改版的疏密），每个节点是一个版本；
  节点之间的黄色徽章表示「相对上一个版本改了几处」，悬停看具体改动。
- **diff 卡片**：每个版本区间一张，列出 `+属性` / `−属性` / `~属性` / `inputs` / `outputs` / `±dtype` / `doc`。
- **Signature**：输入/输出槽位、variadic/optional 标记、arity 区间。
- **Element type coverage over time**：小热力矩阵，行是元素类型、列是版本；绿色描边 = 该版本新增支持，
  红色描边 = 该版本去掉支持。这是最直观的「类型支持是怎么长出来的」图。
- **Attributes** 表格（类型 / 默认值 / 说明）、**Reference example**（语法高亮的 Python 参考代码）。
- **Cross-domain twins**：同名算子在别的 domain 下的对照入口。

### 3. Matrix — 算子 × 元素类型

397 行 × 30 列热力矩阵：某算子在当前 Target opset 下是否支持某元素类型。列按类型族着色
（浮点 / 低精度 / 有符号 / 无符号 / bool / string / complex）。支持按覆盖度、版本数、domain 排序，
也可只显示侧栏已勾选的类型。点击单元格跳到该算子详情。

### 4. Compare — 任意两个版本并排 diff

左右各自选择版本，顶部列出所有 schema 级差异，下面并排渲染说明、输入、输出、类型约束、属性，
绿色高亮新增、红色高亮删除。

## 交互

- **搜索**（按 `/` 聚焦）：匹配算子名、domain、category、属性名和描述正文，作用于所有视图。
- **侧栏筛选**：domain / category / element type（多选），以及「多版本 / 有示例 / 有属性 / 跨 domain」。
- **Target opset**（右上角）：把每个算子固定在「不高于该 opset 的最新版本」。
  Matrix、树状图、统计数字、侧栏数量、详情默认版本都会跟着变（例如 opset 1 时只剩 282 个算子）。
- **URL 深链**：所有状态都写进 `#view=…&op=…&opset=…`，可以直接分享到某个算子的某个版本。

## 目录结构

```
atlas/                         # 源文件（想改可视化的地方）
├── AGENTS.md                  # 交接文档：数据事实、踩过的坑、约束、验证方法
├── index.html
├── styles.css
├── build-data.js              # ../source/onnx-metadata.json -> data/onnx-metadata.js
├── build.js                   # 构建 + 拷贝到 ../dist/web/atlas
├── bundle.js                  # 把上面所有东西内联成一个 HTML
├── verify.js                  # 23 项回归检查（纯 node + headless Chrome）
├── package.json
├── data/onnx-metadata.js      # 生成物：JSON 包成 globalThis.ONNX_METADATA（不提交）
└── js/
    ├── util.js                # DOM / 格式化 / 配色 / 类型字符串解析
    ├── ui.js                  # tooltip、badge、代码高亮、轻量 markdown
    ├── treemap.js             # squarified treemap 布局
    ├── model.js               # 建索引 + diff 引擎（版本之间的 schema 差异）
    ├── overview.js            # 视图 1
    ├── detail.js              # 视图 2
    ├── matrix.js              # 视图 3
    ├── compare.js             # 视图 4
    ├── catalog.js             # 侧栏筛选 + 算子列表
    └── app.js                 # 状态、路由、视图切换
```

全部是经典 `<script>`（非 ES module），所以 `file://` 直接打开也能跑。页面本身没有构建步骤，
构建只做两件事：把 JSON 包成脚本、把资源内联进单文件。

## 重新生成与验证

```bash
cd atlas
node build-data.js && node bundle.js && node verify.js   # 改完必跑
node build.js                                            # 额外产出 ../dist/web/atlas
cd .. && node package.js build web                       # 整站构建（含 atlas）
```

读取别的副本：

```bash
METADATA=/path/to/onnx-metadata.json node build-data.js && node bundle.js
```

开发时改完样式/脚本想立刻看效果，可以起一个静态服务器打开源目录：

```bash
cd atlas && python3 -m http.server 8080   # 然后访问 http://localhost:8080/
```

## 与 Netron 的关系

atlas 是 `source/onnx-metadata.json` 的消费者，也是这个 fork 的一部分：

- `node package.js build web` → `dist/web/atlas/`；Web 构建与 atlas 构建是同一命令。
- push 到 `main` 时 `.github/workflows/pages.yml` 会构建并发布整个 `dist/web`（Netron + atlas）到
  GitHub Pages。
- 与 Netron 应用 UI **没有耦合**：Netron 页面不链接 atlas，atlas 也不链接 Netron，
  两者唯一的共享物是那份元数据 JSON。

> 实现细节、数据陷阱和设计取舍见 `AGENTS.md`。
