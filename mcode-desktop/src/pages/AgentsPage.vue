<script setup lang="ts">
import { computed, onMounted, ref } from "vue"
import type { CliRuntimeKind, CliRuntimeStatus } from "../lib/runtimeApi"
import { useDesktopRuntimeStore } from "../stores/desktopRuntime"

const runtime = useDesktopRuntimeStore()
const refreshing = ref(false)
const message = ref("")

const expectedRuntimes: Array<{
  id: CliRuntimeKind
  title: string
  agentType: string
  accent: string
}> = [
  { id: "codex-cli", title: "Codex CLI", agentType: "codex", accent: "#2979ff" },
  { id: "claude-cli", title: "Claude CLI", agentType: "claude_code", accent: "#d97757" },
]

const runtimes = computed(() =>
  expectedRuntimes.map((item) => ({
    ...item,
    status: runtime.cliRuntimes.find((status) => status.id === item.id) || fallbackStatus(item),
  }))
)

async function refresh() {
  refreshing.value = true
  message.value = ""
  try {
    await runtime.refreshCliStatus()
    message.value = "已刷新本机 CLI 检测状态。"
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    refreshing.value = false
  }
}

function fallbackStatus(item: { id: CliRuntimeKind; title: string }): CliRuntimeStatus {
  return {
    runtime: item.id,
    id: item.id,
    displayName: item.title,
    binary: item.id === "codex-cli" ? "codex" : "claude",
    installed: false,
    version: null,
    capability:
      item.id === "codex-cli" ? "desktop.runtime.codex-cli" : "desktop.runtime.claude-cli",
    status: "unknown",
    error: "尚未刷新检测状态",
  }
}

function statusText(status: CliRuntimeStatus): string {
  if (status.installed) return "已安装"
  if (status.status === "unknown") return "未刷新"
  return "未检测到"
}

onMounted(() => {
  if (runtime.cliRuntimes.length === 0) {
    refresh()
  }
})
</script>

<template>
  <article class="page">
    <div class="page-header">
      <p class="kicker">Official CLI Adapters</p>
      <h2>官方 CLI 留在本机，由 Desktop 代理</h2>
      <p>
        P5 第一版只发布本机检测状态、能力标签和基础 proxy 路由。官方账号凭据只由本机 CLI
        使用，不会发送给 MCode app 或网关。
      </p>
    </div>

    <section class="runtime-grid">
      <div
        v-for="item in runtimes"
        :key="item.id"
        class="runtime-card"
        :class="{ available: item.status.installed }"
        :style="{ '--agent-accent': item.accent }"
      >
        <div class="runtime-card__top">
          <span class="dot" />
          <div>
            <p class="section-label">{{ item.agentType }}</p>
            <h3>{{ item.title }}</h3>
          </div>
          <strong>{{ statusText(item.status) }}</strong>
        </div>

        <dl>
          <div>
            <dt>Binary</dt>
            <dd>{{ item.status.binary }}</dd>
          </div>
          <div>
            <dt>Version</dt>
            <dd>{{ item.status.version || "未获取" }}</dd>
          </div>
          <div>
            <dt>Capability</dt>
            <dd>{{ item.status.capability }}</dd>
          </div>
        </dl>

        <p v-if="item.status.error" class="runtime-error">{{ item.status.error }}</p>
      </div>
    </section>

    <section class="adapter-note">
      <div>
        <p class="section-label">P5 Boundary</p>
        <h3>当前适配器边界</h3>
      </div>
      <p>
        Codex CLI adapter 支持 `codex --version` 检测与 `codex exec --json` 非交互 prompt。
        Claude CLI 当前只做安装检测；prompt、权限请求、会话恢复和流式事件归一化留给后续 P5
        子阶段。
      </p>
      <button class="primary" type="button" :disabled="refreshing" @click="refresh">
        {{ refreshing ? "检测中..." : "刷新 CLI 状态" }}
      </button>
      <p v-if="message" class="message" :class="{ error: message.includes('failed') || message.includes('失败') }">
        {{ message }}
      </p>
    </section>
  </article>
</template>

<style scoped>
.page {
  display: grid;
  gap: 24px;
}

.page-header {
  max-width: 780px;
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
  font-size: 26px;
}

p {
  color: #53624f;
  line-height: 1.7;
}

.runtime-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 16px;
}

.runtime-card,
.adapter-note {
  border: 1px solid rgba(45, 68, 39, 0.12);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.54);
}

.runtime-card {
  display: grid;
  gap: 18px;
  padding: 24px;
  overflow: hidden;
}

.runtime-card.available {
  background:
    radial-gradient(circle at top right, color-mix(in srgb, var(--agent-accent) 18%, transparent), transparent 17rem),
    rgba(255, 255, 255, 0.62);
}

.runtime-card__top {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 14px;
}

.dot {
  width: 16px;
  height: 16px;
  border-radius: 999px;
  background: var(--agent-accent);
  box-shadow: 0 0 0 8px color-mix(in srgb, var(--agent-accent) 14%, transparent);
}

.runtime-card__top strong {
  border-radius: 999px;
  padding: 8px 10px;
  background: rgba(31, 52, 29, 0.1);
  color: #20341d;
  font-size: 12px;
}

dl {
  display: grid;
  gap: 10px;
  margin: 0;
}

dl div {
  display: grid;
  grid-template-columns: 90px 1fr;
  gap: 12px;
}

dt {
  color: #6b755e;
  font-size: 12px;
  font-weight: 800;
}

dd {
  margin: 0;
  overflow-wrap: anywhere;
  color: #172016;
}

.runtime-error {
  margin: 0;
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(153, 46, 18, 0.1);
  color: #87351e;
  font-size: 13px;
}

.adapter-note {
  display: grid;
  grid-template-columns: 0.8fr 1.4fr auto;
  align-items: center;
  gap: 18px;
  padding: 24px;
}

button {
  border: 0;
  border-radius: 16px;
  padding: 13px 16px;
  background: rgba(31, 52, 29, 0.1);
  color: #20341d;
  cursor: pointer;
  font-weight: 800;
  white-space: nowrap;
}

button.primary {
  background: #1f341d;
  color: #f8f4e7;
}

button:disabled {
  cursor: wait;
  opacity: 0.55;
}

.message {
  grid-column: 1 / -1;
  margin: 0;
  border-radius: 16px;
  padding: 12px 14px;
  background: rgba(214, 238, 168, 0.72);
  color: #304c22;
}

.message.error {
  background: rgba(153, 46, 18, 0.1);
  color: #87351e;
}

@media (max-width: 900px) {
  .runtime-grid,
  .adapter-note {
    grid-template-columns: 1fr;
  }
}
</style>
