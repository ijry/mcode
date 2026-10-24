<script setup lang="ts">
import { getCurrentInstance } from "vue"
import type { TaskTabId } from "../taskStatus"
import { taskTabLabel } from "../taskStatus"

/**
 * 任务列表页顶部（M03）。
 *
 * 完全受控：自己不持有任何状态，值全部由页面通过 props 给，变更 emit 回去。
 * 与 `TodoPageHeader` 同一形状 —— 页面拥有状态，组件只画。
 *
 * M03 视觉规格：WORK TASKS 眉标 + 28px 大标题；右侧一组白色圆形工具钮（仓库 /
 * 设置 / 筛选）加一枚蓝色「+」；副标题（筛选摘要）紧跟标题行；下面是 36px 高的
 * 搜索框与一排**胶囊筛选 chips** —— M03 用胶囊代替了以前的 up-tabs 下划线样式，
 * 选中态是灰底深字，不画下划线。
 *
 * chips 是**id 驱动**的（点击直接上抛 tab id），不再有 up-tabs 的下标换算 ——
 * 页面持有的本来就是 id，中间多一层下标只会引入「回调形状不一致」这类兼容问题。
 */
const props = defineProps<{
  activeTab: TaskTabId
  searchKeyword: string
  tabs: TaskTabId[]
  /** tab id → 数量。 */
  counts: Record<TaskTabId, number>
  /** 当前筛选摘要（「全部连接」/ 连接名 · 项目名），显示在标题下。 */
  filterSummary: string
  /** 是否有生效的可见性筛选 —— 给筛选按钮加个点。 */
  filterActive: boolean
}>()

const emit = defineEmits<{
  (event: "update:activeTab", value: TaskTabId): void
  (event: "update:searchKeyword", value: string): void
  (event: "create"): void
  (event: "openFilter"): void
  (event: "openSettings"): void
  (event: "openForge"): void
}>()

const currentInstance = getCurrentInstance()
// upThemeVar 是 uview-plus 用 Options API mixin 注入的方法，只有模板作用域能直接调；
// `<script setup>` 里必须经 proxy 取，否则 ReferenceError（computed 里会静默失败）。
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/**
 * 角标只挂在「等你处理」上：每个 tab 都带数字会让顶部变成一排噪音，
 * 而这一个才是要催人去看的。
 */
function badgeCountFor(tab: TaskTabId): number {
  return tab === "attention" ? props.counts.attention : 0
}

function handleTabChange(tab: TaskTabId) {
  if (tab !== props.activeTab) {
    emit("update:activeTab", tab)
  }
}
</script>

<template>
  <view class="task-header">
    <view class="task-header__intro">
      <view class="task-header__top">
        <view class="task-header__copy">
          <text class="task-header__eyebrow">WORK TASKS</text>
          <text class="task-header__title">任务</text>
        </view>
        <view class="task-header__tools">
          <!-- 仓库面板入口。放在工具组最左边，与「设置 / 筛选」这两个作用于**本页**的
               按钮隔开语义上不同的一件事：它是去另一个功能。
               `github-circle-fill` 是 uview 内置图标集里唯一的 GitHub 图标（实心圆），
               与旁边两个线性图标不完全同族，但零新增文件且颜色跟随主题。 -->
          <view class="task-header__tool" @click="emit('openForge')">
            <up-icon
              name="github-circle-fill"
              size="18"
              :color="upThemeVar('--up-tips-color', '#909193')"
            ></up-icon>
          </view>
          <view class="task-header__tool" @click="emit('openSettings')">
            <up-icon name="setting" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
          </view>
          <view class="task-header__tool" @click="emit('openFilter')">
            <up-icon name="list" size="16" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
            <view v-if="props.filterActive" class="task-header__tool-dot"></view>
          </view>
          <view class="task-header__action" @click="emit('create')">
            <text class="task-header__action-plus">+</text>
          </view>
        </view>
      </view>
      <text class="task-header__summary">{{ props.filterSummary }}</text>
    </view>

    <view class="task-header__search">
      <up-search
        :modelValue="props.searchKeyword"
        placeholder="搜索任务标题、描述或分支"
        :show-action="false"
        shape="square"
        :height="36"
        :bgColor="upThemeVar('--up-card-bg-color', '#ffffff')"
        borderColor="transparent"
        :color="upThemeVar('--up-main-color', '#303133')"
        :placeholderColor="upThemeVar('--up-tips-color', '#8e8e93')"
        :searchIconColor="upThemeVar('--up-tips-color', '#8e8e93')"
        @update:modelValue="emit('update:searchKeyword', $event)"
      ></up-search>
    </view>

    <view class="task-header__chips">
      <view
        v-for="tab in props.tabs"
        :key="tab"
        :class="['task-header__chip', tab === props.activeTab && 'task-header__chip--active']"
        @click="handleTabChange(tab)"
      >
        <text class="task-header__chip-text">{{ taskTabLabel(tab) }}</text>
        <view v-if="badgeCountFor(tab) > 0" class="task-header__chip-badge">
          <text class="task-header__chip-badge-text">{{ badgeCountFor(tab) }}</text>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped lang="scss">
.task-header {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
  margin-bottom: 24rpx;
}

/* 标题行 + 副标题是 M03 里同一个「页头」块（gap 4px），与搜索框之间隔一个容器级 gap。 */
.task-header__intro {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.task-header__top {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20rpx;
}

.task-header__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

/* M03：眉标是中性灰，不是品牌蓝 —— 蓝色只留给主动作与链接。 */
.task-header__eyebrow {
  font-size: 22rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-tips-color, #8e8e93);
}

.task-header__title {
  font-size: 56rpx;
  font-weight: 700;
  line-height: 1.15;
  letter-spacing: -0.04em;
  color: var(--up-main-color, #303133);
}

.task-header__summary {
  font-size: 26rpx;
  color: var(--up-tips-color, #8e8e93);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.task-header__tools {
  display: flex;
  align-items: center;
  gap: 16rpx;
  flex-shrink: 0;
}

/* M03：32px 圆钮，卡片底色，16px 图标 —— 灰页上的白圆钮，不另加深灰底。 */
.task-header__tool {
  position: relative;
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-card-bg-color, #ffffff);
}

.task-header__tool-dot {
  position: absolute;
  top: 12rpx;
  right: 12rpx;
  width: 12rpx;
  height: 12rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
}

.task-header__action {
  width: 64rpx;
  height: 64rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
  flex-shrink: 0;
}

/* M03：加号是字面「+」字符（22px Bold），不是图标字体。 */
.task-header__action-plus {
  font-size: 44rpx;
  font-weight: 700;
  line-height: 1;
  color: #ffffff;
}

.task-header__search :deep(.u-search__content) {
  /* M03：36px 高、10px 圆角的白色搜索条，带一圈极淡的描边（黑 6%）。 */
  height: 72rpx !important;
  border: 1rpx solid color-mix(in srgb, var(--up-main-color, #303133) 7%, transparent) !important;
  border-radius: 20rpx !important;
  background-color: var(--up-card-bg-color, #ffffff) !important;
  box-shadow: none !important;
}

.task-header__search :deep(.u-search__content__input) {
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
}

/* M03：筛选是胶囊 chips，不是下划线 tabs。选中 = 灰底深字（主文字色 10% 调进卡片色）。 */
.task-header__chips {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.task-header__chip {
  display: inline-flex;
  align-items: center;
  gap: 8rpx;
  padding: 12rpx 24rpx;
  border-radius: 24rpx;
  transition: background-color 0.15s ease;
}

.task-header__chip-text {
  font-size: 26rpx;
  font-weight: 400;
  line-height: 1.3;
  color: var(--up-tips-color, #8e8e93);
  white-space: nowrap;
}

.task-header__chip--active {
  background: color-mix(in srgb, var(--up-main-color, #303133) 10%, var(--up-card-bg-color, #ffffff));
}

.task-header__chip--active .task-header__chip-text {
  font-weight: 500;
  color: var(--up-main-color, #303133);
}

/* 「等你处理」的数字角标：16px 橙色圆，白色数字。 */
.task-header__chip-badge {
  min-width: 32rpx;
  height: 32rpx;
  padding: 0 6rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 16rpx;
  background: var(--up-warning, #ff9900);
  box-sizing: border-box;
}

.task-header__chip-badge-text {
  font-size: 20rpx;
  font-weight: 700;
  line-height: 1;
  color: #ffffff;
}
</style>
