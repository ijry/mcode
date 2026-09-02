<script setup lang="ts">
import { computed, getCurrentInstance, ref, watch } from "vue"
import { forgeScenariosFor } from "../forgeScenario"
import {
  defaultForgePanelSettings,
  FORGE_PROMPT_SLOTS,
  ownForgeSettings,
  validateForgePrompts,
} from "@/services/forge/forgeSettingsApi"
import { FORGE_PROMPT_CAP } from "@/types/forge"
import type { ForgePanelSettings, ForgeScenarioId, ForgeSettingsStore } from "@/types/forge"

/**
 * 面板设置弹层。
 *
 * ## 作用域是整份替换，不是逐字段合并
 *
 * 一个项目一旦保存了自己的设置就**完全脱离**全局行。这条规则从任务设置照抄 —— 两个
 * 弹层在同一个面板上隔一次点击，学过「这个项目现在有自己的设置」的用户不该在另一个里
 * 遇到不同的算法。
 *
 * 所以这里有一个「来源」选择：跟随全局 / 独立配置。切到「跟随全局」并保存 = 发
 * `settings: null`（删掉那一行），**不是**把全局的值抄一份过去。
 *
 * 全局作用域下没有这个选择 —— 它后面没有东西可以回退（服务端会以 422 拒绝）。
 */
const props = defineProps<{
  show: boolean
  /** 全部作用域。弹层要用它区分「这个项目有自己的设置」与「在跟随全局」。 */
  store: ForgeSettingsStore | null
  /** 当前项目的 folder id。`0` = 编辑全局行（UI 哨兵值，转换在 service 层做）。 */
  folderId: number
  folderName: string
  saving?: boolean
  errorText?: string
}>()

const emit = defineEmits<{
  (event: "update:show", value: boolean): void
  (event: "save", payload: { folderId: number; settings: ForgePanelSettings | null }): void
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

/** 编辑哪个作用域。0 = 全局。 */
const scopeFolderId = ref(0)
/** 这个项目是「独立配置」还是「跟随全局」。全局作用域下恒为 true。 */
const custom = ref(true)
const draft = ref<ForgePanelSettings>(defaultForgePanelSettings())
const localError = ref("")

const canPickScope = computed(() => props.folderId > 0)
const isGlobalScope = computed(() => scopeFolderId.value <= 0)

watch(
  () => props.show,
  (show) => {
    if (!show) return
    // 默认编辑当前项目（如果有）—— 用户是从这个项目的面板点进来的。
    scopeFolderId.value = props.folderId
    resetDraftForScope()
    localError.value = ""
  }
)

watch(scopeFolderId, () => {
  resetDraftForScope()
})

/**
 * 按当前作用域重置表单。
 *
 * 项目作用域下：有自己的设置就装它（`custom = true`），没有就装**全局的值**作为起点
 * 但标为「跟随全局」—— 那样用户切到「独立配置」时表单里已经是他熟悉的值，而不是一片
 * 空白。
 */
function resetDraftForScope() {
  const store = props.store
  if (isGlobalScope.value) {
    custom.value = true
    draft.value = cloneSettings(store?.global || defaultForgePanelSettings())
    return
  }
  const own = ownForgeSettings(store, scopeFolderId.value)
  custom.value = Boolean(own)
  draft.value = cloneSettings(own || store?.global || defaultForgePanelSettings())
}

function cloneSettings(settings: ForgePanelSettings): ForgePanelSettings {
  return {
    default_issue_scenario: settings.default_issue_scenario,
    default_pr_scenario: settings.default_pr_scenario,
    writeback_default: settings.writeback_default,
    scenario_prompts: { ...settings.scenario_prompts },
  }
}

const issueOptions = computed(() => forgeScenariosFor("issue"))
const prOptions = computed(() => forgeScenariosFor("pr"))

/** 表单只在「独立配置」或全局作用域下可编辑 —— 跟随全局时改它没有意义。 */
const editable = computed(() => isGlobalScope.value || custom.value)

function promptOf(key: string) {
  return draft.value.scenario_prompts[key] || ""
}

function setPrompt(key: string, value: string) {
  draft.value.scenario_prompts = { ...draft.value.scenario_prompts, [key]: value }
  if (localError.value) localError.value = ""
}

/** 单个槽位是否超限 —— 打字时就撞到，而不是写完 4000 字之后被服务端告知。 */
function promptOver(key: string) {
  return promptOf(key).length > FORGE_PROMPT_CAP
}

function pickIssueScenario(id: ForgeScenarioId) {
  if (!editable.value) return
  // 再点一次已选的 = 取消（回到内置默认）。这是唯一能把它清回 null 的操作。
  draft.value.default_issue_scenario =
    draft.value.default_issue_scenario === id ? null : id
}

function pickPrScenario(id: ForgeScenarioId) {
  if (!editable.value) return
  draft.value.default_pr_scenario = draft.value.default_pr_scenario === id ? null : id
}

function closeSheet() {
  emit("update:show", false)
}

function handleSave() {
  if (props.saving) return
  // 切到「跟随全局」并保存 = 删掉这个项目自己那行，而不是抄一份全局的值过去。
  if (!isGlobalScope.value && !custom.value) {
    emit("save", { folderId: scopeFolderId.value, settings: null })
    return
  }
  const error = validateForgePrompts(draft.value.scenario_prompts)
  if (error) {
    localError.value = error
    return
  }
  emit("save", { folderId: scopeFolderId.value, settings: cloneSettings(draft.value) })
}
</script>

<template>
  <up-popup :show="props.show" mode="bottom" :round="28" @close="closeSheet">
    <view class="forge-sheet" :style="upThemeCardStyle">
      <view class="forge-sheet__hd">
        <view class="forge-sheet__title-block">
          <text class="forge-sheet__title">面板设置</text>
          <text class="forge-sheet__desc">
            决定「处理」弹层打开时预选什么，以及每个任务会带上的常驻提示词。
          </text>
        </view>
        <view class="forge-sheet__close" @click="closeSheet">
          <up-icon name="close" size="20" :color="upThemeVar('--up-tips-color', '#909193')"></up-icon>
        </view>
      </view>

      <scroll-view scroll-y class="forge-sheet__body">
        <view class="forge-settings">
          <view v-if="canPickScope" class="forge-sheet__group">
            <text class="forge-sheet__group-title">配置范围</text>
            <view
              class="forge-option"
              :class="{ 'forge-option--active': scopeFolderId === props.folderId }"
              @click="scopeFolderId = props.folderId"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">{{ props.folderName || "当前项目" }}</text>
                <text class="forge-option__desc">只影响这个项目。</text>
              </view>
              <up-icon
                v-if="scopeFolderId === props.folderId"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
            <view
              class="forge-option"
              :class="{ 'forge-option--active': isGlobalScope }"
              @click="scopeFolderId = 0"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">全部项目（全局默认）</text>
                <text class="forge-option__desc">未单独配置的项目都用这一份。</text>
              </view>
              <up-icon
                v-if="isGlobalScope"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
          </view>

          <!-- 「来源」只在项目作用域下出现：全局行后面没有东西可以回退。 -->
          <view v-if="!isGlobalScope" class="forge-sheet__group">
            <text class="forge-sheet__group-title">设置来源</text>
            <view
              class="forge-option"
              :class="{ 'forge-option--active': !custom }"
              @click="custom = false"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">跟随全局默认</text>
                <text class="forge-option__desc">全局改动会自动生效。</text>
              </view>
              <up-icon
                v-if="!custom"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
            <view
              class="forge-option"
              :class="{ 'forge-option--active': custom }"
              @click="custom = true"
            >
              <view class="forge-option__copy">
                <text class="forge-option__title">独立配置</text>
                <!-- 说清这是**整份**替换 —— 用户可能以为只有他改的那几项会覆盖。 -->
                <text class="forge-option__desc">
                  这个项目会整份使用下面的配置，不再跟随全局的任何一项。
                </text>
              </view>
              <up-icon
                v-if="custom"
                name="checkmark"
                size="18"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
          </view>

          <view class="forge-settings__form" :class="{ 'forge-settings__form--locked': !editable }">
            <view class="forge-sheet__group">
              <text class="forge-sheet__group-title">Issue 默认处理方式</text>
              <view
                v-for="option in issueOptions"
                :key="option.id"
                class="forge-option"
                :class="{ 'forge-option--active': option.id === draft.default_issue_scenario }"
                @click="pickIssueScenario(option.id)"
              >
                <view class="forge-option__copy">
                  <text class="forge-option__title">{{ option.label }}</text>
                </view>
                <up-icon
                  v-if="option.id === draft.default_issue_scenario"
                  name="checkmark"
                  size="18"
                  :color="upThemeVar('--up-primary', '#2979ff')"
                ></up-icon>
              </view>
              <text class="forge-muted">不选则使用内置默认（直接修复 / 实现）。</text>
            </view>

            <view class="forge-sheet__group">
              <text class="forge-sheet__group-title">PR / MR 默认处理方式</text>
              <view
                v-for="option in prOptions"
                :key="option.id"
                class="forge-option"
                :class="{ 'forge-option--active': option.id === draft.default_pr_scenario }"
                @click="pickPrScenario(option.id)"
              >
                <view class="forge-option__copy">
                  <text class="forge-option__title">{{ option.label }}</text>
                </view>
                <up-icon
                  v-if="option.id === draft.default_pr_scenario"
                  name="checkmark"
                  size="18"
                  :color="upThemeVar('--up-primary', '#2979ff')"
                ></up-icon>
              </view>
              <text class="forge-muted">不选则使用内置默认（评审并修复）。</text>
            </view>

            <view class="forge-sheet__group">
              <view class="forge-settings__switch">
                <view class="forge-option__copy">
                  <text class="forge-option__title">默认回写评论</text>
                  <!-- 只是初始状态：开关每次都在屏幕上，按创建时它是什么才是记进任务的值。 -->
                  <text class="forge-option__desc">
                    只是「处理」弹层里那个开关的初始状态，每条工作项仍可单独改。
                  </text>
                </view>
                <up-switch
                  v-model="draft.writeback_default"
                  size="20"
                  :disabled="!editable"
                  :activeColor="upThemeVar('--up-primary', '#2979ff')"
                ></up-switch>
              </view>
            </view>

            <view class="forge-sheet__group">
              <text class="forge-sheet__group-title">常驻提示词</text>
              <text class="forge-muted">
                会拼在场景自带的指令之后、你在「处理」弹层里写的补充说明之前。
              </text>
              <view v-for="slot in FORGE_PROMPT_SLOTS" :key="slot.key" class="forge-settings__prompt">
                <text class="forge-settings__prompt-label">{{ slot.label }}</text>
                <text class="forge-muted">{{ slot.hint }}</text>
                <up-textarea
                  :modelValue="promptOf(slot.key)"
                  placeholder="例如：回复中先给出一句结论"
                  :maxlength="-1"
                  :height="90"
                  :disabled="!editable"
                  border="surround"
                  @update:modelValue="setPrompt(slot.key, $event)"
                ></up-textarea>
                <text v-if="promptOver(slot.key)" class="forge-settings__prompt-over">
                  超出 {{ promptOf(slot.key).length - FORGE_PROMPT_CAP }} 字
                </text>
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
          :class="{ 'forge-sheet__btn--disabled': props.saving }"
          @click="handleSave"
        >
          <text>{{ props.saving ? "保存中..." : "保存" }}</text>
        </view>
      </view>
    </view>
  </up-popup>
</template>

<style scoped lang="scss">
@import "../index.scss";

.forge-settings {
  display: flex;
  flex-direction: column;
  gap: 26rpx;
  padding-bottom: 8rpx;
}

.forge-settings__form {
  display: flex;
  flex-direction: column;
  gap: 26rpx;
}

/* 跟随全局时表单只读：改它没有意义，但仍然显示（那是用户会得到的值）。 */
.forge-settings__form--locked {
  opacity: 0.5;
}

.forge-settings__switch {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16rpx;
  padding: 20rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.forge-settings__prompt {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.forge-settings__prompt-label {
  font-size: 24rpx;
  font-weight: 600;
  color: var(--up-main-color, #303133);
}

.forge-settings__prompt-over {
  font-size: 20rpx;
  color: var(--up-error, #fa3534);
}
</style>
