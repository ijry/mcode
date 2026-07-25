# mcode 设置页实验性功能提示 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:executing-plans` with Inline Execution to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在会话设置中常驻提示实时信息流和“同步 PC 端”TAB 为仅供体验的实验性功能。

**Architecture:** 仅在设置页的“会话设置”标题和现有配置卡片之间插入一个静态提示视图。现有的实时消息流偏好、TAB 多任务模式、本地存储、ACP 调用和远端同步均保持原样；契约测试仅验证提示文案与相关设置共存。

**Tech Stack:** Vue 3 `script setup`、uni-app、uview-plus、SCSS、Jest。

## Global Constraints

- 默认文案使用中文，并固定表达“仅供体验，不建议正式使用”。
- 提示只覆盖实时信息流和“同步 PC 端”TAB，不将“移动端自管”或“关闭”标记为实验性功能。
- 仅使用已有 `--up-*` 运行时主题变量；不得新增 `--mcode-*` 主题别名。
- 不改变本地偏好键、实时订阅、PC TAB 同步、ACP 协议、网关调用或数据库结构。
- 每项 mcode 改动必须更新 `docs/mcode-architecture-notes/`。
- 不创建 Git 提交，除非用户另行明确要求。

---

### Task 1: 锁定设置页提示契约

**Files:**
- Modify: `mcode-app/tests/pages/profile/settingsPageContract.spec.ts:5-18`

**Interfaces:**
- Consumes: `mcode-app/src/pages/settings/index.vue` 的静态模板文本。
- Produces: 对实验性功能提示与现有两项相关设置的源码级回归保护。

- [ ] **Step 1: 添加失败断言**

在第一个 `it` 块内、已有“同步 PC 端”断言之后加入：

```ts
expect(source).toContain("实验性功能")
expect(source).toContain("实时信息流和同步 PC 端 TAB 仅供体验，不建议正式使用")
```

- [ ] **Step 2: 运行单测确认失败**

Run:

```powershell
cd mcode-app
npx jest --config jest.config.cjs --runInBand tests/pages/profile/settingsPageContract.spec.ts
```

Expected: FAIL，缺少实验性功能提示文案。

### Task 2: 在会话设置中实现常驻提示

**Files:**
- Modify: `mcode-app/src/pages/settings/index.vue:3-40`
- Modify: `mcode-app/src/pages/settings/index.vue:144-230`

**Interfaces:**
- Consumes: 已存在的 `upThemeVar('--up-warning', '#f9ae3d')` 和 uview `u-icon` 组件。
- Produces: 无状态、非交互的 `experimental-notice` 设置页视图；不新增脚本状态或服务调用。

- [ ] **Step 1: 在配置卡片前插入提示模板**

在“会话设置”标题之后、`menu-list` 之前加入：

```vue
<view class="experimental-notice">
  <u-icon
    class="experimental-notice__icon"
    name="info-circle"
    size="20"
    :color="upThemeVar('--up-warning', '#f9ae3d')"
  ></u-icon>
  <view class="experimental-notice__content">
    <text class="experimental-notice__title">实验性功能</text>
    <text class="experimental-notice__text">
      实时信息流和同步 PC 端 TAB 仅供体验，不建议正式使用。
    </text>
  </view>
</view>
```

- [ ] **Step 2: 添加主题兼容样式**

在现有 `.menu-list, .form-card` 规则之前添加：

```scss
.experimental-notice {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  margin-bottom: 16rpx;
  padding: 22rpx 24rpx;
  border: 1rpx solid color-mix(in srgb, var(--up-warning, #f9ae3d) 32%, var(--up-border-color, #dadbde) 68%);
  border-radius: 22rpx;
  background-color: color-mix(in srgb, var(--up-warning, #f9ae3d) 12%, var(--up-card-bg-color, #ffffff) 88%);
}

.experimental-notice__icon {
  flex-shrink: 0;
  margin-top: 2rpx;
}

.experimental-notice__content {
  min-width: 0;
}

.experimental-notice__title,
.experimental-notice__text {
  display: block;
}

.experimental-notice__title {
  font-size: 28rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.experimental-notice__text {
  margin-top: 6rpx;
  font-size: 24rpx;
  line-height: 1.45;
  color: var(--up-content-color, #606266);
}
```

- [ ] **Step 3: 运行契约测试确认通过**

Run:

```powershell
cd mcode-app
npx jest --config jest.config.cjs --runInBand tests/pages/profile/settingsPageContract.spec.ts
```

Expected: PASS，两个测试均通过。

### Task 3: 记录原生复刻与兼容性约束

**Files:**
- Create: `docs/mcode-architecture-notes/2026-07-26-settings-experimental-feature-notice.md`

**Interfaces:**
- Consumes: 设置页的静态提示和既有实时流、TAB 多任务配置。
- Produces: 面向 Web/uni-app 与原生 iOS/Android 实现者的行为、数据流和兼容性说明。

- [ ] **Step 1: 编写架构说明**

创建 Markdown 文件，使用以下内容：

```markdown
# Settings Experimental Feature Notice

## Architecture

`mcode-app/src/pages/settings/index.vue` 在“会话设置”标题下、实时消息流开关和 TAB 多任务选择器之前展示一条常驻提示。提示明确指出实时信息流和“同步 PC 端”TAB 为实验性功能，仅供体验，不建议正式使用；“关闭”和“移动端自管”不属于此提示的范围。

## Protocol And Data Flow

本变更只增加静态界面内容，不读取或写入新状态。`mcode_conversation_list_live_stream_enabled`、`mcode_detail_tab_multitask_mode`、实时订阅、`list_opened_tabs`、`save_opened_tabs` 和 ACP 事件流均保持不变。

## UI Behavior

提示始终显示，不随实时消息流开关或 TAB 模式选择而隐藏，也不要求确认或阻断用户继续操作。它使用 uview-plus 已有的 `--up-warning`、`--up-card-bg-color`、`--up-border-color`、`--up-main-color` 和 `--up-content-color` 变量，以便浅色和深色主题保持对比度。

## Compatibility

不涉及服务端路由、ACP 协议、SQLite 结构或偏好值迁移。已保存的实时流与 TAB 配置继续按原有规则生效。

## Native iOS/Android Replication

原生客户端应在会话设置中、实时信息流和 TAB 多任务配置之前展示相同含义的常驻提示。提示仅用于风险告知，不应改变设置值、增加确认流程，或改变实时订阅与 PC TAB 同步协议。
```

- [ ] **Step 2: 运行格式与回归验证**

Run:

```powershell
git diff --check
cd mcode-app
npx jest --config jest.config.cjs --runInBand tests/pages/profile/settingsPageContract.spec.ts
```

Expected: `git diff --check` 无输出，Jest 返回 PASS。

## Review

- 规格覆盖：Task 2 实现常驻提示、限定文案与主题变量；Task 1 验证其与两个现有功能共存；Task 3 满足 mcode 架构说明及原生复刻要求。
- 占位符：已检查，不含 `TODO`、`TBD`、未定义接口或模糊实现步骤。
- 类型与命名：仅使用现有 Vue 模板、uview 组件和 `upThemeVar`；新增 CSS 类在模板与样式中名称一致。
