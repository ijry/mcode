<template>
  <view class="page agents-page" :style="[upThemeVars, upThemePageStyle]">
    <view class="agents-shell">
      <view class="agents-header" :style="upThemeCardStyle">
        <view class="agents-header__copy">
          <text class="agents-header__eyebrow">REMOTE AGENTS</text>
          <text class="agents-header__title">智能体管理</text>
          <text class="agents-header__desc">{{ connectionName || "当前连接" }}</text>
        </view>
        <view class="agents-header__action" @click="refreshPage">
          <text>刷新</text>
        </view>
      </view>

      <view v-if="loading" class="agents-state" :style="upThemeCardStyle">
        <up-loading-icon mode="circle" size="26" color="#2979ff"></up-loading-icon>
        <text class="agents-state__text">正在读取远端智能体...</text>
      </view>

      <view v-else-if="errorMessage" class="agents-state agents-state--error" :style="upThemeCardStyle">
        <text class="agents-state__title">加载失败</text>
        <text class="agents-state__text">{{ errorMessage }}</text>
        <view class="agents-state__action" @click="retryLoad">
          <text>重试</text>
        </view>
      </view>

      <view v-else class="agents-content">
        <view class="agents-list" :style="upThemeCardStyle">
          <view class="agents-list__head">
            <text class="agents-list__title">远端智能体</text>
            <text class="agents-list__subtitle">{{ agents.length }} 个</text>
          </view>

          <view v-if="agents.length === 0" class="agents-empty">
            <text>远端没有返回智能体配置。</text>
          </view>

          <view
            v-for="agent in agents"
            v-else
            :key="agent.agent_type"
            class="agent-row"
            :class="{ 'agent-row--active': selectedAgentType === agent.agent_type }"
            @click="selectAgent(agent.agent_type)"
          >
            <view class="agent-row__mark" :style="{ background: getAgentAccent(agent.agent_type) }">
              <text>{{ getAgentInitial(agent.agent_type) }}</text>
            </view>
            <view class="agent-row__body">
              <view class="agent-row__head">
                <text class="agent-row__title">{{ getAgentLabel(agent.agent_type) }}</text>
                <view
                  class="agent-row__status"
                  :style="{ color: getToneColor(getAvailability(agent).tone) }"
                >
                  <text>{{ getAvailability(agent).label }}</text>
                </view>
              </view>
              <text class="agent-row__desc">{{ buildSummary(agent).subtitle }}</text>
              <view class="agent-row__meta">
                <text>{{ buildSummary(agent).distributionLabel }}</text>
                <text> · </text>
                <text>{{ buildSummary(agent).providerLabel }}</text>
              </view>
            </view>
            <up-icon name="arrow-right" size="16" color="#c0c4cc"></up-icon>
          </view>
        </view>

        <view v-if="selectedAgent" class="agent-detail" :style="upThemeCardStyle">
          <view class="agent-detail__head">
            <view class="agent-detail__copy">
              <text class="agent-detail__eyebrow">AGENT DETAIL</text>
              <text class="agent-detail__title">{{ getAgentLabel(selectedAgent.agent_type) }}</text>
              <text class="agent-detail__desc">{{ selectedAgent.description || selectedAgent.name }}</text>
            </view>
            <view
              class="agent-toggle"
              :class="{ 'agent-toggle--on': editEnabled }"
              @click="editEnabled = !editEnabled"
            >
              <text>{{ editEnabled ? "启用" : "停用" }}</text>
            </view>
          </view>

          <view class="agent-actions">
            <view class="agent-action" @click="moveSelectedAgent(-1)">
              <up-icon name="arrow-up" size="14" color="#2979ff"></up-icon>
              <text>上移</text>
            </view>
            <view class="agent-action" @click="moveSelectedAgent(1)">
              <up-icon name="arrow-down" size="14" color="#2979ff"></up-icon>
              <text>下移</text>
            </view>
            <view class="agent-action" @click="runDownloadSelected">
              <up-icon name="download" size="14" color="#2979ff"></up-icon>
              <text>下载</text>
            </view>
            <view class="agent-action" @click="runPrepareSelected">
              <up-icon name="reload" size="14" color="#2979ff"></up-icon>
              <text>Prepare</text>
            </view>
            <view class="agent-action agent-action--danger" @click="runUninstallSelected">
              <up-icon name="trash" size="14" color="#fa3534"></up-icon>
              <text>卸载</text>
            </view>
          </view>

          <view class="form-section">
            <text class="form-label">模型供应商</text>
            <view
              class="form-readonly"
              :class="{ 'form-readonly--disabled': !supportsModelProvider }"
              @click="openProviderPicker"
            >
              <text class="form-readonly__text">{{ selectedProviderLabel }}</text>
              <up-icon name="arrow-down" size="14" color="#c0c4cc"></up-icon>
            </view>
          </view>

          <view class="form-section">
            <text class="form-label">环境变量</text>
            <up-textarea
              v-model="envText"
              placeholder="KEY=value，每行一个。以 # 开头的行会被忽略。"
              autoHeight
              count
              :maxlength="8000"
            ></up-textarea>
            <view class="form-actions">
              <up-button type="primary" size="small" :loading="savingEnv" @click="saveEnv">
                保存启用/环境/供应商
              </up-button>
            </view>
          </view>

          <view class="form-section">
            <view class="form-label-row">
              <text class="form-label">原生配置</text>
              <text class="form-label-row__hint">{{ editableConfigCount }} 项已有内容</text>
            </view>
            <view class="config-editor">
              <text class="config-editor__label">config_json</text>
              <up-textarea v-model="configJsonText" placeholder="JSON 文本" autoHeight :maxlength="30000"></up-textarea>
            </view>
            <view class="config-editor">
              <text class="config-editor__label">codex_config_toml</text>
              <up-textarea v-model="codexConfigTomlText" placeholder="TOML 文本" autoHeight :maxlength="30000"></up-textarea>
            </view>
            <view class="config-editor">
              <text class="config-editor__label">codex_auth_json</text>
              <up-textarea v-model="codexAuthJsonText" placeholder="JSON 文本" autoHeight :maxlength="30000"></up-textarea>
            </view>
            <view class="config-editor">
              <text class="config-editor__label">opencode_auth_json</text>
              <up-textarea v-model="opencodeAuthJsonText" placeholder="JSON 文本" autoHeight :maxlength="30000"></up-textarea>
            </view>
            <view class="form-actions">
              <up-button type="primary" size="small" plain :loading="savingConfig" @click="saveConfig">
                保存原生配置
              </up-button>
            </view>
          </view>
        </view>
      </view>
    </view>

    <up-picker
      :show="showProviderPicker"
      :columns="providerColumns"
      @confirm="onProviderConfirm"
      @cancel="showProviderPicker = false"
    ></up-picker>

    <up-popup v-model:show="showLogPopup" mode="bottom" :round="28">
      <view class="task-log" :style="upThemeCardStyle">
        <view class="task-log__head">
          <view class="task-log__copy">
            <text class="task-log__title">任务进度</text>
            <text class="task-log__desc">{{ taskStatusText }}</text>
          </view>
          <up-icon name="close" size="20" color="#909193" @click="showLogPopup = false"></up-icon>
        </view>
        <scroll-view scroll-y class="task-log__body">
          <text v-if="taskLogs.length === 0" class="task-log__line">等待远端任务日志...</text>
          <text v-for="(line, index) in taskLogs" :key="index" class="task-log__line">
            {{ line }}
          </text>
        </scroll-view>
      </view>
    </up-popup>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, ref } from "vue"
import { onLoad, onPullDownRefresh, onUnload } from "@dcloudio/uni-app"
import type { CodegGateway } from "@/services/gateway"
import type { EventChannelConnection } from "@/services/gateway/types"
import {
  decodeConnectionContext,
  persistResolvedConnection,
  resolveConnectionContext,
  type ConnectionContext,
} from "@/services/connectionContext"
import {
  ACP_AGENTS_UPDATED_EVENT_CHANNEL,
  AGENT_INSTALL_EVENT_CHANNEL,
  createAgentTaskId,
  downloadRemoteAgentBinary,
  getAgentAvailabilityPresentation,
  getAgentLabel,
  getAgentToneColor,
  installRemoteUvTool,
  isModelProviderAgentType,
  listRemoteAgents,
  listRemoteModelProviders,
  normalizeAgentInstallEvent,
  normalizeGlobalEventFrame,
  parseEnvText,
  prepareRemoteNpxAgent,
  reorderRemoteAgents,
  serializeEnvText,
  uninstallRemoteAgent,
  updateRemoteAgentConfig,
  updateRemoteAgentEnv,
  type AcpAgentInfo,
  type AgentType,
  type ModelProviderInfo,
} from "@/services/remoteSettings"
import {
  buildAgentSummaryPresentation,
  countEditableConfigFields,
} from "./agentPresentation"

type TaskStatus = "idle" | "running" | "success" | "failed"

const currentInstance = getCurrentInstance()
const upThemeVars = computed(() => currentInstance?.proxy?.upThemeVars || {})
const upThemePageStyle = computed(() => currentInstance?.proxy?.upThemePageStyle || {})
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})

const loading = ref(false)
const savingEnv = ref(false)
const savingConfig = ref(false)
const errorMessage = ref("")
const connection = ref<ConnectionContext | null>(null)
const gateway = ref<CodegGateway | null>(null)
const eventConnection = ref<EventChannelConnection | null>(null)
const connectionName = computed(() => connection.value?.name || "")
const agents = ref<AcpAgentInfo[]>([])
const providers = ref<ModelProviderInfo[]>([])
const selectedAgentType = ref<AgentType | null>(null)
const showProviderPicker = ref(false)
const envText = ref("")
const editEnabled = ref(true)
const selectedProviderId = ref<number | null>(null)
const configJsonText = ref("")
const codexConfigTomlText = ref("")
const codexAuthJsonText = ref("")
const opencodeAuthJsonText = ref("")
const showLogPopup = ref(false)
const taskStatus = ref<TaskStatus>("idle")
const currentTaskId = ref("")
const taskLogs = ref<string[]>([])

const selectedAgent = computed(() =>
  agents.value.find((agent) => agent.agent_type === selectedAgentType.value) || null
)

const supportsModelProvider = computed(() =>
  selectedAgent.value ? isModelProviderAgentType(selectedAgent.value.agent_type) : false
)

const providerOptions = computed(() => {
  const agentType = selectedAgent.value?.agent_type
  if (!agentType || !isModelProviderAgentType(agentType)) return []
  return providers.value.filter((provider) => provider.agent_type === agentType)
})

const providerColumns = computed(() => [
  [
    "不绑定",
    ...providerOptions.value.map((provider) => `${provider.name} · ${provider.model || "默认模型"}`),
  ],
])

const selectedProviderLabel = computed(() => {
  if (!supportsModelProvider.value) return "该智能体不支持模型供应商"
  const provider = providers.value.find((item) => item.id === selectedProviderId.value)
  return provider ? `${provider.name} · ${provider.model || "默认模型"}` : "不绑定"
})

const editableConfigCount = computed(() =>
  selectedAgent.value ? countEditableConfigFields(selectedAgent.value) : 0
)

const taskStatusText = computed(() => {
  if (taskStatus.value === "running") return "任务执行中"
  if (taskStatus.value === "success") return "任务已完成"
  if (taskStatus.value === "failed") return "任务失败"
  return "未开始"
})

onLoad((options) => {
  connection.value = decodeConnectionContext(options?.connection as string)
  void loadPage()
})

onPullDownRefresh(() => {
  void loadPage(true)
})

onUnload(() => {
  closeEventConnection()
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
    await ensureEventConnection(resolved.gateway)
    await reloadRemoteData()
  } catch (error) {
    errorMessage.value = toErrorMessage(error)
    agents.value = []
    providers.value = []
  } finally {
    loading.value = false
    if (stopPullDown) uni.stopPullDownRefresh()
  }
}

async function reloadRemoteData() {
  if (!gateway.value) return
  const [agentList, providerList] = await Promise.all([
    listRemoteAgents(gateway.value),
    listRemoteModelProviders(gateway.value),
  ])
  agents.value = agentList
  providers.value = providerList
  if (!selectedAgentType.value || !agentList.some((agent) => agent.agent_type === selectedAgentType.value)) {
    selectedAgentType.value = agentList[0]?.agent_type || null
  }
  syncSelectedAgentForm()
}

function refreshPage() {
  void loadPage()
}

function retryLoad() {
  void loadPage()
}

function selectAgent(agentType: AgentType) {
  selectedAgentType.value = agentType
  syncSelectedAgentForm()
}

function syncSelectedAgentForm() {
  const agent = selectedAgent.value
  if (!agent) return
  editEnabled.value = agent.enabled
  selectedProviderId.value = agent.model_provider_id
  envText.value = serializeEnvText(agent.env)
  configJsonText.value = agent.config_json || ""
  codexConfigTomlText.value = agent.codex_config_toml || ""
  codexAuthJsonText.value = agent.codex_auth_json || ""
  opencodeAuthJsonText.value = agent.opencode_auth_json || ""
}

function buildSummary(agent: AcpAgentInfo) {
  return buildAgentSummaryPresentation(agent, providers.value)
}

function getAvailability(agent: AcpAgentInfo) {
  return getAgentAvailabilityPresentation(agent)
}

function getToneColor(tone: "success" | "error" | "warning" | "info") {
  return getAgentToneColor(tone)
}

function getAgentAccent(agentType: AgentType) {
  if (agentType === "claude_code") return "#d97757"
  if (agentType === "codex") return "#2979ff"
  if (agentType === "gemini") return "#34a853"
  if (agentType === "open_code") return "#111827"
  if (agentType === "open_claw") return "#059669"
  if (agentType === "cline") return "#7c3aed"
  return "#f59e0b"
}

function getAgentInitial(agentType: AgentType) {
  return getAgentLabel(agentType).slice(0, 1).toUpperCase()
}

function openProviderPicker() {
  if (!supportsModelProvider.value) {
    uni.showToast({ title: "该智能体不支持模型供应商", icon: "none" })
    return
  }
  showProviderPicker.value = true
}

function onProviderConfirm(event: { indexs?: number[]; indexes?: number[]; value?: unknown[] }) {
  const selectedValue = event.value?.[0]
  if (typeof selectedValue === "string") {
    const index = providerColumns.value[0].findIndex((label) => label === selectedValue)
    selectedProviderId.value = index <= 0 ? null : providerOptions.value[index - 1]?.id ?? null
    showProviderPicker.value = false
    return
  }

  const index = event.indexs?.[0] ?? event.indexes?.[0] ?? 0
  selectedProviderId.value = index <= 0 ? null : providerOptions.value[index - 1]?.id ?? null
  showProviderPicker.value = false
}

async function saveEnv() {
  if (!gateway.value || !selectedAgent.value) return
  savingEnv.value = true
  try {
    const affected = await updateRemoteAgentEnv(gateway.value, selectedAgent.value.agent_type, {
      enabled: editEnabled.value,
      env: parseEnvText(envText.value),
      modelProviderId: supportsModelProvider.value ? selectedProviderId.value : null,
    })
    await reloadRemoteData()
    showAffectedToast("环境变量已保存", affected)
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    savingEnv.value = false
  }
}

async function saveConfig() {
  if (!gateway.value || !selectedAgent.value) return
  savingConfig.value = true
  try {
    const affected = await updateRemoteAgentConfig(gateway.value, selectedAgent.value.agent_type, {
      config_json: nullableText(configJsonText.value),
      codex_config_toml: nullableText(codexConfigTomlText.value),
      codex_auth_json: nullableText(codexAuthJsonText.value),
      opencode_auth_json: nullableText(opencodeAuthJsonText.value),
    })
    await reloadRemoteData()
    showAffectedToast("原生配置已保存", affected)
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
  } finally {
    savingConfig.value = false
  }
}

async function moveSelectedAgent(direction: -1 | 1) {
  if (!gateway.value || !selectedAgent.value) return
  const index = agents.value.findIndex((agent) => agent.agent_type === selectedAgent.value?.agent_type)
  const nextIndex = index + direction
  if (index < 0 || nextIndex < 0 || nextIndex >= agents.value.length) return

  const nextAgents = [...agents.value]
  const [current] = nextAgents.splice(index, 1)
  nextAgents.splice(nextIndex, 0, current)
  agents.value = nextAgents

  try {
    await reorderRemoteAgents(gateway.value, nextAgents.map((agent) => agent.agent_type))
    await reloadRemoteData()
    uni.showToast({ title: "排序已保存", icon: "success" })
  } catch (error) {
    uni.showToast({ title: toErrorMessage(error), icon: "none", duration: 3000 })
    await reloadRemoteData()
  }
}

async function runDownloadSelected() {
  if (!gateway.value || !selectedAgent.value) return
  const taskId = beginTask("download", selectedAgent.value.agent_type)
  try {
    await downloadRemoteAgentBinary(
      gateway.value,
      selectedAgent.value.agent_type,
      taskId,
      selectedAgent.value.registry_version
    )
  } catch (error) {
    failTask(error)
  }
}

async function runPrepareSelected() {
  if (!gateway.value || !selectedAgent.value) return
  const agent = selectedAgent.value
  if (agent.distribution_type.toLowerCase().includes("uv")) {
    const taskId = beginTask("install-uv", agent.agent_type)
    try {
      await installRemoteUvTool(gateway.value, taskId)
    } catch (error) {
      failTask(error)
    }
    return
  }

  const taskId = beginTask("prepare", agent.agent_type)
  try {
    await prepareRemoteNpxAgent(
      gateway.value,
      agent.agent_type,
      agent.registry_version,
      taskId,
      false
    )
  } catch (error) {
    failTask(error)
  }
}

async function runUninstallSelected() {
  if (!gateway.value || !selectedAgent.value) return
  const taskId = beginTask("uninstall", selectedAgent.value.agent_type)
  try {
    await uninstallRemoteAgent(gateway.value, selectedAgent.value.agent_type, taskId)
  } catch (error) {
    failTask(error)
  }
}

function beginTask(operation: string, agentType: AgentType) {
  const taskId = createAgentTaskId(operation, agentType)
  currentTaskId.value = taskId
  taskStatus.value = "running"
  taskLogs.value = [`任务 ${taskId} 已提交`]
  showLogPopup.value = true
  return taskId
}

function failTask(error: unknown) {
  taskStatus.value = "failed"
  taskLogs.value = [...taskLogs.value, `ERROR: ${toErrorMessage(error)}`]
}

async function ensureEventConnection(nextGateway: CodegGateway) {
  if (eventConnection.value?.isOpen()) return
  closeEventConnection()
  eventConnection.value = await nextGateway.connectEvents((raw) => {
    const frame = normalizeGlobalEventFrame(raw)
    if (!frame) return
    if (frame.channel === AGENT_INSTALL_EVENT_CHANNEL) {
      const event = normalizeAgentInstallEvent(frame.payload)
      if (!event || event.task_id !== currentTaskId.value) return
      if (event.kind === "started") {
        taskStatus.value = "running"
        return
      }
      if (event.kind === "log") {
        taskLogs.value = [...taskLogs.value, event.payload]
        return
      }
      if (event.kind === "completed") {
        taskStatus.value = "success"
        taskLogs.value = [...taskLogs.value, event.payload || "任务完成"]
        void reloadRemoteData()
        return
      }
      taskStatus.value = "failed"
      taskLogs.value = [...taskLogs.value, `ERROR: ${event.payload}`]
      void reloadRemoteData()
      return
    }
    if (frame.channel === ACP_AGENTS_UPDATED_EVENT_CHANNEL) {
      void reloadRemoteData()
    }
  })
}

function closeEventConnection() {
  if (!eventConnection.value) return
  try {
    eventConnection.value.close()
  } catch {}
  eventConnection.value = null
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

.agents-page {
  background: var(--up-page-bg-color, var(--up-bg-color, #f3f4f6));
}

.agents-shell {
  padding: 24rpx;
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.agents-header,
.agents-state,
.agents-list,
.agent-detail,
.task-log {
  border-radius: 30rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.agents-header,
.agents-state,
.agents-list,
.agent-detail {
  padding: 28rpx;
}

.agents-header {
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

.agents-header__copy,
.agent-detail__copy,
.task-log__copy {
  display: flex;
  flex-direction: column;
  gap: 10rpx;
  min-width: 0;
}

.agents-header__eyebrow,
.agent-detail__eyebrow {
  font-size: 20rpx;
  font-weight: 700;
  letter-spacing: 0.18em;
  color: var(--up-primary, #2979ff);
}

.agents-header__title,
.agents-state__title,
.agents-list__title,
.agent-detail__title,
.task-log__title {
  font-size: 34rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.agents-header__desc,
.agents-state__text,
.agents-list__subtitle,
.agent-row__desc,
.agent-row__meta,
.agent-detail__desc,
.task-log__desc,
.form-label-row__hint {
  font-size: 24rpx;
  line-height: 1.55;
  color: var(--up-content-color, #606266);
}

.agents-header__action,
.agents-state__action,
.agent-action,
.agent-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8rpx;
  padding: 14rpx 22rpx;
  border-radius: 999rpx;
  font-size: 22rpx;
  font-weight: 700;
}

.agents-header__action,
.agents-state__action,
.agent-action {
  background: color-mix(in srgb, var(--up-primary, #2979ff) 12%, var(--up-card-bg-color, #ffffff) 88%);
  color: var(--up-primary, #2979ff);
}

.agents-state {
  align-items: center;
  display: flex;
  flex-direction: column;
  gap: 14rpx;
  text-align: center;
}

.agents-state--error {
  align-items: stretch;
}

.agents-content,
.agents-list,
.agent-detail,
.form-section,
.config-editor {
  display: flex;
  flex-direction: column;
  gap: 18rpx;
}

.agents-list__head,
.agent-detail__head,
.form-label-row,
.task-log__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
}

.agents-empty {
  padding: 18rpx;
  border-radius: 20rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-content-color, #606266);
  font-size: 24rpx;
}

.agent-row {
  display: flex;
  align-items: center;
  gap: 16rpx;
  padding: 18rpx;
  border-radius: 24rpx;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  border: 1rpx solid transparent;
}

.agent-row--active {
  border-color: color-mix(in srgb, var(--up-primary, #2979ff) 45%, var(--up-border-color, #dadbde) 55%);
  background: color-mix(in srgb, var(--up-primary, #2979ff) 9%, var(--up-card-bg-color, #ffffff) 91%);
}

.agent-row__mark {
  width: 76rpx;
  height: 76rpx;
  border-radius: 24rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #ffffff;
  font-size: 28rpx;
  font-weight: 800;
  flex-shrink: 0;
}

.agent-row__body {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 8rpx;
}

.agent-row__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12rpx;
}

.agent-row__title {
  font-size: 28rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.agent-row__status {
  font-size: 20rpx;
  font-weight: 700;
  white-space: nowrap;
}

.agent-row__desc,
.agent-row__meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.agent-toggle {
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
  color: var(--up-tips-color, #909193);
}

.agent-toggle--on {
  background: rgba(52, 199, 89, 0.14);
  color: #34c759;
}

.agent-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12rpx;
}

.agent-action--danger {
  background: rgba(250, 53, 52, 0.1);
  color: var(--up-error, #fa3534);
}

.form-label,
.config-editor__label {
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

.form-readonly--disabled {
  opacity: 0.62;
}

.form-readonly__text {
  flex: 1;
  min-width: 0;
  font-size: 24rpx;
  color: var(--up-main-color, #303133);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
}

.task-log {
  padding: 24rpx;
  min-height: 560rpx;
}

.task-log__body {
  margin-top: 18rpx;
  max-height: 440rpx;
  padding: 18rpx;
  border-radius: 20rpx;
  background: #0f172a;
}

.task-log__line {
  display: block;
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  font-size: 22rpx;
  line-height: 1.6;
  color: #dbeafe;
  white-space: pre-wrap;
  word-break: break-all;
}

@media (max-width: 750rpx) {
  .agents-shell {
    padding: 16rpx;
  }

  .agents-header,
  .agents-state,
  .agents-list,
  .agent-detail {
    padding: 22rpx;
  }
}
</style>
