<template>
  <view class="page providers-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="providers-shell">
      <view class="providers-header" :style="upThemeCardStyle">
        <view class="providers-header__copy">
          <text class="providers-header__eyebrow">MODEL PROVIDERS</text>
          <text class="providers-header__title">模型供应商</text>
          <text class="providers-header__desc">{{ connectionName || "当前连接" }}</text>
        </view>
        <view class="providers-header__action" @click="openCreatePopup">
          <up-icon name="plus" size="14" color="#ffffff"></up-icon>
          <text>新增</text>
        </view>
      </view>

      <view class="provider-filters" :style="upThemeCardStyle">
        <view
          v-for="option in filterOptions"
          :key="option.value"
          class="provider-filter"
          :class="{ 'provider-filter--active': currentFilter === option.value }"
          @click="currentFilter = option.value"
        >
          <text>{{ option.label }}</text>
        </view>
      </view>

      <view v-if="loading" class="providers-state" :style="upThemeCardStyle">
        <up-loading-icon mode="circle" size="26" color="#2979ff"></up-loading-icon>
        <text class="providers-state__text">正在读取供应商...</text>
      </view>

      <view v-else-if="errorMessage" class="providers-state providers-state--error" :style="upThemeCardStyle">
        <text class="providers-state__title">加载失败</text>
        <text class="providers-state__text">{{ errorMessage }}</text>
        <view class="providers-state__action" @click="retryLoad">
          <text>重试</text>
        </view>
      </view>

      <view v-else class="providers-list" :style="upThemeCardStyle">
        <view class="providers-list__head">
          <text class="providers-list__title">供应商列表</text>
          <text class="providers-list__subtitle">{{ filteredProviders.length }} 个</text>
        </view>

        <view v-if="filteredProviders.length === 0" class="providers-empty">
          <text>当前筛选下没有模型供应商。</text>
        </view>

        <view
          v-for="provider in filteredProviders"
          v-else
          :key="provider.id"
          class="provider-row"
          @click="openEditPopup(provider)"
        >
          <view class="provider-row__icon">
            <text>{{ provider.name.slice(0, 1).toUpperCase() }}</text>
          </view>
          <view class="provider-row__body">
            <view class="provider-row__head">
              <text class="provider-row__name">{{ provider.name }}</text>
              <text class="provider-row__agent">{{ agentLabel(provider.agent_type) }}</text>
            </view>
            <text class="provider-row__subtitle">{{ formatProviderSubtitle(provider) }}</text>
            <text class="provider-row__url">{{ provider.api_url }}</text>
            <text class="provider-row__key">{{ maskProviderKey(provider) }}</text>
          </view>
          <up-icon name="arrow-right" size="16" color="#c0c4cc"></up-icon>
        </view>
      </view>
    </view>

    <up-popup v-model:show="showEditor" mode="bottom" :round="28">
      <view class="provider-editor" :style="upThemeCardStyle">
        <view class="provider-editor__head">
          <view class="provider-editor__copy">
            <text class="provider-editor__title">{{ editingId ? "编辑供应商" : "新增供应商" }}</text>
            <text class="provider-editor__desc">保存后远端智能体可绑定该模型供应商。</text>
          </view>
          <up-icon name="close" size="20" color="#909193" @click="closeEditor"></up-icon>
        </view>

        <view class="form-section">
          <text class="form-label">名称</text>
          <up-input v-model="form.name" placeholder="OpenAI / DeepSeek / Gemini" border="surround"></up-input>
        </view>

        <view class="form-section">
          <text class="form-label">智能体类型</text>
          <view class="form-readonly" @click="showAgentPicker = true">
            <text class="form-readonly__text">{{ agentLabel(form.agentType) }}</text>
            <up-icon name="arrow-down" size="14" color="#c0c4cc"></up-icon>
          </view>
        </view>

        <view class="form-section">
          <text class="form-label">API URL</text>
          <up-input v-model="form.apiUrl" placeholder="https://api.example.com/v1" border="surround"></up-input>
        </view>

        <view class="form-section">
          <text class="form-label">API Key</text>
          <up-input
            v-model="form.apiKey"
            type="password"
            :placeholder="editingId ? '留空表示不修改' : '请输入 API Key'"
            border="surround"
          ></up-input>
        </view>

        <view class="form-section">
          <text class="form-label">模型</text>
          <up-textarea
            v-model="form.model"
            :placeholder="modelPlaceholder"
            autoHeight
            :maxlength="4000"
          ></up-textarea>
        </view>

        <view class="provider-editor__actions">
          <up-button
            v-if="editingId"
            type="error"
            plain
            :loading="deleting"
            @click="deleteCurrentProvider"
          >
            删除
          </up-button>
          <up-button type="primary" :loading="saving" @click="saveProvider">
            保存
          </up-button>
        </view>
      </view>
    </up-popup>

    <up-picker
      :show="showAgentPicker"
      :columns="agentPickerColumns"
      @confirm="onAgentConfirm"
      @cancel="showAgentPicker = false"
    ></up-picker>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh } from "@dcloudio/uni-app"
import type { CodegGateway } from "@/services/gateway"
import {
  decodeConnectionContext,
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  AGENT_LABELS,
  createRemoteModelProvider,
  deleteRemoteModelProvider,
  listRemoteModelProviders,
  updateRemoteModelProvider,
  type ModelProviderAgentType,
  type ModelProviderInfo,
} from "@/services/remoteSettings"
import {
  buildProviderAgentOptions,
  formatProviderSubtitle,
  maskProviderKey,
} from "./providerPresentation"

type FilterValue = "all" | ModelProviderAgentType

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const saving = ref(false)
const deleting = ref(false)
const errorMessage = ref("")
const connection = ref<ConnectionContext | null>(null)
const gateway = ref<CodegGateway | null>(null)
const connectionName = computed(() => connection.value?.name || "")
const providers = ref<ModelProviderInfo[]>([])
const currentFilter = ref<FilterValue>("all")
const showEditor = ref(false)
const showAgentPicker = ref(false)
const editingId = ref<number | null>(null)
const form = ref({
  name: "",
  apiUrl: "",
  apiKey: "",
  agentType: "codex" as ModelProviderAgentType,
  model: "",
})

const providerAgentOptions = buildProviderAgentOptions()
const filterOptions = computed(() => [
  { label: "全部", value: "all" as FilterValue },
  ...providerAgentOptions.map((option) => ({
    label: option.label,
    value: option.value as FilterValue,
  })),
])
const agentPickerColumns = computed(() => [
  providerAgentOptions.map((option) => option.label),
])
const filteredProviders = computed(() => {
  if (currentFilter.value === "all") return providers.value
  return providers.value.filter((provider) => provider.agent_type === currentFilter.value)
})
const modelPlaceholder = computed(() =>
  form.value.agentType === "claude_code"
    ? 'Claude Code 可填 JSON：{"main":"..."}'
    : "模型名，如 gpt-5 / gemini-2.5-pro"
)

onLoad((options) => {
  connection.value = decodeConnectionContext(options?.connection as string)
  void loadPage()
})

onPullDownRefresh(() => {
  void loadPage(true)
})

async function loadPage(stopPullDown = false) {
  if (!connection.value) {
    errorMessage.value = "缺少连接信息，请返回重试。"
    if (stopPullDown) uni.stopPullDownRefresh()
    return
  }

  loading.value = true
  errorMessage.value = ""
  try {
    const resolved = await resolveConnectionContext(connection.value)
    connection.value = resolved.connection
    gateway.value = resolved.gateway
    persistResolvedConnection(resolved.connection)
    providers.value = await listRemoteModelProviders(resolved.gateway)
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
    providers.value = []
  } finally {
    loading.value = false
    if (stopPullDown) uni.stopPullDownRefresh()
  }
}

function retryLoad() {
  void loadPage()
}

function openCreatePopup() {
  editingId.value = null
  form.value = {
    name: "",
    apiUrl: "",
    apiKey: "",
    agentType: currentFilter.value === "all" ? "codex" : currentFilter.value,
    model: "",
  }
  showEditor.value = true
}

function openEditPopup(provider: ModelProviderInfo) {
  editingId.value = provider.id
  form.value = {
    name: provider.name,
    apiUrl: provider.api_url,
    apiKey: "",
    agentType: provider.agent_type,
    model: provider.model || "",
  }
  showEditor.value = true
}

function closeEditor() {
  showEditor.value = false
}

function onAgentConfirm(event: { indexs?: number[]; indexes?: number[]; value?: unknown[] }) {
  const selectedValue = event.value?.[0]
  if (typeof selectedValue === "string") {
    form.value.agentType =
      providerAgentOptions.find((option) => option.label === selectedValue)?.value || "codex"
    showAgentPicker.value = false
    return
  }

  const index = event.indexs?.[0] ?? event.indexes?.[0] ?? 0
  form.value.agentType = providerAgentOptions[index]?.value || "codex"
  showAgentPicker.value = false
}

async function saveProvider() {
  if (!gateway.value) return
  if (!form.value.name.trim() || !form.value.apiUrl.trim()) {
    uni.showToast({ title: "请填写名称和 API URL", icon: "none" })
    return
  }
  if (!editingId.value && !form.value.apiKey.trim()) {
    uni.showToast({ title: "新增供应商需要 API Key", icon: "none" })
    return
  }

  saving.value = true
  try {
    if (editingId.value) {
      const result = await updateRemoteModelProvider(gateway.value, {
        id: editingId.value,
        name: form.value.name.trim(),
        apiUrl: form.value.apiUrl.trim(),
        apiKey: form.value.apiKey.trim() || null,
        agentType: form.value.agentType,
        model: nullableText(form.value.model),
      })
      showAffectedToast("供应商已保存", result.affectedRunningSessions)
    } else {
      await createRemoteModelProvider(gateway.value, {
        name: form.value.name.trim(),
        apiUrl: form.value.apiUrl.trim(),
        apiKey: form.value.apiKey.trim(),
        agentType: form.value.agentType,
        model: nullableText(form.value.model),
      })
      uni.showToast({ title: "供应商已创建", icon: "success" })
    }
    showEditor.value = false
    await loadPage()
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    saving.value = false
  }
}

async function deleteCurrentProvider() {
  if (!gateway.value || !editingId.value) return
  deleting.value = true
  try {
    await deleteRemoteModelProvider(gateway.value, editingId.value)
    showEditor.value = false
    await loadPage()
    uni.showToast({ title: "供应商已删除", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    deleting.value = false
  }
}

function agentLabel(agentType: ModelProviderAgentType) {
  return AGENT_LABELS[agentType]
}

function nullableText(value: string) {
  const text = String(value || "")
  return text.trim() ? text : null
}

function showAffectedToast(title: string, affected: number) {
  uni.showToast({
    title: affected > 0 ? `${title}，${affected} 个会话需重启` : title,
    icon: "success",
    duration: 2600,
  })
}

function toErrorMessage(error: unknown) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === "string" && error.trim()) return error.trim()
  return "操作失败"
}
</script>

<style scoped lang="scss">
.page {
  min-height: 100vh;
}

.providers-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.providers-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.providers-header,
.provider-filters,
.providers-state,
.providers-list,
.provider-editor {
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.providers-header,
.provider-filters,
.providers-state,
.providers-list,
.provider-editor {
  padding: 28rpx;
}

.providers-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20rpx;
  background:
    linear-gradient(
      135deg,
      color-mix(in srgb, var(--up-primary, #2979ff) 13%, var(--up-card-bg-color, #ffffff) 87%),
      var(--up-card-bg-color, #ffffff)
    );
}

.providers-header__copy,
.provider-editor__copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  min-width: 0;
}

.providers-header__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.providers-header__title,
.providers-state__title,
.providers-list__title,
.provider-editor__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.providers-header__desc,
.providers-state__text,
.providers-list__subtitle,
.provider-editor__desc,
.provider-row__subtitle,
.provider-row__url,
.provider-row__key {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.providers-header__action,
.providers-state__action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
  background: var(--up-primary, #2979ff);
  color: #ffffff;
}

.provider-filters {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.provider-filter {
  padding: 12rpx 20rpx;
  border-radius: 999rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 22rpx;
  font-weight: 700;
}

.provider-filter--active {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 14%, var(--up-card-bg-color, #ffffff) 86%);
  color: var(--up-primary, #2979ff);
}

.providers-state {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  text-align: center;
}

.providers-state--error {
  align-items: stretch;
}

.providers-list,
.provider-editor,
.form-section {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.providers-list__head,
.provider-editor__head,
.provider-row__head,
.provider-editor__actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.providers-empty {
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 24rpx;
}

.provider-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.provider-row__icon {
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  background: color-mix(in srgb, var(--up-primary, #2979ff) 18%, var(--up-card-bg-color, #ffffff) 82%);
  color: var(--up-primary, #2979ff);
  font-size: 28rpx;
  font-weight: 800;
  flex-shrink: 0;
}

.provider-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.provider-row__name {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.provider-row__agent {
  font-size: 20rpx;
  font-weight: 700;
  color: var(--up-primary, #2979ff);
  white-space: nowrap;
}

.provider-row__subtitle,
.provider-row__url,
.provider-row__key {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-label {
  font-size: 24rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.form-readonly {
  min-height: 76rpx;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14rpx;
  padding: 0 20rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.form-readonly__text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--up-main-color, #303133);
}

.provider-editor__actions {
  margin-top: 8rpx;
}

@media (max-width: 750rpx) {
  .providers-shell {
    padding: 16rpx;
  }

  .providers-header,
  .provider-filters,
  .providers-state,
  .providers-list,
  .provider-editor {
    padding: 22rpx;
  }
}
</style>
