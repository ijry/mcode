<script setup lang="ts">
import { computed, ref } from "vue"
import ConnectionsPage from "./pages/ConnectionsPage.vue"
import TunnelPage from "./pages/TunnelPage.vue"

const tabs = [
  { key: "connections", label: "连接" },
  { key: "tunnel", label: "内网穿透" },
] as const

const activeTab = ref<(typeof tabs)[number]["key"]>("connections")
const activeComponent = computed(() =>
  activeTab.value === "tunnel" ? TunnelPage : ConnectionsPage
)
</script>

<template>
  <main class="shell">
    <aside class="sidebar">
      <div>
        <p class="eyebrow">MCode Desktop</p>
        <h1>桌面代理与网关</h1>
        <p class="summary">托管官方 CLI、配对移动端，并把本机服务安全暴露给 MCode。</p>
      </div>

      <nav class="tabs" aria-label="MCode Desktop sections">
        <button
          v-for="tab in tabs"
          :key="tab.key"
          class="tab"
          :class="{ active: activeTab === tab.key }"
          type="button"
          @click="activeTab = tab.key"
        >
          {{ tab.label }}
        </button>
      </nav>
    </aside>

    <section class="panel">
      <component :is="activeComponent" />
    </section>
  </main>
</template>

<style>
:root {
  color: #172016;
  background:
    radial-gradient(circle at top left, rgba(130, 180, 95, 0.28), transparent 32rem),
    linear-gradient(135deg, #f6f0df 0%, #d9e9cf 54%, #eef4e7 100%);
  font-family: "Aptos", "Segoe UI", sans-serif;
}

body {
  margin: 0;
  min-width: 320px;
  min-height: 100vh;
}

button {
  font: inherit;
}

.shell {
  box-sizing: border-box;
  display: grid;
  grid-template-columns: minmax(220px, 320px) 1fr;
  min-height: 100vh;
  padding: 28px;
  gap: 24px;
}

.sidebar,
.panel {
  border: 1px solid rgba(45, 68, 39, 0.14);
  background: rgba(255, 252, 243, 0.72);
  box-shadow: 0 24px 70px rgba(42, 69, 35, 0.16);
  backdrop-filter: blur(18px);
}

.sidebar {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  border-radius: 32px;
  padding: 28px;
}

.panel {
  border-radius: 36px;
  padding: 34px;
}

.eyebrow {
  margin: 0 0 12px;
  color: #5e7b44;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

h1 {
  margin: 0;
  max-width: 12ch;
  font-size: clamp(36px, 5vw, 64px);
  line-height: 0.92;
  letter-spacing: -0.06em;
}

.summary {
  margin: 18px 0 0;
  color: #53624f;
  line-height: 1.7;
}

.tabs {
  display: grid;
  gap: 10px;
}

.tab {
  width: 100%;
  border: 0;
  border-radius: 18px;
  padding: 14px 16px;
  background: rgba(255, 255, 255, 0.55);
  color: #52634a;
  cursor: pointer;
  text-align: left;
}

.tab.active {
  background: #1f341d;
  color: #f8f4e7;
}

@media (max-width: 760px) {
  .shell {
    grid-template-columns: 1fr;
    padding: 16px;
  }

  .sidebar {
    gap: 28px;
  }

  h1 {
    max-width: none;
  }
}
</style>
