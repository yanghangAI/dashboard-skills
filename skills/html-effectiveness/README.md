# HTML Effectiveness Skill

> **Markdown 是文字墙。HTML 是空间化、可交互的文档。**

当 AI agent 需要输出复杂信息（对比分析、时间线、决策矩阵、数据表格、代码审查）时，生成一个自包含的 HTML 文件，让读者在浏览器中扫描、过滤、探索、交互，而不是在 markdown 中上下滚动寻找信息。

灵感来源: [The Unreasonable Effectiveness of HTML](https://thariqs.github.io/html-effectiveness/)

---

## 这是什么

一个 Claude Code skill，指导 AI agent 在输出复杂内容时，生成单文件、零依赖、可直接在浏览器打开的交互式 HTML 文档。

**核心理念：** 信息应该是空间化的、可扫描的、可交互的，而不是线性的文字墙。

## 何时使用

| 场景 | 输出格式 |
|------|---------|
| 比较 2+ 个方案的优劣 | HTML 对比看板 |
| 展示 >5 行数据 | HTML 可排序表格 |
| 时间线、项目进度 | HTML 时间线 |
| 多维度决策 | HTML 决策矩阵 |
| 概念解释、教学 | HTML 知识探索器 |
| 代码审查、PR review | HTML 审查板 |
| 系统架构、设计 | HTML 架构图 |
| 简单问答、一行修复 | 纯 markdown |

## 9 种输出模式

### 1. Comparison Board (对比看板)
并排卡片展示多个选项，标签区分优劣，推荐高亮。

### 2. Annotated Timeline (时间线)
垂直时间线，颜色区分状态（完成/进行中/待开始），可展开详情。

### 3. Interactive Report (交互报告)
顶部统计 + 分类过滤按钮 + 卡片式详情，支持搜索。

### 4. Code Review Board (代码审查板)
按文件分组，严重度标签，前后对比 diff，行内评论。

### 5. Decision Matrix (决策矩阵)
选项为列，评估维度为行，颜色深浅表示得分，表头排序。

### 6. Knowledge Explorer (知识探索器)
折叠面板 + 标签页代码示例 + 搜索过滤 + 锚点导航。

### 7. Kanban Board (看板)
拖拽卡片在列间移动，支持导出为 markdown。

### 8. Design Token Sheet (设计系统)
色板点击复制 hex 值，字体比例尺，间距参考。

### 9. Slide Deck (幻灯片)
方向键导航，最小 JS，无需导出。

## 快速开始

### 安装为 Claude Code Skill

将 `skill.md` 复制到 Claude Code 的 skills 目录:

```bash
# 方法 1: 直接克隆到 skills 目录
git clone https://github.com/ghoulvspol/html-effectiveness-skill.git ~/.claude/skills/html-effectiveness

# 方法 2: 手动复制
mkdir -p ~/.claude/skills/html-effectiveness
cp skill.md ~/.claude/skills/html-effectiveness/skill.md
```

### 在对话中使用

```
# 直接触发
/html-effectiveness

# 或在输出复杂分析结果时，AI 会自动匹配此 skill
"对比这 3 个技术方案的优劣" → 自动选择 Comparison Board
"列出项目里程碑和进度" → 自动选择 Timeline
"评估候选方案在各维度的表现" → 自动选择 Decision Matrix
```

### 生成的 HTML 特性

- **单文件** — 所有 CSS/JS 内联，无外部依赖
- **零构建** — 浏览器直接打开 `file://` 或任何 HTTP 服务
- **深色模式** — 自动跟随系统 `prefers-color-scheme`
- **响应式** — 375px 手机到 1440px 桌面自适应
- **可打印** — `@media print` 自动展开所有折叠内容
- **语义化** — HTML5 + ARIA 属性，屏幕阅读器友好

## 设计规范

### 视觉系统

```css
:root {
  --bg: #fafaf9;          /* 页面背景 */
  --surface: #ffffff;      /* 卡片/面板 */
  --text: #1c1917;         /* 主文字 */
  --text-muted: #78716c;   /* 辅助文字 */
  --border: #e7e5e4;       /* 边框 */
  --accent: #2563eb;       /* 强调色 */
  --success: #16a34a;      /* 成功/正向 */
  --warning: #d97706;      /* 警告 */
  --danger: #dc2626;       /* 危险/负向 */
  --radius: 8px;           /* 圆角 */
}
```

### 交互模式

| 组件 | 效果 |
|------|------|
| 卡片 | `translateY(-2px)` + 阴影提升 (hover) |
| 折叠面板 | `max-height` 过渡 + `aria-expanded` |
| 标签页 | 点击切换面板可见性 |
| 过滤器 | `data-*` 属性 + JS 过滤 |
| 搜索 | `input` 事件 + `display: none` |
| 点击复制 | `navigator.clipboard.writeText()` |

### 禁止事项

- 紫/蓝渐变背景作为默认
- 通用的"功能网格 + 图标"布局
- 装饰性 blob、波浪、几何图案
- 占位图/图片占位符
- 千篇一律的 SaaS 模板
- Emoji 作为主要视觉元素
- HTML 内部的大段纯文字（违背初衷）

## 工作流

```
1. 分类 — "这是什么类型的信息？" → 匹配 9 种模式之一
2. 结构化 — 提取关键维度（选项、评分、时间戳、状态）
3. 生成 HTML — Write 工具写入单个 .html 文件
4. 打开浏览器 — `open <file.html>` 或本地 HTTP 服务
5. 迭代优化 — 用户反馈 → Edit 工具局部修改 → 重复
```

## 演示

**在线 Demo:** [https://ghoulvspol.github.io/html-effectiveness-skill/](https://ghoulvspol.github.io/html-effectiveness-skill/)

Demo 包含 5 种交互模式的实际运行效果:

- 对比看板: 3 个技术方案卡片 + 详情展开
- 时间线: 5 阶段项目进度 + 状态标签
- 决策矩阵: 6 维度 × 3 方案评分表
- 知识探索器: 折叠面板 + 标签页 + 搜索
- 交互报告: 6 服务状态 + 4 维度过滤

本地运行:

```bash
# 直接打开
open demo/index.html

# 或启动本地服务器
python3 -m http.server 8080 --directory demo
# 访问 http://localhost:8080
```

## 与其他 Skill 的集成

| 触发 Skill | 输出模式 |
|------------|---------|
| `/investigate` 产生调查结果 | → Incident Timeline |
| `/review` 产生代码审查 | → Code Review Board |
| `/plan-ceo-review` 产生策略 | → Comparison Board |
| 分析任务完成 | → Interactive Report |
| 复杂研究完成 | → Knowledge Explorer |

## 文件结构

```
html-effectiveness-skill/
├── README.md              # 本文件
├── skill.md               # Claude Code skill 定义
├── demo/
│   └── index.html         # 演示源文件
└── docs/
    └── index.html         # GitHub Pages 部署（在线演示）
```

## 许可

MIT

---

> *与其让读者在脑中"想象"信息的空间关系，不如直接渲染出来。*
