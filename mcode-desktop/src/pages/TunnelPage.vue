<script setup lang="ts">
import { useDesktopRuntimeStore } from "../stores/desktopRuntime"

const runtime = useDesktopRuntimeStore()
</script>

<template>
  <article class="page">
    <div>
      <p class="kicker">Tunnel Preview</p>
      <h2>本地服务通过网关暴露给 MCode</h2>
      <p>
        默认预留 `127.0.0.1:1080` 作为内网穿透入口。后续 bridge runtime 会把用户选择的本地服务绑定到这个端口。
      </p>
    </div>

    <section class="binding-card">
      <span>本地绑定</span>
      <strong>{{ runtime.tunnelBind }}</strong>
      <p>移动端访问时必须走 relay 验证后的 `/v1/tunnel/:targetId/:port/*` 路径。</p>
    </section>
  </article>
</template>

<style scoped>
.page {
  display: grid;
  gap: 24px;
  max-width: 760px;
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

.binding-card {
  display: grid;
  gap: 12px;
  border: 1px solid rgba(45, 68, 39, 0.12);
  border-radius: 28px;
  padding: 26px;
  background: rgba(255, 255, 255, 0.54);
}

.binding-card span {
  color: #6b755e;
  font-size: 12px;
}

.binding-card strong {
  color: #22351d;
  font-size: 34px;
}
</style>
