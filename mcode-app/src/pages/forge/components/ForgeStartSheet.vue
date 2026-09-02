<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import {
  forgeScenariosFor,
  forgeStandingPrompt,
  initialForgeScenario,
} from "../forgeScenario"
import type {
  ForgeCreateResult,
  ForgeIssueRow,
  ForgeItemKind,
  ForgePanelSettings,
  ForgeScenarioId,
} from "@/types/forge"

/**
 * 「处理成任务」弹层。
 *
 * 客户端只挑一个**场景名** —— 提示词文本 100% 由服务端合成（见
 * `commands/forge.rs` 的信任边界）。所以这里没有「编辑提示词」，只有：
 * 场景单选 + 补充说明 + 回写开关 + 只读的内容预览。
 *
 * ## 两个「答案」分支
 *
 * `duplicate` 与 `folder_mismatch` 不是错误而是答案，弹层要就地变形而不是弹一个 toast：
 * - **duplicate** → 「查看已有任务 / 仍要新建」两个出口；
 * - **folder_mismatch** → 说清当前文件夹的远端是什么，要求换项目（服务端硬门禁，
 *   不是 UI 提示）。
 */
const props = defineProps<{
  show: boolean
  row: ForgeIssueRow | null
  kind: ForgeItemKind
  /** 生效的面板设置（文件夹自己那份，否则全局）—— 决定预选哪个场景与回写默认值。 */
  settings: ForgePanelSettings | null
  submitting?: boolean
  /** 服务端返回的答案。`created` 由页面关掉弹层，这里只处理另两种。 */
  result: ForgeCreateResult | null
  errorText?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (
    event: "submit",
    payload: { scenario: ForgeScenarioId; instruction: string | null; writeback: boolean; force: boolean }
  ): void
  (event: "openExistingTask", taskId: number): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const scenario = ref<ForgeScenarioId>("fix")
const instruction = ref("")
const writeback = ref(true)
const showPreview = ref(false)

watch(
  () => props.show,
  (show) => {
    if (!show) return
    // 每次打开都从设置重新算 —— 上一次的选择属于上一个工作项。
    scenario.value = initialForgeScenario(props.kind, props.settings)
    instruction.value = ""
    // 回写默认值由面板设置给（`writeback_default`，内置默认 true）。它只是**初始状态**：
    // 开关每次都在屏幕上，用户按创建时它是什么才是记进任务的值。
    writeback.value = props.settings?.writeback_default !== false
    showPreview.value = false
  }
)

const options = computed(() => forgeScenariosFor(props.kind))
const standingPrompt = computed(() => forgeStandingPrompt(scenario.value, props.settings))

const duplicateTask = computed(() =>
  props.result?.outcome === "duplicate" ? props.result.existing : null
)
const mismatchRemote = computed(() =>
  props.result?.outcome === "folder_mismatch" ? props.result.folder_remote : null
)

/** 工作项内容预览 —— 就是会被 untrusted-data 信封包住送给 agent 的那部分。 */
const previewText = computed(() => {
  const row = props.row
  if (!row) return ""
  const lines = [`标题：${row.title}`]
  if (row.labels.length > 0) lines.push(`标签：${row.labels.map((l) => l.name).join(", ")}`)
  if (row.author) lines.push(`作者：${row.author}`)
  if (row.body) lines.push("", row.body)
  return lines.join("\n")
})

function closeSheet() {
  emit("update:show", false)
}

function submit(force: boolean) {
  if (props.submitting) return
  emit("submit", {
    scenario: scenario.value,
    // 空说明送 null 而不是空串 —— 服务端把空串当成「用户写了个空的」并会为它拼一段
    // 空的 note 段落。
    instruction: instruction.value.trim() || null,
    writeback: writeback.value,
    force,
  })
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="forge-sheet" :style="upThemeCardStyle">
      <view class="forge-sheet__hd">
        <view class="forge-sheet__title-block">
          <text class="forge-sheet__title">处理这个工作项</text>
          <text class="forge-sheet__desc">
            会在这个项目对应的文件夹下创建一个后台任务，在独立工作区里执行。
          </text>
        </view>
        <view class="forge-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view scroll-y class="forge-sheet__body">
        <view class="forge-start">
          <!-- 仓库不匹配是服务端的硬门禁，不是提示 —— 说清当前文件夹的远端是什么。 -->
          <view v-if="props.result?.outcome === 'folder_mismatch'" class="forge-notice forge-notice--error">
            <text class="forge-notice__text">
              当前项目的远端是
              {{ mismatchRemote ? mismatchRemote.owner_repo : "另一个仓库（读不到）" }}，
              与这个工作项所在的仓库不一致。请切换到匹配的项目后再处理。
            </text>
          </view>

          <!-- 重复不是错误：给两个出口，让用户自己决定。 -->
          <view v-else-if="duplicateTask" class="forge-notice forge-notice--warning">
            <text class="forge-notice__text">
              这个工作项已经有一个进行中的任务「{{ duplicateTask.title || `任务 #${duplicateTask.id}` }}」。
            </text>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">处理方式</text>
            <view
              v-for="option in options"
              :key="option.id"
              class="forge-option"
              :class="{ 'forge-option--active': option.id === scenario }"
              @click="scenario = option.id"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">{{ option.label }}</text>
                <text class="forge-option__desc">{{ option.hint }}</text>
              </view>
              <up-icon
                v-if="option.id === scenario"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
          </view>

          <!-- 常驻提示词是设置里配的，这里只读显示 —— 让用户知道任务还会带上什么。 -->
          <view v-if="standingPrompt" class="forge-sheet__group">
            <text class="forge-sheet__group-title">常驻提示词</text>
            <view class="forge-start__preview">
              <text class="forge-start__preview-text">{{ standingPrompt }}</text>
            </view>
          </view>

          <view class="forge-sheet__group">
            <text class="forge-sheet__group-title">补充说明（可选）</text>
            <up-textarea
              v-model="instruction"
              placeholder="想额外交代的事，比如「只改前端」"
              :maxlength="-1"
              :height="100"
              border="surround"
            ></up-textarea>
          </view>

          <view class="forge-sheet__group">
            <view class="forge-start__switch">
              <view class="forge-option__copy">
                <text class="forge-option__title">完成后回写评论</text>
                <text class="forge-option__desc">
                  任务结束后在这个工作项下发一条评论，说明做了什么。
                </text>
              </view>
              <up-switch
                v-model="writeback"
                size="20"
                :activeColor="upThemeVar('--up-primary', '#2979ff')"
              ></up-switch>
            </view>
          </view>

          <view class="forge-sheet__group">
            <view class="forge-start__preview-toggle" @click="showPreview = !showPreview">
              <text class="forge-sheet__group-title">预览任务会携带的内容</text>
              <up-icon
                :name="showPreview ? 'arrow-up' : 'arrow-down'"
                size="14"
                :color="upThemeVar('--up-tips-color', '#c0c4cc')"
              ></up-icon>
            </view>
            <view v-if="showPreview" class="forge-start__preview">
              <text class="forge-start__preview-text">{{ previewText || "（没有内容）" }}</text>
            </view>
          </view>

          <view v-if="props.errorText" class="forge-notice forge-notice--error">
            <text class="forge-notice__text">{{ props.errorText }}</text>
          </view>
        </view>
      </scroll-view>

      <!-- duplicate 时底部换成两个出口。 -->
      <view v-if="duplicateTask" class="forge-sheet__ft">
        <view
          class="forge-sheet__btn forge-sheet__btn--ghost"
          @click="emit('openExistingTask', duplicateTask.id)"
        >
          <text>查看已有任务</text>
        </view>
        <view class="forge-sheet__btn forge-sheet__btn--primary" @click="submit(true)">
          <text>{{ props.submitting ? "创建中..." : "仍要新建" }}</text>
        </view>
      </view>

      <view v-else class="forge-sheet__ft">
        <view class="forge-sheet__btn forge-sheet__btn--ghost" @click="closeSheet">
          <text>取消</text>
        </view>
        <view
          class="forge-sheet__btn forge-sheet__btn--primary"
          :class="{ 'forge-sheet__btn--disabled': props.submitting }"
          @click="submit(false)"
        >
          <text>{{ props.submitting ? "创建中..." : "创建任务" }}</text>
        </view>
      </view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.forge-start {
  display: flex;
  flex-direction: column;
  gap: 24rpx;
  padding-bottom: 8rpx;
}

.forge-start__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-start__preview-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.forge-start__preview {
  padding: 18rpx;
  border-radius: 18rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  max-height: 400rpx;
  overflow: hidden;
}

.forge-start__preview-text {
  font-size: 21rpx;
  line-height: 1.6;
  color: var(--up-content-color, #606266);
  word-break: break-word;
}
</style>
