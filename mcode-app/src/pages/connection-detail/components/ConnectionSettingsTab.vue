<template>
  <view class="connection-settings-tab">
    <view v-if="resolveError" class="settings-state settings-state--error" :style="upThemeCardStyle">
      <text class="settings-state__title">连接不可用</text>
      <text class="settings-state__text">{{ resolveError }}</text>
    </view>

    <view
      v-for="group in settingsGroups"
      :key="group.title"
      class="settings-group"
      :style="upThemeCardStyle"
    >
      <text class="settings-group__title">{{ group.title }}</text>
      <view class="settings-list">
        <view
          v-for="row in group.rows"
          :key="row.key"
          class="settings-row"
          @click="openPanel(row.key)"
        >
          <view class="settings-row__icon">
            <up-icon :name="rowIcon(row.key)" size="18" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
          </view>
          <view class="settings-row__body">
            <text class="settings-row__label">{{ row.label }}</text>
            <text v-if="row.value" class="settings-row__value">{{ row.value }}</text>
          </view>
          <up-icon name="arrow-right" size="16" color="#c0c4cc"></up-icon>
        </view>
      </view>
    </view>

    <up-popup v-model:show="showPanel" mode="bottom" :round="28">
      <view class="settings-panel" :style="upThemeCardStyle">
        <view class="settings-panel__head">
          <view class="settings-panel__copy">
            <text class="settings-panel__title">{{ panelTitle }}</text>
            <text class="settings-panel__desc">{{ panelDesc }}</text>
          </view>
          <up-icon name="close" size="20" color="#909193" @click="showPanel = false"></up-icon>
        </view>

        <view v-if="activePanel === 'appearance'" class="panel-section">
          <view class="appearance-grid">
            <view
              v-for="option in accentOptions"
              :key="option.value"
              class="appearance-swatch"
              :class="{ 'appearance-swatch--active': option.value === 'blue' }"
            >
              <view class="appearance-swatch__dot" :style="{ background: accentColor(option.value) }"></view>
              <text>{{ option.label }}</text>
            </view>
          </view>
          <view class="panel-notice">
            <text>
              桌面端强调色目前是 codeg-main 前端本地偏好，P57 只展示映射选项；远程修改需要桌面端新增偏好命令。
            </text>
          </view>
        </view>

        <view v-else-if="activePanel === 'language'" class="panel-section">
          <view v-if="languageLoading" class="panel-loading">
            <up-loading-icon mode="circle" size="24" color="#2979ff"></up-loading-icon>
            <text>正在读取语言设置...</text>
          </view>
          <view v-else-if="languageError" class="panel-error">
            <text>{{ languageError }}</text>
          </view>
          <view v-else class="option-list">
            <view
              v-for="option in languageOptions"
              :key="option.value"
              class="option-row"
              :class="{ 'option-row--active': currentLanguageValue === option.value }"
              @click="applyLanguage(option.value)"
            >
              <view class="option-row__body">
                <text class="option-row__label">{{ option.label }}</text>
                <text class="option-row__value">{{ option.desc }}</text>
              </view>
              <up-icon
                v-if="currentLanguageValue === option.value"
                name="checkmark"
                size="16"
                :color="upThemeVar('--up-primary', '#2979ff')"
              ></up-icon>
            </view>
          </view>
        </view>

        <view v-else-if="activePanel === 'general'" class="panel-section">
          <view v-if="generalLoading" class="panel-loading">
            <up-loading-icon mode="circle" size="24" color="#2979ff"></up-loading-icon>
            <text>正在读取通用设置...</text>
          </view>

          <view class="subsection-card">
            <view class="subsection-card__head">
              <view>
                <text class="subsection-card__title">委派</text>
                <text class="subsection-card__desc">{{ delegationAgentDefaultText }}</text>
              </view>
              <view
                class="settings-toggle"
                :class="{ 'settings-toggle--on': delegationForm.enabled }"
                @click="delegationForm.enabled = !delegationForm.enabled"
              >
                <text>{{ delegationForm.enabled ? "启用" : "停用" }}</text>
              </view>
            </view>
            <view v-if="delegationError" class="panel-error">
              <text>{{ delegationError }}</text>
            </view>
            <view v-else class="form-grid">
              <view class="form-field">
                <text class="form-label">深度限制</text>
                <up-input v-model="delegationForm.depthLimit" type="number" border="surround"></up-input>
              </view>
              <view class="form-field">
                <text class="form-label">完成缓存 MB</text>
                <up-input v-model="delegationForm.cacheMb" type="number" border="surround"></up-input>
              </view>
              <up-button type="primary" size="small" :loading="delegationSaving" @click="saveDelegation">
                保存委派
              </up-button>
            </view>
          </view>

          <view class="subsection-card">
            <view class="subsection-card__head">
              <view>
                <text class="subsection-card__title">对话工具</text>
                <text class="subsection-card__desc">反馈与提问工具开关</text>
              </view>
            </view>
            <view v-if="toolError" class="panel-error">
              <text>{{ toolError }}</text>
            </view>
            <view v-else class="tool-list">
              <view class="tool-row">
                <view class="tool-row__body">
                  <text class="tool-row__title">反馈工具</text>
                  <text class="tool-row__desc">允许会话内提交反馈</text>
                </view>
                <view
                  class="settings-toggle"
                  :class="{ 'settings-toggle--on': feedbackSettings.enabled }"
                  @click="toggleFeedback"
                >
                  <text>{{ feedbackSettings.enabled ? "启用" : "停用" }}</text>
                </view>
              </view>
              <view class="tool-row">
                <view class="tool-row__body">
                  <text class="tool-row__title">提问工具</text>
                  <text class="tool-row__desc">允许智能体向用户追问</text>
                </view>
                <view
                  class="settings-toggle"
                  :class="{ 'settings-toggle--on': questionSettings.enabled }"
                  @click="toggleQuestion"
                >
                  <text>{{ questionSettings.enabled ? "启用" : "停用" }}</text>
                </view>
              </view>
            </view>
          </view>
        </view>

        <view v-else-if="activePanel === 'quickMessages'" class="panel-section">
          <view v-if="quickLoading" class="panel-loading">
            <up-loading-icon mode="circle" size="24" color="#2979ff"></up-loading-icon>
            <text>正在读取快捷消息...</text>
          </view>
          <view v-if="quickError" class="panel-error">
            <text>{{ quickError }}</text>
          </view>
          <view v-else class="quick-layout">
            <view class="quick-form">
              <text class="form-label">{{ quickForm.id ? "编辑快捷消息" : "新增快捷消息" }}</text>
              <up-input v-model="quickForm.title" placeholder="标题" border="surround"></up-input>
              <up-textarea
                v-model="quickForm.content"
                placeholder="消息内容"
                autoHeight
                :maxlength="4000"
              ></up-textarea>
              <view class="quick-form__actions">
                <up-button v-if="quickForm.id" plain size="small" @click="resetQuickForm">取消编辑</up-button>
                <up-button type="primary" size="small" :loading="quickSaving" @click="saveQuickMessage">
                  保存
                </up-button>
              </view>
            </view>

            <view class="quick-list">
              <view v-if="quickMessages.length === 0" class="quick-empty">
                <text>暂无快捷消息。</text>
              </view>
              <view
                v-for="message in quickMessages"
                :key="message.id"
                class="quick-row"
                @click="editQuickMessage(message)"
              >
                <view class="quick-row__body">
                  <text class="quick-row__title">{{ message.title || "未命名快捷消息" }}</text>
                  <text class="quick-row__content">{{ message.content }}</text>
                </view>
                <view class="quick-row__delete" @click.stop="deleteQuickMessage(message.id)">
                  <up-icon name="trash" size="16" :color="upThemeVar('--up-error', '#fa3534')"></up-icon>
                </view>
              </view>
            </view>
          </view>
        </view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, reactive, ref, watch } from "vue"
import type { CodegGateway } from "@/services/gateway"
import {
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  createRemoteQuickMessage,
  deleteRemoteQuickMessage,
  getRemoteDelegationSettings,
  getRemoteFeedbackSettings,
  getRemoteLanguageSettings,
  getRemoteQuestionSettings,
  isUnsupportedSettingsCommand,
  listRemoteQuickMessages,
  setRemoteDelegationSettings,
  setRemoteFeedbackSettings,
  setRemoteQuestionSettings,
  updateRemoteLanguageSettings,
  updateRemoteQuickMessage,
  type AppLocale,
  type BooleanToolSettings,
  type DelegationSettings,
  type QuickMessage,
  type SystemLanguageSettings,
} from "@/services/connectionDetailSettings"
import {
  buildSettingsRows,
  getAppearanceAccentOptions,
} from "../connectionDetailPresentation"

type SettingsPanelKey = "appearance" | "language" | "general" | "quickMessages"
type LanguageOptionValue = "system" | AppLocale

const props = defineProps<{
  connection: ConnectionContext | null
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (varName: string, fallbackColor?: string) =>
  currentInstance?.proxy?.upThemeVar?.(varName, fallbackColor) ?? (fallbackColor || "")

const gateway = ref<CodegGateway | null>(null)
const resolving = ref(false)
const resolveError = ref("")
const showPanel = ref(false)
const activePanel = ref<SettingsPanelKey>("appearance")
const settingsGroups = buildSettingsRows()
const accentOptions = getAppearanceAccentOptions()

const languageLoading = ref(false)
const languageSaving = ref(false)
const languageError = ref("")
const languageSettings = ref<SystemLanguageSettings>({ mode: "system", language: "en" })
const languageOptions: Array<{ value: LanguageOptionValue; label: string; desc: string }> = [
  { value: "system", label: "跟随系统", desc: "使用桌面端系统语言" },
  { value: "en", label: "English", desc: "en" },
  { value: "zh_cn", label: "简体中文", desc: "zh_cn" },
  { value: "zh_tw", label: "繁体中文", desc: "zh_tw" },
  { value: "ja", label: "日本語", desc: "ja" },
  { value: "ko", label: "한국어", desc: "ko" },
  { value: "es", label: "Español", desc: "es" },
  { value: "de", label: "Deutsch", desc: "de" },
  { value: "fr", label: "Français", desc: "fr" },
  { value: "pt", label: "Português", desc: "pt" },
  { value: "ar", label: "العربية", desc: "ar" },
]

const generalLoading = ref(false)
const delegationSaving = ref(false)
const delegationError = ref("")
const toolError = ref("")
const delegationSettings = ref<DelegationSettings | null>(null)
const delegationForm = reactive({
  enabled: false,
  depthLimit: "1",
  cacheMb: "0",
})
const feedbackSettings = reactive<BooleanToolSettings>({ enabled: false })
const questionSettings = reactive<BooleanToolSettings>({ enabled: false })

const quickLoading = ref(false)
const quickSaving = ref(false)
const quickError = ref("")
const quickMessages = ref<QuickMessage[]>([])
const quickForm = reactive({
  id: 0,
  title: "",
  content: "",
})

const currentLanguageValue = computed<LanguageOptionValue>(() =>
  languageSettings.value.mode === "system" ? "system" : languageSettings.value.language
)
const panelTitle = computed(() => {
  if (activePanel.value === "appearance") return "外观"
  if (activePanel.value === "language") return "语言"
  if (activePanel.value === "general") return "通用"
  return "快捷消息"
})
const panelDesc = computed(() => {
  if (activePanel.value === "appearance") return "桌面端强调色映射"
  if (activePanel.value === "language") return "同步 codeg-main 系统语言设置"
  if (activePanel.value === "general") return "委派与对话工具"
  return "管理桌面端快捷消息"
})
const delegationAgentDefaultText = computed(() => {
  const defaults = delegationSettings.value?.agent_defaults || {}
  const count = Object.keys(defaults).length
  return count > 0 ? `已配置 ${count} 个智能体默认值` : "编辑 enabled、深度限制与完成缓存"
})

watch(
  () => props.connection,
  () => {
    gateway.value = null
    resolveError.value = ""
  }
)

async function ensureGateway() {
  if (gateway.value) return gateway.value
  if (!props.connection) throw new Error("缺少连接信息")
  resolving.value = true
  resolveError.value = ""
  try {
    const resolved = await resolveConnectionContext(props.connection)
    persistResolvedConnection(resolved.connection)
    gateway.value = resolved.gateway
    return resolved.gateway
  } catch (error) {
    resolveError.value = toErrorMessage(error)
    throw error
  } finally {
    resolving.value = false
  }
}

function openPanel(key: string) {
  activePanel.value = key as SettingsPanelKey
  showPanel.value = true
  if (key === "language") void loadLanguage()
  if (key === "general") void loadGeneral()
  if (key === "quickMessages") void loadQuickMessages()
}

function rowIcon(key: string) {
  if (key === "appearance") return "setting"
  if (key === "language") return "chat"
  if (key === "general") return "grid"
  return "bookmark"
}

function accentColor(value: string) {
  const colors: Record<string, string> = {
    neutral: "#525252",
    zinc: "#71717a",
    slate: "#475569",
    stone: "#78716c",
    gray: "#6b7280",
    red: "#ef4444",
    rose: "#f43f5e",
    orange: "#f97316",
    green: "#22c55e",
    blue: "#2979ff",
    yellow: "#eab308",
    violet: "#8b5cf6",
  }
  return colors[value] || "#2979ff"
}

async function loadLanguage() {
  languageLoading.value = true
  languageError.value = ""
  try {
    languageSettings.value = await getRemoteLanguageSettings(await ensureGateway())
  } catch (error) {
    languageError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  } finally {
    languageLoading.value = false
  }
}

async function applyLanguage(value: LanguageOptionValue) {
  if (languageSaving.value) return
  languageSaving.value = true
  languageError.value = ""
  try {
    const next =
      value === "system"
        ? { mode: "system" as const, language: languageSettings.value.language }
        : { mode: "manual" as const, language: value }
    languageSettings.value = await updateRemoteLanguageSettings(await ensureGateway(), next)
    uni.showToast({ title: "语言设置已保存", icon: "success" })
  } catch (error) {
    languageError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  } finally {
    languageSaving.value = false
  }
}

async function loadGeneral() {
  generalLoading.value = true
  delegationError.value = ""
  toolError.value = ""
  try {
    await Promise.all([loadDelegation(), loadConversationTools()])
  } finally {
    generalLoading.value = false
  }
}

async function loadDelegation() {
  try {
    const settings = await getRemoteDelegationSettings(await ensureGateway())
    delegationSettings.value = settings
    delegationForm.enabled = settings.enabled
    delegationForm.depthLimit = String(settings.depth_limit)
    delegationForm.cacheMb = String(settings.completed_cache_max_mb)
  } catch (error) {
    delegationError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  }
}

async function loadConversationTools() {
  try {
    const gateway = await ensureGateway()
    const [feedback, question] = await Promise.all([
      getRemoteFeedbackSettings(gateway),
      getRemoteQuestionSettings(gateway),
    ])
    feedbackSettings.enabled = feedback.enabled
    questionSettings.enabled = question.enabled
  } catch (error) {
    toolError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  }
}

async function saveDelegation() {
  if (delegationSaving.value) return
  delegationSaving.value = true
  delegationError.value = ""
  try {
    const settings = await setRemoteDelegationSettings(await ensureGateway(), {
      enabled: delegationForm.enabled,
      depth_limit: toBoundedInt(delegationForm.depthLimit, 1, 8, 1),
      completed_cache_max_mb: Math.max(0, toBoundedInt(delegationForm.cacheMb, 0, 102400, 0)),
    })
    delegationSettings.value = settings
    delegationForm.enabled = settings.enabled
    delegationForm.depthLimit = String(settings.depth_limit)
    delegationForm.cacheMb = String(settings.completed_cache_max_mb)
    uni.showToast({ title: "委派设置已保存", icon: "success" })
  } catch (error) {
    delegationError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  } finally {
    delegationSaving.value = false
  }
}

async function toggleFeedback() {
  const previous = feedbackSettings.enabled
  feedbackSettings.enabled = !previous
  try {
    const applied = await setRemoteFeedbackSettings(await ensureGateway(), {
      enabled: feedbackSettings.enabled,
    })
    feedbackSettings.enabled = applied.enabled
  } catch (error) {
    feedbackSettings.enabled = previous
    toolError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  }
}

async function toggleQuestion() {
  const previous = questionSettings.enabled
  questionSettings.enabled = !previous
  try {
    const applied = await setRemoteQuestionSettings(await ensureGateway(), {
      enabled: questionSettings.enabled,
    })
    questionSettings.enabled = applied.enabled
  } catch (error) {
    questionSettings.enabled = previous
    toolError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  }
}

async function loadQuickMessages() {
  quickLoading.value = true
  quickError.value = ""
  try {
    const messages = await listRemoteQuickMessages(await ensureGateway())
    quickMessages.value = Array.isArray(messages) ? messages : []
  } catch (error) {
    quickMessages.value = []
    quickError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  } finally {
    quickLoading.value = false
  }
}

function editQuickMessage(message: QuickMessage) {
  quickForm.id = message.id
  quickForm.title = message.title
  quickForm.content = message.content
}

function resetQuickForm() {
  quickForm.id = 0
  quickForm.title = ""
  quickForm.content = ""
}

async function saveQuickMessage() {
  if (quickSaving.value) return
  if (!quickForm.title.trim() || !quickForm.content.trim()) {
    uni.showToast({ title: "请填写标题和内容", icon: "none" })
    return
  }
  quickSaving.value = true
  quickError.value = ""
  try {
    const gateway = await ensureGateway()
    if (quickForm.id) {
      await updateRemoteQuickMessage(gateway, {
        id: quickForm.id,
        title: quickForm.title.trim(),
        content: quickForm.content.trim(),
      })
    } else {
      await createRemoteQuickMessage(gateway, {
        title: quickForm.title.trim(),
        content: quickForm.content.trim(),
      })
    }
    resetQuickForm()
    await loadQuickMessages()
    uni.showToast({ title: "快捷消息已保存", icon: "success" })
  } catch (error) {
    quickError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  } finally {
    quickSaving.value = false
  }
}

async function deleteQuickMessage(id: number) {
  quickError.value = ""
  try {
    await deleteRemoteQuickMessage(await ensureGateway(), id)
    if (quickForm.id === id) resetQuickForm()
    await loadQuickMessages()
    uni.showToast({ title: "快捷消息已删除", icon: "success" })
  } catch (error) {
    quickError.value = isUnsupportedSettingsCommand(error)
      ? "当前桌面端不支持"
      : toErrorMessage(error)
  }
}

function toBoundedInt(value: unknown, min: number, max: number, fallback: number) {
  const next = Math.trunc(Number(value))
  if (!Number.isFinite(next)) return fallback
  return Math.min(max, Math.max(min, next))
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === "string" && error.trim()) return error.trim()
  return "操作失败"
}
</script>

<style scoped lang="scss">
.connection-settings-tab,
.panel-section,
.quick-layout,
.quick-form,
.quick-list {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.settings-group,
.settings-state,
.settings-panel {
  border-radius: 28rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.settings-group,
.settings-state {
  padding: 24rpx;
}

.settings-group__title {
  display: block;
  margin-bottom: 14rpx;
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-tips-color, #909193);
}

.settings-list {
  overflow: hidden;
  border-radius: 24rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.settings-row,
.option-row,
.tool-row,
.quick-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
}

.settings-row {
  min-height: 92rpx;
  padding: 18rpx;
  background: var(--up-card-bg-color, #ffffff);
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);
}

.settings-row:last-child {
  border-bottom: none;
}

.settings-row__icon {
  width: 58rpx;
  height: 58rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 11%, var(--up-card-bg-color, #ffffff) 89%);
}

.settings-row__body,
.option-row__body,
.tool-row__body,
.quick-row__body,
.settings-panel__copy {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 6rpx;
}

.settings-row__label,
.settings-state__title,
.settings-panel__title,
.subsection-card__title,
.tool-row__title,
.quick-row__title,
.form-label {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.settings-row__value,
.settings-state__text,
.settings-panel__desc,
.subsection-card__desc,
.tool-row__desc,
.quick-row__content,
.option-row__value,
.panel-notice,
.panel-loading,
.panel-error,
.quick-empty {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.settings-state--error,
.panel-error {
  color: var(--up-error, #fa3534);
}

.settings-panel {
  max-height: 86vh;
  padding: 26rpx;
  overflow: auto;
}

.settings-panel__head,
.subsection-card__head,
.quick-form__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.settings-panel__head {
  margin-bottom: 22rpx;
}

.appearance-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12rpx;
}

.appearance-swatch {
  display: flex;
  align-items: center;
  gap: 10rpx;
  min-height: 66rpx;
  padding: 14rpx;
  border-radius: 20rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
  color: var(--up-main-color, #303133);
  font-size: 22rpx;
  font-weight: 700;
}

.appearance-swatch--active {
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 45%, var(--up-border-color, #dadbde) 55%);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
}

.appearance-swatch__dot {
  width: 24rpx;
  height: 24rpx;
  border-radius: 50%;
}

.panel-notice,
.panel-loading,
.panel-error,
.quick-empty {
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.panel-loading {
  display: flex;
  align-items: center;
  gap: 12rpx;
}

.option-list {
  overflow: hidden;
  border-radius: 24rpx;
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.option-row {
  min-height: 86rpx;
  padding: 18rpx;
  border-bottom: 1rpx solid var(--up-border-color, #dadbde);
}

.option-row:last-child {
  border-bottom: none;
}

.option-row--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
}

.option-row__label {
  font-size: 26rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.subsection-card,
.quick-form,
.quick-row {
  padding: 20rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.settings-toggle {
  min-width: 96rpx;
  min-height: 54rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 18rpx;
  border-radius: 999rpx;
  background: var(--up-card-bg-color, #ffffff);
  color: var(--up-tips-color, #909193);
  font-size: 22rpx;
  font-weight: 700;
}

.settings-toggle--on {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 16%, var(--up-card-bg-color, #ffffff) 84%);
  color: var(--up-primary, #2979ff);
}

.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14rpx;
  margin-top: 16rpx;
}

.form-field {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.form-label {
  font-size: 24rpx;
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  margin-top: 16rpx;
}

.tool-row {
  padding: 16rpx;
  border-radius: 20rpx;
  background: var(--up-card-bg-color, #ffffff);
}

.quick-form__actions {
  justify-content: flex-end;
}

.quick-row {
  background: var(--up-card-bg-color, #ffffff);
}

.quick-row__content {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.quick-row__delete {
  width: 58rpx;
  height: 58rpx;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 18rpx;
  background: color-mix(in srgb, var(--up-error, #fa3534) 10%, var(--up-card-bg-color, #ffffff) 90%);
}

@media (max-width: 420px) {
  .appearance-grid,
  .form-grid {
    grid-template-columns: 1fr;
  }
}
</style>
