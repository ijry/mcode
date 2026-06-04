# TabBar Icons Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 `mcode-app` 现有四个底部 tab 增加本地图标，并保持当前 tab 顺序、路由和行为不变。

**Architecture:** 继续使用 uni-app 原生 `tabBar` 配置，在 `mcode-app/src/static/tabbar/` 下新增默认态与选中态图标资源，通过 `mcode-app/src/pages.json` 的 `iconPath` 与 `selectedIconPath` 进行接入。运行时逻辑保持不变，不引入自定义 tabbar，也不修改页面代码。

**Tech Stack:** uni-app、Vue 3、原生 `pages.json` tabBar 配置、位图图标资源

---

### Task 1: 新增 TabBar 图标资源

**Files:**
- Create: `mcode-app/src/static/tabbar/connections.png`
- Create: `mcode-app/src/static/tabbar/connections-active.png`
- Create: `mcode-app/src/static/tabbar/conversations.png`
- Create: `mcode-app/src/static/tabbar/conversations-active.png`
- Create: `mcode-app/src/static/tabbar/todos.png`
- Create: `mcode-app/src/static/tabbar/todos-active.png`
- Create: `mcode-app/src/static/tabbar/profile.png`
- Create: `mcode-app/src/static/tabbar/profile-active.png`

- [ ] **Step 1: 生成四组默认态与选中态图标资源**

使用统一尺寸与统一线性风格生成 8 个图标资源：

```text
尺寸：81x81 像素
默认态颜色：#8f8f94
选中态颜色：#2979ff
图标语义：
- 连接：链路
- 会话：聊天气泡
- 待办：勾选清单
- 我的：用户头像
```

- [ ] **Step 2: 检查资源路径是否完整**

确认以下文件都存在：

```powershell
Get-ChildItem .\mcode-app\src\static\tabbar | Select-Object Name
```

Expected: 输出 8 个目标文件名。

### Task 2: 接入 `pages.json` 的 tabBar 配置

**Files:**
- Modify: `mcode-app/src/pages.json`

- [ ] **Step 1: 为每个 tab 补充图标路径**

将 `tabBar.list` 更新为包含图标字段的结构：

```json
{
  "pagePath": "pages/connections/index",
  "text": "连接",
  "iconPath": "static/tabbar/connections.png",
  "selectedIconPath": "static/tabbar/connections-active.png"
}
```

其余三个 tab 按同样模式分别接入：

```json
{
  "pagePath": "pages/conversations/index",
  "text": "会话",
  "iconPath": "static/tabbar/conversations.png",
  "selectedIconPath": "static/tabbar/conversations-active.png"
},
{
  "pagePath": "pages/todos/index",
  "text": "待办",
  "iconPath": "static/tabbar/todos.png",
  "selectedIconPath": "static/tabbar/todos-active.png"
},
{
  "pagePath": "pages/profile/index",
  "text": "我的",
  "iconPath": "static/tabbar/profile.png",
  "selectedIconPath": "static/tabbar/profile-active.png"
}
```

- [ ] **Step 2: 保持现有 tab 顺序与颜色配置不变**

确认 `tabBar` 仍保留：

```json
{
  "color": "#8f8f94",
  "selectedColor": "#2979ff",
  "backgroundColor": "#ffffff",
  "borderStyle": "black"
}
```

Expected: 只增加图标字段，不改 tab 顺序和其他配置。

### Task 3: 验证配置可用性

**Files:**
- Modify: `mcode-app/src/pages.json`
- Create: `mcode-app/src/static/tabbar/*`

- [ ] **Step 1: 运行一次目标平台构建**

在 `mcode-app` 目录执行：

```bash
pnpm build:h5
```

Expected: 构建成功，无 `pages.json` 配置错误，无静态资源缺失报错。

- [ ] **Step 2: 人工检查产物中图标已被打包**

执行：

```powershell
Get-ChildItem .\mcode-app\dist -Recurse | Where-Object { $_.Name -match 'connections|conversations|todos|profile' } | Select-Object FullName
```

Expected: 能看到 tabbar 图标资源进入构建产物。

- [ ] **Step 3: 手工预览 TabBar 表现**

验证以下项目：

```text
1. 底部四个 tab 都显示图标
2. 顺序仍为：连接 / 会话 / 待办 / 我的
3. 点击切换时选中态为蓝色图标
4. 未选中态为灰色图标
5. 暗色模式下 tabbar 文本与背景仍可正常阅读
```

- [ ] **Step 4: 提交本次改动**

```bash
git add docs/superpowers/specs/2026-06-04-tabbar-icons-design.md docs/superpowers/plans/2026-06-04-tabbar-icons.md mcode-app/src/pages.json mcode-app/src/static/tabbar
git commit -m "feat(app): add native tabbar icons"
```

Expected: 生成单一功能提交，便于回溯。
