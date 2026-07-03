<template>
  <view class="project-terminal-panel">
    <ProjectUnsupportedState
      v-if="unsupportedText"
      title="终端暂不可用"
      :text="unsupportedText"
      icon="terminal"
    />

    <view v-else class="project-terminal-card" :style="upThemeCardStyle">
      <view class="project-terminal-card__head">
        <view class="project-terminal-card__copy">
          <text class="project-terminal-card__title">终端</text>
          <text class="project-terminal-card__subtitle">{{ running ? "运行中" : "未连接" }}</text>
        </view>
        <view class="project-terminal-card__actions">
          <view class="project-terminal-icon-btn" @click="restartTerminal">
            <up-icon name="reload" size="16" :color="upThemeVar('--up-primary', '#2979ff')"></up-icon>
          </view>
          <view class="project-terminal-icon-btn" @click="stopTerminal">
            <up-icon name="close" size="16" :color="upThemeVar('--up-error', '#fa3534')"></up-icon>
          </view>
        </view>
      </view>

      <view v-if="errorMessage" class="project-terminal-error">
        <text>{{ errorMessage }}</text>
      </view>

      <!-- #ifdef H5 -->
      <div
        ref="terminalHost"
        class="project-terminal-host"
        :data-terminal-host="terminalHostRefKey"
      ></div>
      <!-- #endif -->
      <!-- #ifndef H5 -->
      <view class="project-terminal-host"></view>
      <!-- #endif -->
    </view>
  </view>
</template>

<script setup lang="ts">
import { computed, getCurrentInstance, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue"
// #ifdef H5
import { Terminal } from "@xterm/xterm"
import { FitAddon } from "@xterm/addon-fit"
import "@xterm/xterm/css/xterm.css"
// #endif
import ProjectUnsupportedState from "./ProjectUnsupportedState.vue"
import type { CodegGateway } from "@/services/gateway"
import type { EventChannelConnection } from "@/services/gateway/types"
import {
  extractTerminalOutputText,
  isDomTerminalRuntime,
  isTerminalExitChannel,
  isTerminalOutputChannel,
  killProjectTerminal,
  normalizeTerminalChannelFrame,
  resolveTerminalMountHost,
  resizeProjectTerminal,
  spawnProjectTerminal,
  writeProjectTerminal,
} from "@/services/projectTerminal"

const props = defineProps<{
  gateway: CodegGateway | null
  projectPath: string
  unsupportedText?: string
}>()

const currentInstance = getCurrentInstance()
const upThemeCardStyle = computed(() => currentInstance?.proxy?.upThemeCardStyle || {})
const upThemeVar = (name: string, fallback: string) =>
  currentInstance?.proxy?.upThemeVar?.(name, fallback) ?? `var(${name}, ${fallback})`

const terminalHost = ref<unknown>(null)
const terminalHostRefKey = `project-terminal-${currentInstance?.uid ?? "host"}`
const terminalId = ref(createTerminalId())
const running = ref(false)
const starting = ref(false)
const errorMessage = ref("")

let terminal: any = null
let fitAddon: any = null
let eventConnection: EventChannelConnection | null = null
let browserTerminalEnabled = false
// #ifdef H5
browserTerminalEnabled = true
// #endif

onMounted(() => {
  void startTerminal()
})

onBeforeUnmount(() => {
  void stopTerminal()
})

watch(
  () => [props.gateway, props.projectPath, props.unsupportedText || ""],
  () => {
    if (props.gateway && props.projectPath && !props.unsupportedText) {
      void restartTerminal()
    } else {
      void stopTerminal()
    }
  }
)

async function startTerminal() {
  if (starting.value || running.value) return
  if (!props.gateway || !props.projectPath || props.unsupportedText) return
  if (!browserTerminalEnabled || !isDomTerminalRuntime()) {
    errorMessage.value = "当前平台暂不支持交互终端。"
    return
  }

  await nextTick()
  const mountHost = resolveTerminalMountHost(
    terminalHost.value,
    typeof document !== "undefined" ? document : null,
    terminalHostRefKey
  )
  if (!mountHost) {
    errorMessage.value = "终端容器初始化失败，请刷新页面后重试。"
    return
  }

  starting.value = true
  errorMessage.value = ""
  try {
    terminalId.value = createTerminalId()
    terminal = new Terminal({
      cursorBlink: true,
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
      theme: {
        background: "#0f172a",
        foreground: "#dbeafe",
      },
    })
    fitAddon = new FitAddon()
    terminal.loadAddon(fitAddon)
    terminal.open(mountHost)
    terminal.onData((data: string) => {
      if (props.gateway) void writeProjectTerminal(props.gateway, terminalId.value, data)
    })
    eventConnection = await props.gateway.connectEvents((raw) => {
      const frame = normalizeTerminalChannelFrame(raw)
      if (!frame) return
      if (isTerminalOutputChannel(frame.channel, terminalId.value)) {
        terminal?.write(extractTerminalOutputText(frame.payload))
      }
      if (isTerminalExitChannel(frame.channel, terminalId.value)) {
        running.value = false
        terminal?.write("\r\n[Process exited]\r\n")
      }
    })
    await spawnProjectTerminal(props.gateway, {
      workingDir: props.projectPath,
      terminalId: terminalId.value,
    })
    running.value = true
    terminal.focus()
    fitTerminal()
    if (typeof window !== "undefined") {
      window.addEventListener("resize", fitTerminal)
    }
  } catch (error) {
    errorMessage.value = toErrorMessage(error, "启动终端失败")
    await stopTerminal()
  } finally {
    starting.value = false
  }
}

async function restartTerminal() {
  await stopTerminal()
  await startTerminal()
}

async function stopTerminal() {
  const shouldKill = running.value
  running.value = false
  if (typeof window !== "undefined") {
    window.removeEventListener("resize", fitTerminal)
  }
  closeEventConnection()
  if (terminal) {
    terminal.dispose()
    terminal = null
  }
  fitAddon = null
  if (props.gateway && shouldKill) {
    await killProjectTerminal(props.gateway, terminalId.value).catch(() => {})
  }
}

function closeEventConnection() {
  if (!eventConnection) return
  try {
    eventConnection.close()
  } catch {}
  eventConnection = null
}

function fitTerminal() {
  if (!fitAddon || !props.gateway) return
  try {
    fitAddon.fit()
    const dims = fitAddon.proposeDimensions?.()
    if (dims) {
      void resizeProjectTerminal(props.gateway, terminalId.value, dims.cols, dims.rows)
    }
  } catch (error) {
    console.warn("fit project terminal failed", error)
  }
}

function createTerminalId() {
  return `mcode-project-${Date.now()}-${Math.random().toString(16).slice(2)}`
}

function toErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message.trim()) return error.message.trim()
  if (typeof error === "string" && error.trim()) return error.trim()
  return fallback
}

defineExpose({ restart: restartTerminal, stop: stopTerminal })
</script>

<style scoped lang="scss">
.project-terminal-panel {
  display: flex;
  flex-direction: column;
  gap: 20rpx;
}

.project-terminal-card {
  padding: 24rpx;
  border-radius: 24rpx;
  background: var(--up-card-bg-color, #ffffff);
  border: 1rpx solid var(--up-border-color, #dadbde);
}

.project-terminal-card__head {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16rpx;
  margin-bottom: 18rpx;
}

.project-terminal-card__copy {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  min-width: 0;
}

.project-terminal-card__title {
  font-size: 30rpx;
  font-weight: 700;
  color: var(--up-main-color, #303133);
}

.project-terminal-card__subtitle,
.project-terminal-error {
  font-size: 24rpx;
  line-height: 1.5;
  color: var(--up-content-color, #606266);
}

.project-terminal-card__actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 10rpx;
}

.project-terminal-icon-btn {
  width: 56rpx;
  height: 56rpx;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: var(--up-hover-bg-color, var(--up-bg-color, #f3f4f6));
}

.project-terminal-error {
  margin-bottom: 16rpx;
  padding: 16rpx 18rpx;
  border-radius: 16rpx;
  color: var(--up-error, #fa3534);
  background: color-mix(
    in srgb,
    var(--up-error, #fa3534) 10%,
    var(--up-card-bg-color, #ffffff) 90%
  );
}

.project-terminal-host {
  min-height: 620rpx;
  height: calc(100vh - 430rpx);
  overflow: hidden;
  border-radius: 16rpx;
  background: #0f172a;
}

.project-terminal-host :deep(.xterm) {
  height: 100%;
  padding: 16rpx;
  box-sizing: border-box;
}
</style>
