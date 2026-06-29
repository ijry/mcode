const state = {
  token: sessionStorage.getItem("mcodeAdminToken") || "",
  data: null,
}

const $ = (selector) => document.querySelector(selector)

$("#admin-token").value = state.token
$("#login-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  state.token = new FormData(event.currentTarget).get("adminToken").trim()
  sessionStorage.setItem("mcodeAdminToken", state.token)
  await refreshAll()
})

$("#clear-token").addEventListener("click", () => {
  state.token = ""
  state.data = null
  sessionStorage.removeItem("mcodeAdminToken")
  $("#admin-token").value = ""
  render()
})

$("#refresh").addEventListener("click", refreshAll)

$("#tenant-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  await api("/v1/admin/tenants", {
    method: "POST",
    body: {
      tenantId: form.get("tenantId"),
      tenantName: form.get("tenantName"),
    },
  })
  event.currentTarget.reset()
  await refreshAll()
})

$("#move-target-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const targetId = String(form.get("targetId") || "").trim()
  await api(`/v1/admin/devices/${encodeURIComponent(targetId)}/tenant`, {
    method: "POST",
    body: {
      tenantId: form.get("tenantId"),
    },
  })
  event.currentTarget.reset()
  await refreshAll()
})

$("#credential-form").addEventListener("submit", async (event) => {
  event.preventDefault()
  const form = new FormData(event.currentTarget)
  const body = {
    role: form.get("role"),
    tenantId: form.get("tenantId"),
    label: form.get("label"),
  }
  const created = await api("/v1/admin/credentials", { method: "POST", body })
  $("#created-token").textContent = `新 token 仅显示一次:\n${created.token}`
  event.currentTarget.reset()
  await refreshAll()
})

document.addEventListener("click", async (event) => {
  const action = event.target?.dataset?.action
  if (!action) return
  const id = event.target.dataset.id
  const reason = event.target.dataset.reason || prompt("原因（可选）") || ""
  if (action === "revoke-target") await api(`/v1/admin/devices/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { reason } })
  if (action === "restore-target") await api(`/v1/admin/devices/${encodeURIComponent(id)}/restore`, { method: "POST" })
  if (action === "revoke-session") await api(`/v1/admin/sessions/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { reason } })
  if (action === "revoke-credential") await api(`/v1/admin/credentials/${encodeURIComponent(id)}/revoke`, { method: "POST", body: { reason } })
  await refreshAll()
})

async function refreshAll() {
  if (!state.token) {
    renderStatus("请输入 Admin Token", true)
    return
  }

  try {
    renderStatus("加载中...")
    const [health, info, tenants, devices, sessions, audit, credentials] = await Promise.all([
      publicApi("/health"),
      publicApi("/v1/gateway/info"),
      api("/v1/admin/tenants"),
      api("/v1/admin/devices"),
      api("/v1/admin/sessions"),
      api("/v1/admin/audit-events?limit=100"),
      api("/v1/admin/credentials").catch((error) => ({ error: error.message, credentials: [] })),
    ])
    state.data = { health, info, tenants, devices, sessions, audit, credentials }
    renderStatus("已连接")
    render()
  } catch (error) {
    renderStatus(error.message, true)
  }
}

async function publicApi(path) {
  const response = await fetch(path)
  if (!response.ok) throw new Error(`${path} ${response.status}`)
  return response.json()
}

async function api(path, options = {}) {
  const response = await fetch(path, {
    method: options.method || "GET",
    headers: {
      "content-type": "application/json",
      "x-mcode-admin-token": state.token,
      "x-mcode-admin-actor": "relay-web-admin",
    },
    body: options.body ? JSON.stringify(cleanBody(options.body)) : undefined,
  })
  const payload = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(payload.reason || payload.error || `${path} ${response.status}`)
  return payload
}

function cleanBody(body) {
  return Object.fromEntries(
    Object.entries(body)
      .map(([key, value]) => [key, typeof value === "string" ? value.trim() : value])
      .filter(([, value]) => value !== "" && value !== null && value !== undefined)
  )
}

function renderStatus(message, isError = false) {
  const node = $("#status")
  node.textContent = message
  node.style.color = isError ? "var(--danger)" : "var(--muted)"
}

function render() {
  if (!state.data) {
    $("#metrics").innerHTML = ""
    for (const id of ["tenants", "devices", "sessions", "audit-events", "credentials"]) {
      $(`#${id}`).innerHTML = empty("等待连接")
    }
    return
  }

  const { health, info, tenants, devices, sessions, audit, credentials } = state.data
  $("#metrics").innerHTML = [
    metric("Targets", health.stats?.targets),
    metric("Sessions", health.stats?.sessions),
    metric("Tenants", health.stats?.tenants),
    metric("Audit", health.stats?.auditEvents),
    metric("Gateway", escapeHtml(info.gatewayName || health.gatewayName || "MCode Gateway")),
    metric("Env", escapeHtml(info.deployment?.environment || health.deploymentEnv || "-")),
    metric("Storage", escapeHtml(info.storage?.pairingStore || "-")),
    metric("Admin Credentials", health.stats?.adminCredentials),
  ].join("")

  $("#tenants").innerHTML = rows(tenants.tenants, renderTenant)
  $("#devices").innerHTML = rows(devices.devices, renderDevice)
  $("#sessions").innerHTML = rows(sessions.sessions, renderSession)
  $("#audit-events").innerHTML = rows(audit.events, renderAudit)
  $("#credentials").innerHTML = credentials.error
    ? empty(`凭据不可见：${escapeHtml(credentials.error)}`)
    : rows(credentials.credentials, renderCredential)
}

function metric(label, value) {
  return `<div class="metric"><span>${label}</span><strong>${value ?? "-"}</strong></div>`
}

function rows(items, renderer) {
  return Array.isArray(items) && items.length ? items.map(renderer).join("") : empty("暂无数据")
}

function empty(text) {
  return `<div class="row"><span class="hint">${text}</span></div>`
}

function renderTenant(tenant) {
  return `<div class="row">
    <div class="row-head"><span class="row-title">${escapeHtml(tenant.tenantId)}</span><span>${escapeHtml(tenant.tenantName || "")}</span></div>
    <div class="row-meta">
      <span class="pill">targets ${tenant.targets}</span>
      <span class="pill">online ${tenant.onlineTargets}</span>
      <span class="pill">sessions ${tenant.sessions}</span>
      <span class="pill">audit ${tenant.auditEvents}</span>
    </div>
  </div>`
}

function renderDevice(device) {
  return `<div class="row">
    <div class="row-head"><span class="row-title">${escapeHtml(device.targetId)}</span><span>${device.online ? "online" : "offline"}</span></div>
    <div class="row-meta">
      <span class="pill">${escapeHtml(device.targetAgent)}</span>
      <span class="pill">tenant ${escapeHtml(device.tenantId || "default")}</span>
      <span class="pill">${device.revoked ? "revoked" : "active"}</span>
    </div>
    <div class="row-actions">
      <button class="danger" data-action="revoke-target" data-id="${escapeAttr(device.targetId)}">吊销</button>
      <button class="ghost" data-action="restore-target" data-id="${escapeAttr(device.targetId)}">恢复</button>
    </div>
  </div>`
}

function renderSession(session) {
  return `<div class="row">
    <div class="row-head"><span class="row-title">${escapeHtml(session.sessionId)}</span><span>${session.revokedAt ? "revoked" : "active"}</span></div>
    <div class="row-meta">
      <span class="pill">target ${escapeHtml(session.targetId)}</span>
      <span class="pill">tenant ${escapeHtml(session.tenantId || "default")}</span>
      <span class="pill">${escapeHtml(session.deviceName || "unknown device")}</span>
    </div>
    <div class="row-actions">
      <button class="danger" data-action="revoke-session" data-id="${escapeAttr(session.sessionId)}">吊销会话</button>
    </div>
  </div>`
}

function renderAudit(event) {
  return `<div class="row">
    <div class="row-head"><span class="row-title">${escapeHtml(event.type)}</span><span>${formatTime(event.createdAt)}</span></div>
    <div class="row-meta">
      <span class="pill">tenant ${escapeHtml(event.tenantId || "default")}</span>
      <span class="pill">actor ${escapeHtml(event.actor || "-")}</span>
      ${event.targetId ? `<span class="pill">target ${escapeHtml(event.targetId)}</span>` : ""}
    </div>
  </div>`
}

function renderCredential(credential) {
  return `<div class="row">
    <div class="row-head"><span class="row-title">${escapeHtml(credential.credentialId)}</span><span>${credential.revokedAt ? "revoked" : "active"}</span></div>
    <div class="row-meta">
      <span class="pill">${escapeHtml(credential.role)}</span>
      <span class="pill">tenant ${escapeHtml(credential.tenantId || "global")}</span>
      <span class="pill">${escapeHtml(credential.label || "-")}</span>
    </div>
    <div class="row-actions">
      <button class="danger" data-action="revoke-credential" data-id="${escapeAttr(credential.credentialId)}">吊销凭据</button>
    </div>
  </div>`
}

function formatTime(value) {
  return value ? new Date(value).toLocaleString() : "-"
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;",
  })[char])
}

function escapeAttr(value) {
  return escapeHtml(value).replace(/`/g, "&#96;")
}

render()
if (state.token) refreshAll()
