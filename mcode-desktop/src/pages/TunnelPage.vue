<script setup lang="ts">
import { reactive, ref, watch } from "vue"
import { buildLocalServiceConfig } from "../lib/localServices"
import { useDesktopRuntimeStore } from "../stores/desktopRuntime"

const runtime = useDesktopRuntimeStore()
const saving = ref(false)
const message = ref("")

const form = reactive({
  name: runtime.localService.name,
  host: runtime.localService.host,
  port: String(runtime.localService.port),
  enabled: runtime.localService.enabled,
})

watch(
  () => runtime.localService,
  (service) => {
    form.name = service.name
    form.host = service.host
    form.port = String(service.port)
    form.enabled = service.enabled
  }
)

async function saveService() {
  saving.value = true
  message.value = ""
  try {
    const config = buildLocalServiceConfig({
      name: form.name,
      host: form.host,
      port: form.port,
      enabled: form.enabled,
    })
    await runtime.saveService(config)
    message.value = "本地服务已保存，移动端扫码后可看到该服务入口。"
  } catch (error) {
    message.value = error instanceof Error ? error.message : String(error)
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <article class="page">
    <div>
      <p class="kicker">Tunnel Preview</p>
      <h2>本地服务通过网关暴露给 MCode</h2>
      <p>
        P3 先提供本机 HTTP 服务配置和配对流程，不实现 P4 的流式 tunnel 转发。默认只允许
        `127.0.0.1`，开放 `0.0.0.0` 会被拒绝。
      </p>
    </div>

    <section class="binding-card">
      <span>当前本地服务</span>
      <strong>{{ runtime.tunnelBind }}</strong>
      <p>移动端访问时必须走网关验证后的 `/v1/tunnel/:targetId/:port/*` 路径。</p>
    </section>

    <section class="service-card">
      <div class="service-header">
        <div>
          <p class="section-label">Local Service</p>
          <h3>配置本机 HTTP 服务</h3>
        </div>
        <span class="badge">P3 config only</span>
      </div>

      <div class="form-grid">
        <label class="field">
          <span>名称</span>
          <input v-model="form.name" placeholder="Code" />
        </label>
        <label class="field">
          <span>Host</span>
          <input v-model="form.host" placeholder="127.0.0.1" />
        </label>
        <label class="field">
          <span>Port</span>
          <input v-model="form.port" inputmode="numeric" placeholder="1080" />
        </label>
        <label class="field">
          <span>协议</span>
          <select disabled>
            <option>HTTP</option>
          </select>
        </label>
      </div>

      <label class="toggle">
        <input v-model="form.enabled" type="checkbox" />
        <span>启用该本地服务入口</span>
      </label>

      <div class="actions">
        <button class="primary" type="button" :disabled="saving" @click="saveService">
          {{ saving ? "保存中..." : "保存本地服务" }}
        </button>
      </div>

      <p v-if="message" class="message" :class="{ error: message.includes('P3 only') || message.includes('无效') }">
        {{ message }}
      </p>
    </section>
  </article>
</template>

<style scoped>
.page {
  display: grid;
  gap: 24px;
  max-width: 860px;
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
  font-size: 26px;
}

p {
  color: #53624f;
  line-height: 1.7;
}

.binding-card,
.service-card {
  border: 1px solid rgba(45, 68, 39, 0.12);
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.54);
}

.binding-card {
  display: grid;
  gap: 12px;
  padding: 26px;
}

.binding-card span {
  color: #6b755e;
  font-size: 12px;
}

.binding-card strong {
  color: #22351d;
  font-size: 34px;
}

.service-card {
  display: grid;
  gap: 20px;
  padding: 24px;
}

.service-header {
  display: flex;
  align-items: start;
  justify-content: space-between;
  gap: 16px;
}

.badge {
  border-radius: 999px;
  padding: 8px 10px;
  background: rgba(31, 52, 29, 0.1);
  color: #33482e;
  font-size: 12px;
  font-weight: 800;
}

.form-grid {
  display: grid;
  grid-template-columns: 1.3fr 1fr 0.7fr 0.7fr;
  gap: 14px;
}

.field {
  display: grid;
  gap: 8px;
  color: #44543e;
  font-size: 13px;
  font-weight: 700;
}

input,
select {
  box-sizing: border-box;
  width: 100%;
  border: 1px solid rgba(45, 68, 39, 0.18);
  border-radius: 16px;
  padding: 13px 14px;
  background: rgba(255, 252, 243, 0.82);
  color: #172016;
  font: inherit;
}

.toggle {
  display: flex;
  align-items: center;
  gap: 10px;
  color: #44543e;
  font-weight: 700;
}

.toggle input {
  width: 18px;
  height: 18px;
}

.actions {
  display: flex;
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

.message {
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

@media (max-width: 800px) {
  .form-grid {
    grid-template-columns: 1fr;
  }

  .service-header {
    display: grid;
  }
}
</style>
