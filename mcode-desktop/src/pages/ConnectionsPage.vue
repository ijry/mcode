<script setup lang="ts">
import { computed } from "vue"
import { buildGatewayQrPayload } from "../lib/pairing"
import { useDesktopRuntimeStore } from "../stores/desktopRuntime"

const runtime = useDesktopRuntimeStore()
const qrPayload = computed(() =>
  buildGatewayQrPayload({
    name: runtime.displayName,
    gatewayProvider: runtime.gatewayProvider,
    gatewayBaseUrl: runtime.gatewayBaseUrl,
    pairCode: runtime.pairCode || "ABCD-1234",
    pairSecret: runtime.pairSecret || "pair-secret",
  })
)
</script>

<template>
  <article class="page">
    <div class="page-header">
      <p class="kicker">Gateway Pairing</p>
      <h2>移动端扫码后连接到这个桌面宿主</h2>
      <p>MCode Desktop 作为官方 CLI 与本地服务的代理层，对移动端暴露统一的 `mcode-desktop` target。</p>
    </div>

    <section class="card-grid">
      <div class="status-card">
        <span>网关状态</span>
        <strong>{{ runtime.relayStatus }}</strong>
      </div>
      <div class="status-card">
        <span>Target Agent</span>
        <strong>{{ runtime.activeTargetAgent }}</strong>
      </div>
      <div class="status-card">
        <span>能力</span>
        <strong>{{ runtime.capabilities.length || 0 }}</strong>
      </div>
    </section>

    <section class="payload">
      <h3>v2 网关二维码 Payload</h3>
      <pre>{{ JSON.stringify(qrPayload, null, 2) }}</pre>
    </section>
  </article>
</template>

<style scoped>
.page {
  display: grid;
  gap: 24px;
}

.page-header {
  max-width: 720px;
}

.kicker {
  margin: 0 0 10px;
  color: #6d854d;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.16em;
  text-transform: uppercase;
}

h2 {
  margin: 0;
  font-size: clamp(30px, 4vw, 52px);
  line-height: 1;
  letter-spacing: -0.05em;
}

p {
  color: #53624f;
  line-height: 1.7;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}

.status-card,
.payload {
  border: 1px solid rgba(45, 68, 39, 0.12);
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.54);
}

.status-card {
  display: grid;
  gap: 10px;
  padding: 20px;
}

.status-card span {
  color: #6b755e;
  font-size: 12px;
}

.status-card strong {
  color: #22351d;
  font-size: 24px;
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
  border-radius: 18px;
  padding: 18px;
  background: #172016;
  color: #e8f5d6;
}

@media (max-width: 760px) {
  .card-grid {
    grid-template-columns: 1fr;
  }
}
</style>
