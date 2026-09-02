<script setup lang="ts">
import { computed, getCurrentInstance } from "vue"
import { forgeTabBadge, forgeTabLabel, type ForgeTabCounts } from "../forgeTabBadge"
import type { ForgeRemote, ForgeTab } from "@/types/forge"

/**
 * 列表页顶部：仓库条 + 双 tab + 搜索 + 摘要行。
 *
 * 仓库条永远显示 `连接名 · 项目名` 与 `owner/repo`，点整条开作用域弹层 —— 从任务页
 * 顶部进来时用户没有选过项目，所以「现在看的是哪个仓库」必须一直在屏幕上。
 *
 * 摘要行是 `total_count` 三态**唯一**能说清楚的地方：tab 徽章只能画一个数字或者
 * 不画（`u-tabs` 的模板会把 `value: 0` 吃掉），所以「真的 0 条」「forge 拒绝计数」
 * 「计数不完整」的区别都落在这一行。
 *
 * 完全受控 —— 自己不持有状态，也不发请求。搜索的防抖在页面里（500ms）。
 */
const props = defineProps<{
  connectionName: string
  projectName: string
  remote: ForgeRemote | null
  tab: ForgeTab
  /** 两个 tab 的计数，各自带自己的作用域键。 */
  counts: ForgeTabCounts
  /** 当前筛选的计数作用域 —— 与 `counts[tab].scope` 比对，不匹配就是残留，不画。 */
  countsScope: string
  keyword: string
  /** 有生效的筛选 —— 给筛选按钮加一个点。 */
  filterActive: boolean
  /** 列表下方那条摘要（已加载 N / 共 M、不提供计数、计数不完整…）。 */
  summary: string
  loading?: boolean
}>()

const emit = defineEmits<{
  (event: "update:tab", value: ForgeTab): void
  (event: "update:keyword", value: string): void
  (event: "openScope"): void
  (event: "openRepo"): void
  (event: "openFilter"): void
  (event: "openNewIssue"): void
  (event: "openSettings"): void
  (event: "refresh"): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const scopeText = computed(() =>
  [props.connectionName, props.projectName].filter(Boolean).join(" · ") || "未选择项目"
)

const TABS: ForgeTab[] = ["issues", "prs"]

const tabList = computed(() =>
  TABS.map((tab) => ({
    id: tab,
    title: forgeTabLabel(tab, props.remote?.provider || "github"),
    badge: forgeTabBadge(
      props.counts[tab],
      props.countsScope,
      upThemeVar("--up-primary", "#2979ff")
    ),
  }))
)

const currentIndex = computed(() => {
  const index = TABS.indexOf(props.tab)
  return index >= 0 ? index : 0
})

function handleTabChange(item: any) {
  // up-tabs 各版本回调形状不一致：有的给 `{index}`，有的直接给 item，也见过给纯下标。
  // 三种都认，与 `pages/tasks/components/TaskPageHeader.vue` 的同名处理一致。
  const index =
    typeof item === "number"
      ? item
      : typeof item?.index === "number"
        ? item.index
        : TABS.findIndex((tab) => tab === item?.id)
  const next = TABS[index]
  if (next && next !== props.tab) {
    emit("update:tab", next)
  }
}
</script>

<template>
  <view class="forge-header-block">
    <view class="forge-header" :style="upThemeCardStyle">
      <view class="forge-header__main" @click="emit('openScope')">
        <view class="forge-header__copy">
          <text class="forge-header__eyebrow">仓库面板</text>
          <text class="forge-header__scope">{{ scopeText }}</text>
          <!-- owner/repo 单独一行且可点：它是「我在看哪个仓库」最权威的答案，
               点它去浏览器打开那个仓库。 -->
          <text
            v-if="props.remote"
            class="forge-header__repo"
            @click.stop="emit('openRepo')"
          >{{ props.remote.owner_repo }}</text>
        </view>
        <up-icon
          name="arrow-down"
          size="15"
          :color="upThemeVar('--up-tips-color', '#c0c4cc')"
        ></up-icon>
      </view>

      <view class="forge-header__tools">
        <view class="forge-header__tool" @click="emit('openSettings')">
          <up-icon name="setting" size="17" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
        </view>
        <view class="forge-header__tool" @click="emit('openFilter')">
          <up-icon name="list" size="17" :color="upThemeVar('--up-content-color', '#606266')"></up-icon>
          <view v-if="props.filterActive" class="forge-header__tool-dot"></view>
        </view>
        <view class="forge-header__tool" @click="emit('refresh')">
          <up-loading-icon
            v-if="props.loading"
            mode="circle"
            size="17"
            :color="upThemeVar('--up-primary', '#2979ff')"
          ></up-loading-icon>
          <up-icon
            v-else
            name="reload"
            size="17"
            :color="upThemeVar('--up-content-color', '#606266')"
          ></up-icon>
        </view>
        <!-- 新建只对 issue 有意义 —— PR 要有一个分支才能开，那不是手机上做的事。 -->
        <view v-if="props.tab === 'issues'" class="forge-header__action" @click="emit('openNewIssue')">
          <up-icon name="plus" size="16" color="#ffffff"></up-icon>
        </view>
      </view>
    </view>

    <view class="forge-header__search">
      <up-search
        :modelValue="props.keyword"
        placeholder="搜索标题与描述"
        :show-action="false"
        shape="round"
        :bgColor="upThemeVar('--up-hover-bg-color', '#e9eaee')"
        borderColor="transparent"
        :color="upThemeVar('--up-main-color', '#1a1b1f')"
        :placeholderColor="upThemeVar('--up-tips-color', '#9ca3af')"
        :searchIconColor="upThemeVar('--up-tips-color', '#8b93a5')"
        :height="44"
        @update:modelValue="emit('update:keyword', $event)"
      ></up-search>
    </view>

    <view class="forge-header__tabs">
      <up-tabs
        :current="currentIndex"
        :list="tabList"
        keyName="title"
        :scrollable="false"
        :lineColor="upThemeVar('--up-primary', '#2979ff')"
        :activeStyle="{ color: upThemeVar('--up-main-color', '#303133'), fontWeight: '700' }"
        :inactiveStyle="{ color: upThemeVar('--up-content-color', '#606266') }"
        @change="handleTabChange"
      ></up-tabs>
    </view>

    <text v-if="props.summary" class="forge-header__summary">{{ props.summary }}</text>
  </view>
</template>

<style scoped lang="scss">
@import "../index.scss";

.forge-header-block {
  display: flex;
  flex-direction: column;
  gap: 16rpx;
}

.forge-header {
  display: flex;
  align-items: flex-start;
  gap: 16rpx;
  padding: 24rpx;
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.forge-header__main {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.forge-header__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.forge-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.14em;
  color: var(--up-primary, #2979ff);
}

.forge-header__scope {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.forge-header__repo {
  font-size: 22rpx;
  color: var(--up-content-color, #606266);
  word-break: break-all;
}

.forge-header__tools {
  display: flex;
  align-items: center;
  gap: 12rpx;
  flex-shrink: 0;
}

.forge-header__tool {
  position: relative;
  width: 58rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-header__tool-dot {
  position: absolute;
  top: 10rpx;
  right: 10rpx;
  width: 14rpx;
  height: 14rpx;
  border-radius: 50%;
  background: var(--up-primary, #2979ff);
}

.forge-header__action {
  width: 58rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 999rpx;
  background: linear-gradient(180deg, #2f7cf6 0%, #1f6ae5 100%);
  box-shadow: 0 12rpx 24rpx rgba(47, 124, 246, 0.22);
  flex-shrink: 0;
}

.forge-header__search :deep(.u-search__content) {
  border: none !important;
  border-radius: 24rpx !important;
  background-color: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6)) !important;
  box-shadow: none !important;
}

.forge-header__search :deep(.u-search__content__input) {
  font-size: 26rpx;
  color: var(--up-main-color, #303133);
}

.forge-header__tabs {
  border-radius: 22rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
  overflow: hidden;
}

.forge-header__summary {
  font-size: 21rpx;
  line-height: 1.5;
  color: var(--up-tips-color, #909193);
  padding: 0 4rpx;
}
</style>
