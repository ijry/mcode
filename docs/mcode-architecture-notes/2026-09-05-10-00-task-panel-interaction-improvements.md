# 任务面板交互改进

## 概述

改进任务面板的交互体验和视觉样式，解决"开始"按钮点击无反馈、主按钮视觉过重等问题。

## 核心改进

### 1. 动作加载状态

**问题**：点击"开始"按钮后无即时反馈，用户需等待一段时间才发现任务真的开始了。

**解决方案**：
- 在 `index.vue` 中引入 `pendingActions` 响应式 Set，存储正在执行的动作
- 格式为 `${taskId}:${actionId}`，精确追踪每个任务的每个动作
- `runAction` 函数接收可选的 `actionId` 参数，在操作前添加到集合，完成后移除
- 将状态传递给 `TaskCard` 组件用于 UI 反馈

**实现细节**：
```typescript
// index.vue
const pendingActions = ref<Set<string>>(new Set())

async function runAction(
  entry: TaskListEntry,
  fn: (gateway: CodegGateway) => Promise<unknown>,
  actionId?: TaskActionId
) {
  const pendingKey = actionId ? `${entry.task.id}:${actionId}` : ""
  if (pendingKey) {
    pendingActions.value.add(pendingKey)
  }
  try {
    await fn(bucket.gateway)
  } finally {
    if (pendingKey) {
      pendingActions.value.delete(pendingKey)
    }
    await loadTasks()
  }
}
```

**追踪的动作**：
- `start` - 开始任务
- `unqueueMerge` - 取消排队合并
- `archive` / `unarchive` - 归档/取消归档

### 2. TaskCard 加载 UI

在 `TaskCard.vue` 中：
- 接收 `pendingActions` prop
- 添加 `isActionPending(actionId)` 辅助函数检查动作状态
- 主按钮在加载时显示 `<up-loading-icon>` 替代静态图标
- 添加 `.task-card__primary--loading` 样式：opacity 0.7 + pointer-events none

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

### 3. 视觉样式优化

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
runAction(entry, startWorkTask, "start")
  ↓
pendingActions.add("${taskId}:start")
  ↓
TaskCard 显示加载图标
  ↓
await startWorkTask(gateway, id)
  ↓
pendingActions.delete("${taskId}:start")
  ↓
await loadTasks() 刷新列表
```

## 兼容性

- 弹层已有的 `submitting` 状态保持不变（TaskCancelSheet、TaskMergeSheet 等）
- 仅对卡片上的即时动作添加加载状态
- 需要用户输入的动作（合并、取消、重启）打开弹层，弹层自己管理 submitting

## 原生复刻指南

**iOS / Android**：
1. 维护 `Set<String>` 存储 `"${taskId}:${actionId}"`
2. 在操作前添加、完成/失败后移除
3. 卡片主按钮：检查集合判断是否显示 ActivityIndicator / ProgressBar
4. 加载时禁用按钮交互、降低不透明度至 0.7
5. 卡片阴影减小、圆角 10pt/10dp
6. 按钮字重 SemiBold (600)
7. 添加触摸反馈动画

## 测试要点

- 点击"开始"立即显示加载图标
- 加载期间按钮不可再次点击
- 操作成功后加载状态消失、列表刷新
- 操作失败后加载状态消失、显示错误提示
- 多个任务同时操作互不干扰
- 样式在深色模式下正常显示
