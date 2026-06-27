<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import { useDesktopRuntimeStore } from "../stores/desktopRuntime"

const runtime = useDesktopRuntimeStore()
const busyAction = ref<"refresh" | "pair" | "connect" | null>(null)

const statusLabel = computed(
  () =>
    ({
      offline: "未连接",
      connecting: "连接中",
      online: "在线",
      error: "错误",
    })[runtime.relayStatus]
)

const formattedQrPayload = computed(() => {
  if (!runtime.qrPayload) return "点击“生成配对码”后会显示二维码 payload。"
  try {
    return JSON.stringify(JSON.parse(runtime.qrPayload), null, 2)
  } catch {
    return runtime.qrPayload
  }
})

const retryDelayText = computed(() =>
  runtime.upstreamNextRetryDelayMs === null ? "无" : `${runtime.upstreamNextRetryDelayMs}ms`
)

async function runAction(action: "refresh" | "pair" | "connect", task: () => Promise<unknown>) {
  busyAction.value = action
  runtime.lastMessage = ""
  try {
    await task()
  } catch (error) {
    runtime.relayStatus = "error"
    runtime.upstreamError = error instanceof Error ? error.message : String(error)
  } finally {
    busyAction.value = null
  }
}

onMounted(() => {
  runAction("refresh", () => runtime.refreshHealth())
})
</script>

<template>
  <article class="page">
    <div class="page-header">
      <p class="kicker">Gateway Pairing</p>
      <h2>移动端扫码后连接到这个桌面宿主</h2>
      <p>MCode Desktop 作为官方 CLI 与本地服务的代理层，对移动端暴露统一的 `mcode-desktop` agent。</p>
    </div>

    <section class="card-grid">
      <div class="status-card" :class="runtime.relayStatus">
        <span>网关状态</span>
        <strong>{{ statusLabel }}</strong>
      </div>
      <div class="status-card">
        <span>Target Agent</span>
        <strong>{{ runtime.activeTargetAgent }}</strong>
      </div>
      <div class="status-card">
        <span>Target ID</span>
        <strong>{{ runtime.targetId || "待生成" }}</strong>
      </div>
      <div class="status-card">
        <span>Reconnect</span>
        <strong>{{ runtime.upstreamReconnectAttempt }}</strong>
      </div>
      <div class="status-card">
        <span>Next Retry</span>
        <strong>{{ retryDelayText }}</strong>
      </div>
      <div class="status-card">
        <span>ACK Local</span>
        <strong>{{ runtime.lastAckLocalEventId ?? "无" }}</strong>
      </div>
      <div class="status-card">
        <span>Relay Event</span>
        <strong>{{ runtime.lastRelayEventId ?? "无" }}</strong>
      </div>
      <div class="status-card">
        <span>Queued Events</span>
        <strong>{{ runtime.queuedOutboundEventCount }}</strong>
      </div>
    </section>

    <section class="diagnostic-strip">
      <span>Controller: {{ runtime.activeControllerId || "未绑定" }}</span>
      <span>Shutdown: {{ runtime.shutdownRequested ? "requested" : "running" }}</span>
      <span>Recovery: {{ runtime.recoveryStorageMode }}</span>
      <span>Replay: {{ runtime.replaySupported ? "supported" : "best-effort" }}</span>
      <span>Oldest queued: {{ runtime.oldestQueuedLocalEventId ?? "无" }}</span>
    </section>

    <section class="panel-card">
      <div>
        <p class="section-label">网关配置</p>
        <h3>连接官方或自定义 MCode 网关</h3>
      </div>

      <label class="field">
        <span>网关服务商</span>
        <select
          v-model="runtime.gatewayProvider"
          @change="runtime.setGatewayProvider(runtime.gatewayProvider)"
        >
          <option value="official">MCode 官方网关</option>
          <option value="custom">自定义</option>
        </select>
      </label>

      <label class="field">
        <span>{{ runtime.gatewayProvider === "custom" ? "自定义域名" : "官方网关地址" }}</span>
        <input
          v-model="runtime.gatewayBaseUrl"
          type="url"
          placeholder="https://gateway.example.com"
        />
      </label>

      <div class="actions">
        <button type="button" :disabled="busyAction !== null" @click="runAction('refresh', () => runtime.refreshHealth())">
          刷新状态
        </button>
        <button type="button" :disabled="busyAction !== null" @click="runAction('pair', () => runtime.createPairOffer())">
          生成配对码
        </button>
        <button
          class="primary"
          type="button"
          :disabled="busyAction !== null"
          @click="runAction('connect', () => runtime.connectGateway())"
        >
          {{ busyAction === "connect" ? "连接中..." : "连接网关" }}
        </button>
      </div>

      <p v-if="runtime.upstreamError" class="error-text">{{ runtime.upstreamError }}</p>
    </section>

    <section class="pair-grid">
      <div class="pair-card">
        <span>配对码</span>
        <strong>{{ runtime.pairCode || "未生成" }}</strong>
        <p>配对码和二维码 payload 同步生成，移动端扫码后保存为 `mcode-desktop/gateway` 连接。</p>
      </div>

      <div class="pair-card">
        <span>Capabilities</span>
        <div class="chips">
          <em v-for="capability in runtime.capabilities" :key="capability">{{ capability }}</em>
        </div>
      </div>
    </section>

    <section class="payload">
      <h3>v2 网关二维码 Payload</h3>
      <pre>{{ formattedQrPayload }}</pre>
    </section>
  </article>
</template>

<style scoped>
.page {
  display: grid;
  gap: 24px;
}

.page-header {
  max-width: 760px;
}

.kicker,
.section-label {
  margin: 0 0 10px;
  color: #6d854d;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h2,
h3,
p {
  margin-top: 0;
}

h2 {
  margin-bottom: 12px;
  font-size: clamp(30px, 4vw, 52px);
  line-height: 1;
  letter-spacing: -0.05em;
}

h3 {
  margin-bottom: 0;
  color: #22351d;
  font-size: 24px;
}

p {
  color: #53624f;
  line-height: 1.7;
}

.card-grid,
.pair-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 14px;
}

.pair-grid {
  grid-template-columns: minmax(220px, 0.8fr) 1.2fr;
}

.status-card,
.panel-card,
.payload,
.pair-card {
  border: 1px solid rgba(45, 68, 39, 0.12);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.54);
}

.status-card,
.pair-card {
  display: grid;
  gap: 10px;
  padding: 20px;
}

.status-card.online {
  background: rgba(214, 238, 168, 0.72);
}

.status-card.error {
  background: rgba(255, 230, 214, 0.82);
}

.status-card span,
.pair-card span {
  color: #6b755e;
  font-size: 12px;
}

.status-card strong {
  overflow-wrap: anywhere;
  color: #22351d;
  font-size: 22px;
}

.diagnostic-strip {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  border: 1px solid rgba(45, 68, 39, 0.12);
  border-radius: 18px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.46);
  color: #44543e;
  font-size: 13px;
  font-weight: 700;
}

.pair-card strong {
  color: #172016;
  font-size: clamp(28px, 5vw, 48px);
  letter-spacing: 0.08em;
}

.panel-card {
  display: grid;
  grid-template-columns: 1.1fr 0.8fr 1fr;
  align-items: end;
  gap: 18px;
  padding: 22px;
}

.field {
  display: grid;
  gap: 8px;
  color: #44543e;
  font-size: 13px;
  font-weight: 700;
}

select,
input {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgba(45, 68, 39, 0.18);
  border-radius: 16px;
  padding: 13px 14px;
  background: rgba(255, 252, 243, 0.82);
  color: #172016;
  font: inherit;
}

.actions {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
}

button {
  border: 0;
  border-radius: 16px;
  padding: 13px 16px;
  background: rgba(31, 52, 29, 0.1);
  color: #20341d;
  cursor: pointer;
  font-weight: 800;
}

button.primary {
  background: #1f341d;
  color: #f8f4e7;
}

button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.error-text {
  grid-column: 1 / -1;
  margin: 0;
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(153, 46, 18, 0.1);
  color: #87351e;
}

.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.chips em {
  border-radius: 999px;
  padding: 8px 10px;
  background: rgba(31, 52, 29, 0.1);
  color: #33482e;
  font-style: normal;
  font-size: 12px;
}

.payload {
  padding: 22px;
}

.payload h3 {
  margin: 0 0 14px;
}

pre {
  overflow: auto;
  margin: 0;
  min-height: 160px;
  border-radius: 18px;
  padding: 18px;
  background: #172016;
  color: #e8f5d6;
}

@media (max-width: 900px) {
  .card-grid,
  .pair-grid,
  .panel-card {
    grid-template-columns: 1fr;
  }
}
</style>
