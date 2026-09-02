<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import ForgeLabelChip from "./ForgeLabelChip.vue"
import {
  FORGE_MAX_ISSUE_LABELS,
  FORGE_MAX_TITLE_CHARS,
  FORGE_MAX_COMMENT_CHARS,
  type ForgeLabel,
} from "@/types/forge"

/**
 * 新建 issue。
 *
 * 三个上限都**在提交前拦**（标题 255 / 正文 65536 / 标签 50）：服务端也会拒，但那要
 * 花一次往返，而且返回的是一句用户没法照着改的 422。
 *
 * 标题超长时**不截断**而是拦住 —— 悄悄发出去半个标题比告诉他太长更糟。
 *
 * 失败显示在弹层内部而不是 toast：模态背后弹出的 toast 是用户唯一读不到的消息，
 * 而这里他刚写了一段可能很长的正文。
 */
const props = defineProps<{
  show: boolean
  /** 仓库的标签词汇表（页面切仓库时拉一次并缓存）。 */
  labelOptions: ForgeLabel[]
  submitting?: boolean
  errorText?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "submit", payload: { title: string; body: string | null; labels: string[] }): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const title = ref("")
const body = ref("")
const labels = ref<string[]>([])
const localError = ref("")

watch(
  () => props.show,
  (show) => {
    if (show) return
    // 关闭时清空：一个留着上次内容的新建表单会让人以为草稿被保存了，而它并没有。
    title.value = ""
    body.value = ""
    labels.value = []
    localError.value = ""
  }
)

const selected = computed(() => new Set(labels.value))
const titleRemaining = computed(() => FORGE_MAX_TITLE_CHARS - title.value.trim().length)
const titleOver = computed(() => titleRemaining.value < 0)
const bodyOver = computed(() => body.value.trim().length > FORGE_MAX_COMMENT_CHARS)
const atLabelLimit = computed(() => labels.value.length >= FORGE_MAX_ISSUE_LABELS)

const canSubmit = computed(
  () =>
    title.value.trim().length > 0 && !titleOver.value && !bodyOver.value && !props.submitting
)

function closeSheet() {
  emit("update:show", false)
}

function toggleLabel(name: string) {
  const next = new Set(labels.value)
  if (next.has(name)) {
    next.delete(name)
  } else {
    if (atLabelLimit.value) {
      uni.showToast({ title: `最多打 ${FORGE_MAX_ISSUE_LABELS} 个标签`, icon: "none" })
      return
    }
    next.add(name)
  }
  labels.value = Array.from(next)
}

function handleSubmit() {
  const trimmedTitle = title.value.trim()
  if (!trimmedTitle) {
    localError.value = "标题不能为空。"
    return
  }
  if (titleOver.value) {
    localError.value = `标题超过 ${FORGE_MAX_TITLE_CHARS} 字，请缩短。`
    return
  }
  if (bodyOver.value) {
    localError.value = `描述超过 ${FORGE_MAX_COMMENT_CHARS} 字，请缩短。`
    return
  }
  if (!canSubmit.value) return
  const trimmedBody = body.value.trim()
  emit("submit", {
    title: trimmedTitle,
    // 空描述送 null 而不是空串：GitHub 把空串存成正文，条目会渲染出一个空的描述块
    // 而不是什么都不渲染。
    body: trimmedBody || null,
    labels: labels.value,
  })
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="forge-sheet" :style="upThemeCardStyle">
      <view class="forge-sheet__hd">
        <view class="forge-sheet__title-block">
          <text class="forge-sheet__title">新建 Issue</text>
          <text class="forge-sheet__desc">
            会立刻在远端仓库创建，所有能访问该仓库的人都能看到。
          </text>
        </view>
        <view class="forge-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view scroll-y class="forge-sheet__body">
        <view class="forge-new-issue">
          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">标题</text>
            <up-input
              v-model="title"
              placeholder="发生了什么问题？"
              border="surround"
              clearable
            ></up-input>
            <!-- 接近上限才显示计数：一个常驻的「还剩 248 字」是噪音。 -->
            <text
              v-if="titleRemaining < 40"
              class="forge-new-issue__count"
              :class="{ 'forge-new-issue__count--over': titleOver }"
            >{{ titleOver ? `超出 ${-titleRemaining} 字` : `还剩 ${titleRemaining} 字` }}</text>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">描述</text>
            <up-textarea
              v-model="body"
              placeholder="可选：复现步骤、预期结果、实际结果（支持 Markdown）"
              :maxlength="-1"
              :height="160"
              border="surround"
            ></up-textarea>
          </view>

          <view v-if="props.labelOptions.length > 0" class="forge-sheet__group">
            <text class="forge-sheet__group-title">
              标签{{ labels.length > 0 ? `（已选 ${labels.length}）` : "" }}
            </text>
            <view class="forge-new-issue__labels">
              <view
                v-for="label in props.labelOptions"
                :key="label.name"
                class="forge-new-issue__label"
                :class="{
                  'forge-new-issue__label--active': selected.has(label.name),
                  'forge-new-issue__label--disabled': atLabelLimit && !selected.has(label.name),
                }"
                @click="toggleLabel(label.name)"
              >
                <ForgeLabelChip :label="label" />
                <up-icon
                  v-if="selected.has(label.name)"
                  name="checkmark"
                  size="14"
                  :color="upThemeVar('--up-primary', '#2979ff')"
                ></up-icon>
              </view>
            </view>
          </view>

          <view v-if="localError" class="forge-notice forge-notice--warning">
            <text class="forge-notice__text">{{ localError }}</text>
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
          :class="{ 'forge-sheet__btn--disabled': !canSubmit }"
          @click="handleSubmit"
        >
          <text>{{ props.submitting ? "创建中..." : "创建 Issue" }}</text>
        </view>
      </view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.forge-new-issue {
  display: flex;
  flex-direction: column;
  gap: 26rpx;
  padding-bottom: 8rpx;
}

.forge-new-issue__count {
  font-size: 20rpx;
  color: var(--up-tips-color, #909193);
}

.forge-new-issue__count--over {
  color: var(--up-error, #fa3534);
}

.forge-new-issue__labels {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12rpx;
}

.forge-new-issue__label {
  display: flex;
  align-items: center;
  gap: 6rpx;
  padding: 6rpx 10rpx;
  border-radius: 999rpx;
  border: 1rpx solid transparent;
}

.forge-new-issue__label--active {
  border-color: var(--up-primary, #2979ff);
}

.forge-new-issue__label--disabled {
  opacity: 0.4;
}
</style>
