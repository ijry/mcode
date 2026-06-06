# MCode AI 宠物设计方案

## 概述

为 mcode 移动端应用添加全局 AI 宠物功能，兼具 **状态指示器**（实时反映 AI Agent 工作状态）和 **情感陪伴/收藏**（成长系统、皮肤配饰），参考 Claude Code Buddy、Codex Pets 等业界方案，适配移动端 UniApp 架构。

## 核心定位

- **状态指示**：宠物行为实时反映当前连接的 AI Agent 工作状态（思考中/执行中/等待审批/空闲/出错），用户余光一瞥即可感知
- **情感陪伴**：宠物有性格、会成长、可收藏皮肤配饰，提供情绪价值
- **MVP 范围**：悬浮宠物 + 状态反映 + 基础成长系统（等级/经验值）+ 3 套皮肤 + 6 件配饰

---

## 1. 宠物物种与视觉系统

### 1.1 物种体系

MVP 提供 6 种初始物种，用户首次使用时选择一只：

| 物种 | 性格关键词 | 设计灵感 |
|------|-----------|---------|
| 小狐狸 (fox) | 机灵、好奇 | 适合爱探索代码的用户 |
| 小猫头鹰 (owl) | 沉稳、智慧 | 适合深度思考型用户 |
| 小水獭 (otter) | 活泼、乐观 | 适合高频交互用户 |
| 小章鱼 (octopus) | 多线程、高效 | 多 Agent 并行的用户 |
| 小仙人掌 (cactus) | 佛系、耐心 | 呼应漫长等待的场景 |
| 小幽灵 (ghost) | 调皮、神秘 | 趣味收藏向 |

### 1.2 视觉规格

- **格式**：SVG（静态帧）+ Lottie JSON（关键动画）
- **尺寸**：悬浮态 `48x48dp`，面板内展示 `120x120dp`
- **调色板**：每物种一组主色（3-4 色），皮肤/配饰可叠加额外色层
- **动画帧率**：Lottie 24fps，循环动画控制在 2-4 秒一个周期
- **资源体积**：单物种全部动画资源 < 200KB

### 1.3 情绪-动画状态映射

宠物有 9 种表情态，由 Agent 状态 + 情绪维度组合驱动：

| 表情态 | 触发条件 | 动画描述 |
|--------|---------|---------|
| `sleeping` | 无活跃连接，长时间空闲 | 闭眼 + zzZ 气泡 |
| `idle` | 有连接但空闲 | 左右张望，偶尔眨眼 |
| `curious` | Agent 进入 thinking | 歪头 + 头顶冒问号 |
| `busy` | Agent running_tool | 快速操作动画（打字/挥手） |
| `alert` | waiting_permission | 跳跃 + 感叹号气泡 |
| `happy` | 任务完成/turn_complete | 蹦跳 + 星星特效 |
| `sad` | Agent error | 耷拉 + 乌云气泡 |
| `excited` | 升级/获得奖励 | 旋转 + 彩色纸屑 |
| `bored` | 用户长时间未操作 | 打哈欠 + 戳屏幕 |

---

## 2. 全局悬浮层与交互

### 2.1 悬浮层结构

基于 uview-plus 的 root 组件机制，通过 `App.up.vue` 在全局注入悬浮层：

```vue
<!-- App.up.vue -->
<template>
  <up-root-view />
  <PetFloat />
</template>

<script setup>
import PetFloat from './components/pet/PetFloat.vue'
</script>
```

uview-plus 构建时将 `<up-root-view />` 转换为 `<slot />`，使 PetFloat 成为所有页面的全局兄弟组件。

组件层级：

```
App.up.vue
  └── <slot /> (页面内容)
  └── PetFloat.vue (fixed 定位, z-index 高于页面)
        └── PetSprite.vue (当前表情态动画)
        └── PetBubble.vue (气泡提示)
  └── <up-popup> PetPanel (点击展开)
```

### 2.2 悬浮球交互

| 手势 | 行为 |
|------|------|
| 拖拽 | 自由移动位置，松手自动吸附屏幕左右边缘 |
| 单击 | 展开宠物面板（PetPanel） |
| 长按 | 快捷菜单：隐藏宠物 / 切换皮肤 / 静音气泡 |
| 双击 | "摸头"互动，宠物播放开心动画 + 获得少量经验 |

### 2.3 位置记忆

- 用户拖拽后的位置持久化到 `localStorage`
- 默认初始位置：屏幕右下角，距底部 TabBar 上方 `20dp`
- 进入对话详情等全屏页面时，悬浮球自动缩小为 `32x32dp` 迷你态

### 2.4 气泡系统

宠物偶尔冒出语音气泡：

| 场景 | 气泡内容示例 | 持续时间 |
|------|-------------|---------|
| Agent 完成任务 | "搞定啦!" | 3s |
| 等待审批超过 30s | "主人快来看看~" | 5s，闪烁 |
| Agent 报错 | "呜...出错了" | 4s |
| 用户当日首次打开 | "早上好!" (按时段) | 3s |
| 升级 | "我变强了!" | 4s + 特效 |

- 气泡以 `up-transition` 动画出现/消失
- 用户可在设置中关闭气泡（静音模式）
- 同一时间最多显示一条气泡，新气泡替换旧气泡

### 2.5 PetPanel 面板

点击悬浮球后，从底部弹出 `up-popup mode="bottom"` 面板：

```
┌─────────────────────────────┐
│  [宠物名字]  Lv.12  ⭐⭐⭐   │
│                             │
│     (大尺寸宠物动画 120x120) │
│                             │
│  ═══════════════ 85%  经验条 │
│                             │
│  ┌─────┐ ┌─────┐ ┌─────┐  │
│  │ 状态 │ │ 皮肤 │ │ 成就 │  │
│  └─────┘ └─────┘ └─────┘  │
│                             │
│  当前: 正在帮你写代码...     │
│  今日经验: +280             │
│  连接: Claude Code (活跃)   │
└─────────────────────────────┘
```

- **状态 Tab**：当前情绪、今日活动日志、关联的 Agent 状态
- **皮肤 Tab**：已解锁皮肤/配饰列表，可预览和切换
- **成就 Tab**：成长里程碑 + 解锁条件

---

## 3. 成长与经验系统

### 3.1 等级体系

- **最高等级**：50 级
- **经验曲线**：`所需经验 = 100 + (当前等级 × 20)`，前期升级快，后期平缓
- **等级里程碑**：每 10 级解锁一个新能力或外观变化

| 等级段 | 称号 | 解锁内容 |
|--------|------|---------|
| 1-10 | 新生 | 基础表情态，1 套默认皮肤 |
| 11-20 | 成长 | 气泡自定义文案，第 2 套皮肤解锁 |
| 21-30 | 熟练 | 宠物外观进化（体型微调），特殊动画 |
| 31-40 | 精通 | 配饰系统解锁，稀有皮肤 |
| 41-50 | 传说 | 传说特效光环，全部气泡解锁 |

### 3.2 经验值来源

三个通道，每日各有上限防止刷分：

**用户行为（日上限 200）**

| 行为 | 经验值 |
|------|--------|
| 打开 app（每日首次） | +10 |
| 发起对话 | +5/次 |
| 审批权限请求 | +8/次 |
| 完成待办项 | +15/项 |
| 与宠物互动（双击摸头） | +2/次，日上限 20 |

**Agent 产出（日上限 300）**

| 产出 | 经验值 |
|------|--------|
| Agent turn 完成 | +3/turn |
| 工具调用完成 | +2/次 |
| 对话正常结束（无报错） | +10/会话 |
| 累计 token 里程碑（每 10k） | +20 |

**日常任务（日上限 100）**

| 任务 | 经验值 | 重置 |
|------|--------|------|
| 每日签到 | +30 | 每日 |
| 连续签到 3 天 | +50 额外奖励 | 3 日周期 |
| 连续签到 7 天 | +100 额外奖励 | 7 日周期 |

### 3.3 数据持久化

宠物核心数据存储在 `pet.ts` Pinia store，通过 `pinia-plugin-persistedstate` 持久化到本地存储：

```ts
interface PetState {
  species: string            // 物种 ID
  name: string               // 用户取的名字
  level: number
  exp: number
  totalExp: number
  skinId: string             // 当前皮肤
  accessories: string[]      // 当前配饰
  unlockedSkins: string[]
  unlockedAchievements: string[]
  dailyExp: {
    user: number
    agent: number
    task: number
    date: string             // YYYY-MM-DD，用于判断是否跨日重置
  }
  signIn: {
    lastDate: string
    streak: number
  }
  createdAt: string
  emotionState: EmotionState
}
```

---

## 4. 皮肤与配饰系统

### 4.1 皮肤体系

皮肤改变宠物的整体配色和风格，不改变物种轮廓。

MVP 提供 3 套皮肤：

| 皮肤 | 获取方式 | 描述 |
|------|---------|------|
| 默认原色 | 初始自带 | 物种本身的标准配色 |
| 暗夜模式 | 等级 15 解锁 | 深色调重绘，呼应 app 深色模式 |
| 代码绿 | 累计完成 100 次对话 | 终端绿 + 黑色主题，致敬编程文化 |

### 4.2 配饰系统

配饰叠加在宠物身上，每个槽位独立：

**3 个配饰槽位：**

| 槽位 | 示例配饰 | 说明 |
|------|---------|------|
| 头部 | 帽子、头饰、天线 | 渲染在宠物头顶 |
| 身体 | 披风、围巾、背包 | 渲染在宠物身体 |
| 特效 | 光环、粒子尾迹 | 31 级后解锁该槽位 |

**MVP 配饰（共 6 件）：**

| 配饰 | 槽位 | 获取方式 |
|------|------|---------|
| Claude 紫帽 | 头部 | 使用 Claude Code 累计 50 次对话 |
| Codex 绿帽 | 头部 | 使用 Codex 累计 50 次对话 |
| 小墨镜 | 头部 | 等级 10 解锁 |
| 程序员格衫 | 身体 | 等级 20 解锁 |
| 闪电围巾 | 身体 | 连续签到 30 天 |
| 星光尾迹 | 特效 | 等级 35 解锁 |

### 4.3 数据结构

```ts
interface SkinDef {
  id: string
  name: string
  description: string
  unlockCondition: UnlockCondition
  colorPalette: string[]       // 覆盖物种默认色板
  lottieOverride?: string      // 可选的专属动画文件
}

interface AccessoryDef {
  id: string
  name: string
  slot: 'head' | 'body' | 'effect'
  unlockCondition: UnlockCondition
  svgAsset: string             // 配饰 SVG 路径
  anchor: { x: number; y: number }  // 相对宠物的锚点
}

type UnlockCondition =
  | { type: 'level'; level: number }
  | { type: 'achievement'; achievementId: string }
  | { type: 'stat'; stat: string; value: number }
```

### 4.4 渲染层序

从底到顶的绘制顺序：

```
1. 皮肤基础层（物种轮廓 + 皮肤色板）
2. 身体配饰层
3. 头部配饰层
4. 表情态动画层（眼睛、嘴巴变化）
5. 特效配饰层（光环、粒子）
6. 气泡层
```

PetSprite.vue 按此顺序叠加渲染，每层独立 SVG/Lottie，通过 CSS `position: absolute` 对齐锚点。

---

## 5. 技术架构与模块划分

### 5.1 文件结构

```
mcode-app/src/
  App.up.vue                    — uview-plus root 组件，注入全局 PetFloat
  components/pet/
    PetFloat.vue                — 全局悬浮层：fixed 定位、拖拽、吸附、手势
    PetSprite.vue               — 动画渲染器：多层 SVG/Lottie 叠加、状态机驱动
    PetPanel.vue                — 底部弹出面板：状态/皮肤/成就三 Tab
    PetBubble.vue               — 气泡提示组件：文案 + 动画出入
  stores/
    pet.ts                      — Pinia store：宠物数据、经验计算、解锁判定
  services/
    petEngine.ts                — 行为引擎：订阅 conversationRuntime → 情绪态计算
    petConfig.ts                — 静态配置：物种/皮肤/配饰定义、经验表
  types/
    pet.d.ts                    — 类型定义：PetState、SkinDef、AccessoryDef 等
  static/
    pets/
      fox/                      — 每物种一个目录
        idle.json               — Lottie 动画文件
        curious.json
        happy.json
        ...（9 种表情态）
      owl/
      otter/
      octopus/
      cactus/
      ghost/
    pet-skins/                  — 皮肤色板覆盖文件
    pet-accessories/            — 配饰 SVG 资源
```

### 5.2 核心模块职责

**petEngine.ts — 行为引擎**

```ts
// 订阅 conversationRuntime store，映射为情绪态
// 输入：Agent status + 上下文（时间、用户行为）
// 输出：EmotionState（驱动 PetSprite 动画切换）

function computeEmotion(
  agentStatus: RuntimeStatus,
  context: {
    idleDuration: number
    hasActiveConnection: boolean
    lastError: boolean
  }
): EmotionState
```

映射规则优先级（高 → 低）：

1. `waiting_permission` → `alert`
2. `error` → `sad`
3. `thinking` → `curious`
4. `running_tool` → `busy`
5. turn_complete 后 5s 内 → `happy`
6. 空闲 > 10min → `bored`
7. 无活跃连接 > 30min → `sleeping`
8. 其余 → `idle`

**pet.ts — Store**

```ts
// 职责：数据持久化、经验值增减、等级计算、解锁判定
// 依赖：pinia-plugin-persistedstate
// 暴露 actions：
//   addExp(source: 'user' | 'agent' | 'task', amount: number)
//   equipSkin(skinId: string)
//   equipAccessory(slot: string, accessoryId: string)
//   checkUnlocks() — 每次经验变化后调用
```

**PetFloat.vue — 悬浮层**

```ts
// 职责：touch 拖拽、边缘吸附、缩放（全屏页迷你态）
// 依赖：pet store（读取位置偏好）
// 注入方式：通过 App.up.vue 全局注入，不依赖路由
// 使用 CSS position: fixed + z-index: 9999
// touch 事件：touchstart / touchmove / touchend
```

**PetSprite.vue — 渲染器**

```ts
// 职责：根据 emotionState 切换 Lottie 动画
// 输入 props：species, emotionState, skinId, accessories[]
// 分层渲染：皮肤基础层 → 配饰层 → 表情层 → 特效层
// 状态切换时 crossfade 过渡（300ms）
```

### 5.3 与现有系统的集成点

| 集成点 | 方式 |
|--------|------|
| conversationRuntime store | petEngine watch $subscribe 监听 status 变化 |
| 对话发起/完成 | 在对话页 emit 事件，pet store 计入经验 |
| 待办完成 | todos 页操作后调用 `petStore.addExp('user', 15)` |
| 权限审批 | permission 流程完成后计入经验 |
| 深色模式 | PetFloat 读取系统 dark mode，传递给 PetSprite 调整渲染 |

---

## 参考资料

- [Claude Code Buddy — 18 Species Complete Guide](https://dev.to/damon_bb9e4bba1285afe2fcd/claude-buddy-the-complete-guide-to-your-ai-terminal-pet-all-18-species-rarities-hidden-22da)
- [Codex Pets — 像素宠物详细教程](https://blog.csdn.net/weixin_41961749/article/details/160718067)
- [Agentic Desktop Pet — LLM + 记忆 + 情感 + RPG](https://github.com/jihe520/Agentic-Desktop-Pet)
- [OpenPets — 跨平台 AI 编程宠物](https://openpets.dev/)
- [uview-plus 官方文档](https://uview-plus.jiangruyi.com/components/intro.html)
