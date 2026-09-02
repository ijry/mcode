<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import {
  forgeMergeability,
  forgeMergeabilityText,
  forgeMergeBlocker,
  forgeMergeBlockerText,
  forgeMergeMethodHint,
  forgeMergeMethodLabel,
  forgeMergeMethods,
  forgeCheckSummary,
  forgeCheckSummaryText,
  forgeChecksState,
} from "../forgeChangePresentation"
import type { ForgeChangeDetail, ForgeMergeMethod, ForgeMergeOptions } from "@/types/forge"

/**
 * 合并确认弹层。
 *
 * 为什么这个要 sheet 而关闭/重开只用 `uni.showModal`：这里有一个**选择**（合并方式）
 * 和两条要读的信号（可合并性、检查项），系统模态装不下。
 *
 * ## headSha 的契约
 *
 * 页面在**打开这个弹层的那一刻**捕获 `head_sha` 并通过 `headSha` prop 传进来，确认时
 * 原样送出 —— 不在确认时重读。两个 forge 都把它当前置条件并在分支动过时以 409 拒绝，
 * 那正是要它的原因：面板是拿着一份 diff、一份文件表和一组检查项（都描述同一个提交）
 * 做的决定，一次静默落地了更新提交的合并会把那段对话里没人看过的代码合进去。
 *
 * 所以弹层开着时用户下拉刷新了详情，确认仍然按旧 sha 走 —— forge 会拒绝，那是正确的。
 */
const props = defineProps<{
  show: boolean
  detail: ForgeChangeDetail | null
  options: ForgeMergeOptions | null
  /** 打开弹层那一刻捕获的 head sha。`null` = 详情请求失败过，此时无保护地合并。 */
  headSha: string | null
  submitting?: boolean
  optionsLoading?: boolean
  errorText?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "confirm", method: ForgeMergeMethod): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/** 用户选的方式；`null` = 还没选，用 forge 给的默认。 */
const picked = ref<ForgeMergeMethod | null>(null)

watch(
  () => props.show,
  (show) => {
    // 每次打开都回到 forge 给的默认 —— 上一次的选择属于上一个变更。
    if (show) picked.value = null
  }
)

const methods = computed(() => (props.options ? forgeMergeMethods(props.options) : ["merge" as const]))
const activeMethod = computed<ForgeMergeMethod>(
  () => picked.value || props.options?.default_method || "merge"
)
const strategy = computed(() => props.options?.merge_strategy || "merge_commit")

const blocker = computed(() => (props.detail ? forgeMergeBlocker(props.detail) : "state"))
const blockerText = computed(() => forgeMergeBlockerText(blocker.value))
const mergeability = computed(() =>
  props.detail ? forgeMergeability(props.detail) : "unknown"
)

const checksSummaryText = computed(() => {
  const detail = props.detail
  if (!detail) return ""
  return forgeCheckSummaryText(
    forgeCheckSummary(detail.checks.checks),
    forgeChecksState(detail.checks)
  )
})

/**
 * 能不能点确认。
 *
 * `mergeable === null` **不禁用** —— 只有 forge 有资格说不，而它此刻还没算完。禁用
 * 意味着用户要反复下拉刷新直到它变绿；直接点下去最坏结果是一个 forge 给出的、准确的
 * 拒绝。
 */
const canConfirm = computed(() => !blocker.value && !props.submitting)

function closeSheet() {
  emit("update:show", false)
}

function handleConfirm() {
  if (!canConfirm.value) return
  emit("confirm", activeMethod.value)
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="forge-sheet" :style="upThemeCardStyle">
      <view class="forge-sheet__hd">
        <view class="forge-sheet__title-block">
          <text class="forge-sheet__title">合并这个变更</text>
          <text class="forge-sheet__desc">
            会立刻合并到 {{ props.detail?.base_ref || "目标分支" }}，所有关注的人都会看到。
          </text>
        </view>
        <view class="forge-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view scroll-y class="forge-sheet__body">
        <view class="forge-merge">
          <!-- 两条要读的信号：可合并性与检查项。它们不阻止合并（forge 才有资格说不），
               但用户在按下之前应该看到。 -->
          <view class="forge-sheet__group">
            <view class="forge-merge__signal">
              <text class="forge-merge__signal-label">可合并性</text>
              <text class="forge-merge__signal-value">{{ forgeMergeabilityText(mergeability) }}</text>
            </view>
            <view v-if="checksSummaryText" class="forge-merge__signal">
              <text class="forge-merge__signal-label">检查项</text>
              <text class="forge-merge__signal-value">{{ checksSummaryText }}</text>
            </view>
          </view>

          <view v-if="blockerText" class="forge-notice forge-notice--warning">
            <text class="forge-notice__text">{{ blockerText }}</text>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">合并方式</text>
            <view v-if="props.optionsLoading" class="forge-inline-loading">
              <up-loading-icon
                mode="circle"
                size="22"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-loading-icon>
              <text class="forge-inline-loading__text">正在读取仓库允许的方式...</text>
            </view>
            <template v-else>
              <view
                v-for="method in methods"
                :key="method"
                class="forge-option"
                :class="{ 'forge-option--active': method === activeMethod }"
                @click="picked = method"
              >
                <view class="forge-option__copy">
                  <text class="forge-option__title">{{ forgeMergeMethodLabel(method) }}</text>
                  <!-- `merge` 的说明取决于 merge_strategy：GitLab 的项目设置决定它是
                       合并提交、变基后合并还是快进，API 没有覆盖手段。 -->
                  <text class="forge-option__desc">
                    {{ forgeMergeMethodHint(method, strategy) }}
                  </text>
                </view>
                <up-icon
                  v-if="method === activeMethod"
                  name="checkmark"
                  size="18"
                  :color="upThemeVar('--up-primary', '#2979ff')"
                ></up-icon>
              </view>
              <!-- 只有一种可选且 forge 没说仓库允许什么时，说明这不是我们的选择。 -->
              <text v-if="props.options && props.options.methods.length === 0" class="forge-muted">
                当前账号读不到仓库的合并设置，只提供创建合并提交。
              </text>
            </template>
          </view>

          <!-- headSha 缺失时说清后果：那次合并没有「分支没动过」的保护。 -->
          <view v-if="!props.headSha" class="forge-notice forge-notice--warning">
            <text class="forge-notice__text">
              读不到当前的提交号，这次合并不会校验分支是否在你查看之后被改动过。
            </text>
          </view>

          <view v-if="props.errorText" class="forge-notice forge-notice--error">
            <text class="forge-notice__text">{{ props.errorText }}</text>
          </view>
        </view>
      </scroll-view>

      <view class="forge-sheet__ft">
        <view class="forge-sheet__btn forge-sheet__btn--ghost" @click="closeSheet">
          <text>取消</text>
        </view>
        <view
          class="forge-sheet__btn forge-sheet__btn--primary"
          :class="{ 'forge-sheet__btn--disabled': !canConfirm }"
          @click="handleConfirm"
        >
          <text>{{ props.submitting ? "合并中..." : "确认合并" }}</text>
        </view>
      </view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "@/pages/forge/index.scss";

.forge-merge {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding-bottom: 8rpx;
}

.forge-merge__signal {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 16rpx 20rpx;
  border-radius: 18rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-merge__signal-label {
  font-size: 22rpx;
  color: var(--up-tips-color, #909193);
  flex-shrink: 0;
}

.forge-merge__signal-value {
  font-size: 23rpx;
  color: var(--up-main-color, #303133);
  text-align: right;
  word-break: break-word;
}
</style>
