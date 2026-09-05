# 任务面板交互改进

## 概述

改进任务面板的交互体验和视觉样式，解决"开始"按钮点击无反馈、主按钮视觉过重等问题。新增重要操作的二次确认。

## 核心改进

### 1. 重要操作二次确认

**问题**：用户可能误触重要操作按钮，导致意外启动任务或取消排队。

**解决方案**：
为以下关键操作添加 `uni.showModal` 确认弹窗：

- **开始任务** (`start`)：启动 Agent 后台处理，不可撤销
- **取消合并排队** (`unqueueMerge`)：将任务从合并队列中移除

**实现细节**：
```typescript
case "start":
  uni.showModal({
    title: "开始任务",
    content: `确定开始任务「${live.title}」吗？Agent 将在后台开始处理。`,
    confirmText: "开始",
    cancelText: "取消",
    success: (res) => {
      if (res.confirm) {
        void runAction(entry, (gateway) => startWorkTask(gateway, live.id), "start")
      }
    },
  })
  return
```

**设计原则**：
- 需要确认：不可逆或影响较大的操作（启动、取消排队）
- 不需要确认：可逆操作（归档/取消归档）、打开弹窗的操作（已有二次界面）

### 2. 动作加载状态

**问题**：点击"开始"按钮后无即时反馈，用户需等待一段时间才发现任务真的开始了。

**解决方案**：
- 页面持有 `pendingActionByTask`：`taskId → actionId` 的**普通对象**
- 卡片只拿到属于自己那一个**标量字符串** `pendingAction`（空串 = 没有在飞的动作）
- `runAction` 接收可选的 `actionId`，操作前标记、`finally` 里清除

**为什么不是 `Set` / `Map`**：
小程序的 props 要经 `setData` 的 JSON 序列化，集合类型到不了子组件；而 H5 是引用
传递、跑得好好的 —— 于是这类错**只在打小程序包时才炸**。同理，标记/清除都整个对象
换新而不是原地改键：`setData` 的 diff 与小程序端的 props 更新都认引用变化，原地改
键在部分平台上不触发卡片重渲染，表现就是转圈不出现或一直停着。

由 `tests/pages/tasks/tasksPageContract.spec.ts` 的 `mini-program prop compatibility`
一组按源码锁住（扫 `pages/tasks/components/*.vue` 的 `defineProps` 块）。

**实现细节**：
```typescript
// index.vue
const pendingActionByTask = ref<Record<number, string>>({})

function markPendingAction(taskId: number, actionId: TaskActionId) {
  pendingActionByTask.value = { ...pendingActionByTask.value, [taskId]: actionId }
}

/** 只有还是自己那个动作时才清 —— 别把后一个动作的转圈提前抹掉。 */
function clearPendingAction(taskId: number, actionId: TaskActionId) {
  if (pendingActionByTask.value[taskId] !== actionId) return
  const next = { ...pendingActionByTask.value }
  delete next[taskId]
  pendingActionByTask.value = next
}
```

```vue
<TaskCard :pendingAction="pendingActionByTask[entry.task.id] || ''" />
```

**追踪的动作**（全部是直发命令、无弹层的）：
- `start` - 开始任务
- `unqueueMerge` - 取消排队合并
- `archive` / `unarchive` - 归档/取消归档

### 3. TaskCard 加载 UI

- 接收 `pendingAction` prop（字符串）
- `isActionPending(id)` = `pendingAction === id`，主动作与次动作共用同一判定
- 主动作与**次动作图标按钮**在加载时都换成 `<up-loading-icon>`（归档、取消排队作为
  次动作出现时，此前完全没有反馈）
- `--loading` 修饰类：`opacity: 0.7` + `pointer-events: none`

```vue
<view
  v-if="actions.primary"
  :class="['task-card__primary', isActionPending(actions.primary.id) && 'task-card__primary--loading']"
  @click.stop="emit('action', actions.primary.id)"
>
  <up-loading-icon
    v-if="isActionPending(actions.primary.id)"
    mode="circle"
    size="14"
    color="#ffffff"
  ></up-loading-icon>
  <up-icon v-else :name="actions.primary.icon" size="14" color="#ffffff"></up-icon>
  <text class="task-card__primary-text">{{ actions.primary.label }}</text>
</view>
```

### 4. 视觉样式优化

**卡片样式**：
- 减小阴影强度：`0 4rpx 12rpx rgba(15, 23, 42, 0.04)` (原 `0 10rpx 26rpx 0.06`)
- 减小圆角：`20rpx` (原 `24rpx`)
- 添加 `:active` 状态过渡，提供触感反馈

**主按钮**：
- 减小水平内边距：`24rpx` (原 `26rpx`)
- 降低字重：`font-weight: 600` (原 `700`)
- 添加 `transition: opacity 0.2s ease, transform 0.1s ease`

**图标按钮**：
- 添加 `:active` 状态：`opacity: 0.7` + `transform: scale(0.95)`
- 添加过渡动画

**关闭按钮**（弹层）：
- 添加 `transition: opacity 0.2s ease`
- 添加 `:active { opacity: 0.7; }`

**小角标 (task-badge)**：
- 增大内边距：`6rpx 14rpx` (原 `4rpx 12rpx`)
- 增大字号：`20rpx` (原 `18rpx`)

## 数据流

```
用户点击"开始"
  ↓
handleCardAction("start")
  ↓
uni.showModal 二次确认
  ↓
用户确认
  ↓
runAction(entry, startWorkTask, "start")
  ↓
markPendingAction(taskId, "start")   // 整个对象换新
  ↓
TaskCard 收到 pendingAction="start"，主按钮换成转圈
  ↓
await startWorkTask(gateway, id)
  ↓
clearPendingAction(taskId, "start")  // finally，失败路径同样收掉
  ↓
await loadTasks() 刷新列表
```

## 兼容性

- 弹层已有的 `submitting` 状态保持不变（TaskCancelSheet、TaskMergeSheet 等）
- 仅对卡片上的即时动作添加加载状态
- 需要用户输入的动作（合并、取消、重启）打开弹层，弹层自己管理 submitting
- 二次确认仅适用于不可逆或影响较大的操作

### 小程序

- props 全部是可 JSON 序列化的标量（见上文「为什么不是 `Set` / `Map`」）
- `uni.showModal`、`up-loading-icon` 在小程序端均可用
- **尚未解决的既有阻塞**：`src/App.up.vue` 用 `<component :is="petComp">` 挂宠物组件，
  小程序不支持动态组件，`build:mp-weixin` 会在这一步失败。这与任务面板无关，但意味着
  小程序包目前整体还构建不出来
- **既有差异**：`:active` 伪类在小程序的 `view` 上不生效（小程序要用 `hover-class`）。
  仓库现有 43 处 `:active`、0 处 `hover-class`，本次沿用既有写法，未单独改造任务面板 ——
  真要上小程序时应整体切到 `hover-class`，而不是只改一处

## 原生复刻指南

**iOS / Android**：
1. 每个任务维护一个「在飞的动作 id」标量（`taskId → actionId`），不必是集合
2. 在操作前设置、完成/失败后清除；清除时先比对是不是自己那个动作
3. 卡片主按钮与次动作图标按钮：为在飞的那个显示 ActivityIndicator / ProgressBar
4. 加载时禁用按钮交互、降低不透明度至 0.7
5. 卡片阴影减小、圆角 10pt/10dp
6. 按钮字重 SemiBold (600)
7. 添加触摸反馈动画
8. 重要操作使用 AlertDialog / UIAlertController 二次确认；可逆操作（归档）不弹

## 测试要点

由 `tests/pages/tasks/tasksPageContract.spec.ts` 覆盖的源码契约：
- `confirmations`：开始 / 取消排队 / 重试清理都走 `uni.showModal` 且只在
  `res.confirm` 时发命令；**反向**断言归档不弹确认
- `mini-program prop compatibility`：任务组件的 props 里不出现 `Set` / `Map`
- `marks the in-flight action so the card can show it spinning`：转圈状态确实接上了
- `replaces the pending map instead of mutating a key in place`：整对象换新

手动验证：
- 点击"开始"弹出确认弹窗，确认后立即出现转圈
- 加载期间按钮不可再次点击
- 操作成功/失败后转圈都消失（失败另有错误提示）
- 多个任务同时操作互不干扰
- 样式在深色模式下正常显示
- 取消确认弹窗不执行操作
