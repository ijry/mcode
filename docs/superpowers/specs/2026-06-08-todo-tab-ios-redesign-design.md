# Todo Tab iOS Redesign Design

**Date:** 2026-06-08  
**Scope:** `mcode-app` 待办 tab 的视觉重构与轻交互重组  
**Primary Files:** `mcode-app/src/pages/todos/index.vue`, `mcode-app/src/pages/todos/components/*`  
**Reference Design:** user-provided todo screenshot, with top-area style aligned to the new conversations page

---

## Problem

当前待办页仍然是早期工具页结构：

- 顶部是常驻输入条，缺少明确的页面主标题和视觉层级
- 列表只有单段平铺，不能表达“进行中 / 已完成”两段结构
- 页面没有 `本地 / 云端` 分段容器，无法为后续云端能力预留稳定壳子
- “已完成”当前只能继续保留在列表里，缺少符合参考稿的清理动作
- 页面风格与已经重做过的 `conversations` 页不一致，tab 之间观感割裂

## Goal

在不破坏现有本地待办能力和“发送到新会话”能力的前提下，把待办页重做成接近参考图的 iOS 风格页面。

目标包括：

- 顶部采用与新会话页接近的标题、搜索框和操作按钮语言
- 新增 `本地 / 云端` 分段切换，云端先预留占位
- 本地列表改成 `进行中` 和 `已完成` 两段
- 右上角 `+` 改为使用 `up-popup` 底部弹层新建待办
- `已完成` 右侧支持 `清除全部`，但实际语义为“标记隐藏”
- 保留现有卡片级编辑、复制、删除、发送到新会话能力

## Non-Goals

- 不接入真实云端待办接口
- 不把本地待办迁移到 Pinia store 或数据库
- 不重写“发送到新会话”的网关逻辑
- 不新增已隐藏待办恢复入口
- 不改 tabBar 路由结构

## Chosen Direction

采用 **单页容器 + 页面内轻组件拆分** 的方式完成这次重构：

- 页面容器继续放在 `mcode-app/src/pages/todos/index.vue`
- 把头部、分区、卡片列表、新建弹层拆成小组件，避免继续堆积在单文件里
- 视觉语言尽量复用 `conversations` 页已经验证过的 iOS 风格浅色布局
- 数据仍然落本地存储，但扩展待办项字段以支持“隐藏已完成”

这样可以在不扩大业务边界的前提下，把这次视觉改动做成后续接云端时也能复用的壳子。

## Detailed Design

### 1. 页面结构

待办页调整为以下层级：

1. 页面头部
2. 搜索框
3. `本地 / 云端` 分段切换
4. 当前 tab 对应的内容区
5. `+` 按钮触发的新建待办底部弹层

默认进入 `本地` tab。

`本地` tab 内容：

- `进行中` 分区
- `已完成` 分区

`云端` tab 内容：

- 与本地保持同结构的占位壳子
- 分区标题与空列表视觉都存在
- 所有写操作入口允许点击，但只提示“云端待办即将上线”

### 2. 组件边界

页面内部拆成以下轻组件：

#### `TodoPageHeader`

职责：

- 渲染标题 `待办`
- 渲染搜索框
- 渲染 `本地 / 云端` 分段
- 渲染右上角 `+`

输入：

- `activeTab`
- `searchKeyword`

输出事件：

- `update:activeTab`
- `update:searchKeyword`
- `create`

#### `TodoSectionBlock`

职责：

- 渲染分区标题
- 在 `已完成` 分区右侧渲染 `清除全部`
- 包装对应列表或空态

输入：

- `title`
- `actionText?`
- `disabled?`

输出事件：

- `action`

#### `TodoCardList`

职责：

- 渲染待办卡片列表
- 根据模式切换视觉表现

模式：

- `in-progress`
- `completed`
- `cloud-placeholder`

输入：

- `items`
- `mode`
- `emptyText`

输出事件：

- `toggle`
- `edit`
- `send`
- `menu`
- `placeholderAction`

#### `TodoCreatePopup`

职责：

- 用 `up-popup` 渲染底部新建待办弹层
- 只处理新建，不负责发送到新会话

输入：

- `show`

输出事件：

- `update:show`
- `submit`

### 3. 数据模型

当前待办项从简单完成态扩展为兼容旧数据的结构：

```ts
interface TodoItem {
  id: string
  text: string
  completed: boolean
  createdAt: number
  completedAt?: number | null
  hidden?: boolean
  hiddenAt?: number | null
}
```

状态语义：

- `进行中`：`completed !== true`
- `已完成`：`completed === true && hidden !== true`
- `已隐藏`：`completed === true && hidden === true`

不为云端占位引入单独数据实体。云端是页面级交互状态，不进入本地持久化结构。

### 4. 本地存储兼容与迁移

继续复用当前本地存储 key。

加载时做轻量兼容归一化：

- 旧数据没有 `completedAt` 时补 `null`
- 旧数据没有 `hidden` 时补 `false`
- 旧数据没有 `hiddenAt` 时补 `null`

不做一次性 destructive migration；每次读取后以内存归一化结果继续使用，并在下一次保存时自然写回新结构。

### 5. 本地交互规则

#### 新建

- 点击顶部 `+` 打开 `TodoCreatePopup`
- 输入非空文本后提交
- 新待办插入 `进行中` 列表顶部

#### 搜索

- 搜索只筛选当前 tab 的可见数据
- `本地` tab 只搜索未隐藏项
- `云端` tab 搜索框只保留交互外观，不做真实筛选

#### 完成切换

- 点击卡片左侧圆形勾选控件切换完成态
- 从进行中切到完成时：
  - `completed = true`
  - `completedAt = now`
- 从完成切回进行中时：
  - `completed = false`
  - `completedAt = null`
  - `hidden = false`
  - `hiddenAt = null`

#### 编辑

- 只允许编辑进行中项
- 已完成项不进入编辑态
- 空文本提交时沿用当前删除行为

#### 清除全部

- 只作用于当前可见的已完成项
- 先弹确认框
- 确认后把这些项批量标记为：
  - `hidden = true`
  - `hiddenAt = now`
- 不物理删除

#### 卡片操作

保留当前菜单能力：

- `复制`
- `删除`
- `发送到新会话`

其中发送到新会话继续复用现有弹层与网关逻辑，不在这次重构中改业务流程。

### 6. 云端占位行为

云端 tab 当前只提供结构预留：

- 顶部 `+` 可点击，但只 toast `云端待办即将上线`
- `进行中` 和 `已完成` 分区均显示空壳或空态
- `清除全部` 可点击，但只 toast `云端待办即将上线`
- 如果未来要接真实接口，应优先替换页面容器的数据来源，不需要改头部和列表结构

### 7. 视觉语言

页面视觉沿用 `conversations` 页已经存在的语言，但按参考图收敛为更简洁的待办结构：

- 浅灰页面背景
- 大号标题 `待办`
- 搜索框使用浅灰胶囊底
- 分段切换使用浅底 + 白色选中滑块
- 卡片采用大圆角、浅阴影、轻边界
- 左侧勾选圆圈更接近 iOS 待办列表
- 右侧状态徽标使用弱化胶囊

层级建议：

- 页面标题最强
- 分区标题弱于页面标题，但强于卡片元信息
- 卡片正文主文案强于时间、来源和状态标签

### 8. 组件放置位置

为控制本次改动范围，组件放在页面目录内：

- `mcode-app/src/pages/todos/components/TodoPageHeader.vue`
- `mcode-app/src/pages/todos/components/TodoSectionBlock.vue`
- `mcode-app/src/pages/todos/components/TodoCardList.vue`
- `mcode-app/src/pages/todos/components/TodoCreatePopup.vue`

这样能避免把仍然高度页面私有的视觉组件过早放进全局组件目录。

## Data Flow

1. 页面挂载或 `onShow` 时读取本地存储。
2. 容器层归一化待办数组。
3. 根据 `activeTab`、`searchKeyword`、`completed`、`hidden` 计算：
   - `visibleInProgressTodos`
   - `visibleCompletedTodos`
4. 容器把结果下发给分区组件和卡片组件。
5. 用户操作卡片、分区动作或新建弹层时，事件回到页面容器。
6. 页面容器更新本地数组并立即保存。
7. “发送到新会话”继续走现有弹层和网关调用链。

## Error Handling

- 新建空待办时不提交，保持按钮禁用或直接拦截
- 本地存储读取异常时回退为空数组，并打印警告
- 本地存储写入失败时 toast 提示 `保存失败`
- 云端占位入口统一 toast `云端待办即将上线`
- 发送到新会话失败时继续沿用现有错误提示，不改变错误语义

## Testing Strategy

手动验证以下场景：

1. 打开待办 tab
   - 预期：顶部样式接近新会话页，标题、搜索、分段和 `+` 显示正常

2. 新建待办
   - 预期：点击 `+` 打开底部弹层，提交后插入进行中列表顶部

3. 本地搜索
   - 预期：只筛选本地当前可见列表，不显示已隐藏项

4. 完成切换
   - 预期：进行中项可切到已完成；已完成项可切回进行中

5. 已完成清除全部
   - 预期：先出现确认框；确认后已完成区项目消失，但底层不是物理删除

6. 编辑与删除
   - 预期：进行中项可编辑；空文本仍按当前规则删除；删除功能正常

7. 发送到新会话
   - 预期：原有发送弹层、连接选择和跳转逻辑保持可用

8. 切换到云端
   - 预期：页面结构完整；`+`、清除全部等写操作只提示“即将上线”

9. H5 与移动端预览
   - 预期：无横向滚动，无卡片溢出，安全区正常

## Acceptance Criteria

- 待办页完成 iOS 风格视觉重构
- 顶部使用与新会话页一致的标题/搜索/主操作语言
- 页面新增 `本地 / 云端` 分段
- 本地列表拆成 `进行中` 和 `已完成`
- 新建待办改为 `up-popup` 底部弹层
- `清除全部` 的实现语义为“标记隐藏”，不是删除
- 现有发送到新会话能力继续可用
- 云端 tab 具备可点击的占位壳子，但不接真实数据
