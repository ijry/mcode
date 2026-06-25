# MCode Multi-Provider Connection Routing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade `mcode-app`, `mcode-relay`, and a new `mcode-desktop` Tauri app so MCode can model target type separately from route mode, support direct `codeg` / `opencode`, and support `mcode-desktop` direct or gateway connections for official CLI proxying and tunnel exposure.

**Architecture:** Keep `mcode-app` pages consuming one app-facing remote contract, but resolve connections through `targetType + routeMode` instead of the old `direct | relay` split. Extend `mcode-relay` to return target metadata, protocol version, and replay-capable event streams, then introduce `mcode-desktop` as a Tauri host that manages CLI adapters, local bridge service, tray lifecycle, and relay upstream registration.

**Tech Stack:** `mcode-app` (Vue 3, uni-app, uview-plus, TypeScript, Jest), `mcode-relay` (Node.js, Fastify, TypeScript, Vitest, ws), `mcode-desktop` (Tauri, Rust, Vue 3, Vite, TypeScript, Vitest, Cargo test)

## Global Constraints

- Preserve the ability to run without `mcode-desktop`: `codeg` and `opencode` must remain valid direct targets.
- Treat `codex` official CLI and `claude` official CLI as `mcode-desktop` capabilities, not standalone mobile-side target types.
- User-visible copy must prefer `网关`; do not add new `中继` copy while keeping legacy storage compatibility.
- Read legacy connection/config-code `version: 1`; write new records and exported config codes as `version: 2`.
- `mcode-relay`, `mcode-app`, and `mcode-desktop` protocol changes must stay in sync for `targetType`, capability metadata, and pair/session refresh payloads.
- `mcode-desktop` must be implemented as a Tauri desktop app with tray/background lifecycle, not a CLI-first product.
- Runtime mechanics for `mcode-desktop` should mirror the approved `LinkShell`-inspired behavior: protocol version handshake, ACK/replay buffering, reconnect, single-controller state, and tunnel preview support.
- Any `mcode-app` UI edits must keep using `uview-plus` runtime `--up-*` theme variables; do not add new `--mcode-*` theme aliases.
- Every code change in this feature set must keep [2026-06-25-multi-provider-connection-routing.md](/D:/Repos/xyito/lingyun/mcode/docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md) aligned with the implemented behavior.
- Do not touch unrelated worktree changes in `mcode-app/src/pages/conversation-detail/detailStatusPresentation.ts` or `mcode-app/src/pages/conversation-detail/index.vue`.

---

## File Structure

- `mcode-app/src/services/connectionSchema.ts`
  - Owns `version: 1` -> `version: 2` migration, normalized record types, storage keys, and capability metadata helpers.
- `mcode-app/src/services/connectionContext.ts`
  - Resolves stored connection records into live gateway/driver instances and persists refreshed tokens/sessions/target metadata.
- `mcode-app/src/pages/connections/connectionConfigCode.ts`
  - Encodes/decodes import/export payloads and keeps backward compatibility with v1 config codes.
- `mcode-app/src/pages/connections/connectionPresentation.ts`
  - Presents target label, route label, provider label, capability chips, and card subtitles.
- `mcode-app/src/pages/connections/index.vue`
  - Updates the add-connection flow to the new `直连` vs `中转（网关）` information architecture.
- `mcode-app/src/services/gateway/connectionDriverRegistry.ts`
  - Chooses the correct driver from `targetType + routeMode`.
- `mcode-app/src/services/gateway/drivers/*.ts`
  - Implements direct/gateway adapters without changing page-level call sites.
- `mcode-relay/src/protocol/*.ts`
  - Defines relay-specific target metadata, upstream/mobile event frames, ACK/replay state, and tunnel route validation.
- `mcode-relay/src/server.ts`
  - Extends pair/refresh/proxy/events routes and exposes target metadata and replay-capable event subscription.
- `mcode-relay/src/tunnel/hub.ts`
  - Tracks online desktops, pending proxy calls, mobile subscribers, replay windows, and controller state.
- `mcode-relay/src/pairing/store.ts`
  - Persists target type, display name, capabilities, preferred mode, protocol version, and session timestamps.
- `mcode-desktop/src/*`
  - Vue/Tauri frontend pages for connection state, CLI capability status, tunnel management, QR/pair flows, and diagnostics.
- `mcode-desktop/src-tauri/src/*`
  - Rust backend for bridge server, CLI adapters, tray lifecycle, relay upstream, tunnel manager, and target profile generation.

### Task 1: App Connection Schema And Config-Code Migration

**Files:**
- Create: `mcode-app/src/services/connectionSchema.ts`
- Modify: `mcode-app/src/services/connectionContext.ts`
- Modify: `mcode-app/src/pages/connections/connectionConfigCode.ts`
- Create: `mcode-app/tests/services/connectionSchema.spec.ts`
- Modify: `mcode-app/tests/pages/connections/connectionConfigCode.spec.ts`

**Interfaces:**
- Consumes: existing `mcode_connections` storage payloads and legacy `ConfigCodePayload.version === 1`
- Produces:
  - `export type ConnectionTargetType = "codeg" | "opencode" | "mcode-desktop"`
  - `export type ConnectionRouteMode = "direct" | "gateway"`
  - `export type ConnectionGatewayProvider = "official" | "custom"`
  - `export interface ConnectionRecordV2`
  - `export function normalizeConnectionRecordV2(input: Record<string, unknown>): ConnectionRecordV2 | null`
  - `export function migrateConnectionRecord(input: unknown): ConnectionRecordV2 | null`
  - `export function buildConnectionRecordKey(record: Pick<ConnectionRecordV2, "targetType" | "routeMode" | "directBaseUrl" | "gatewayBaseUrl">): string`
  - `export function normalizePairTargetProfile(input: unknown): ConnectionTargetProfile | null`
  - `export function normalizeV2ConfigCodePayload(input: ConfigCodePayloadV2): ConnectionRecordV2`

- [ ] **Step 1: Write the failing schema and config-code tests**

```ts
// mcode-app/tests/services/connectionSchema.spec.ts
import {
  buildConnectionRecordKey,
  migrateConnectionRecord,
  type ConnectionRecordV2,
} from "@/services/connectionSchema"

describe("connectionSchema", () => {
  it("migrates legacy direct records into v2 codeg/direct records", () => {
    expect(
      migrateConnectionRecord({
        name: "Legacy Direct",
        mode: "direct",
        url: "http://127.0.0.1:3089/",
        directToken: "token-1",
      })
    ).toEqual({
      version: 2,
      name: "Legacy Direct",
      targetType: "codeg",
      routeMode: "direct",
      directBaseUrl: "http://127.0.0.1:3089",
      directToken: "token-1",
    } satisfies ConnectionRecordV2)
  })

  it("builds different keys for direct and gateway routes of the same target", () => {
    const direct = buildConnectionRecordKey({
      targetType: "mcode-desktop",
      routeMode: "direct",
      directBaseUrl: "http://10.0.0.8:3089",
    } as ConnectionRecordV2)

    const gateway = buildConnectionRecordKey({
      targetType: "mcode-desktop",
      routeMode: "gateway",
      gatewayBaseUrl: "https://relay.example.com",
    } as ConnectionRecordV2)

    expect(direct).not.toBe(gateway)
  })
})
```

```ts
// mcode-app/tests/pages/connections/connectionConfigCode.spec.ts
it("encodes and decodes v2 desktop gateway config codes", () => {
  const code = buildConnectionConfigCode({
    name: "Desk Relay",
    targetType: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "official",
    pairCode: "ABCD-1234",
    pairSecret: "pair-secret",
  })

  expect(parseConnectionConfigCodeToConnection(code)).toEqual({
    version: 2,
    name: "Desk Relay",
    targetType: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "official",
    pairCode: "ABCD-1234",
    pairSecret: "pair-secret",
  })
})
```

- [ ] **Step 2: Run the targeted app tests and verify they fail on missing exports**

Run: `cd mcode-app && npm run test:unit -- tests/services/connectionSchema.spec.ts tests/pages/connections/connectionConfigCode.spec.ts`

Expected: FAIL with missing `connectionSchema` module or missing `version: 2` payload support.

- [ ] **Step 3: Implement the v2 schema and migration layer**

```ts
// mcode-app/src/services/connectionSchema.ts
export interface ConnectionTargetProfile {
  targetType: ConnectionTargetType
  targetId?: string
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export interface ConnectionRecordV2 {
  version: 2
  name: string
  targetType: ConnectionTargetType
  routeMode: ConnectionRouteMode
  directBaseUrl?: string
  directToken?: string
  gatewayProvider?: ConnectionGatewayProvider
  gatewayBaseUrl?: string
  pairCode?: string
  pairSecret?: string
  gatewaySession?: RelaySessionInfo | null
  targetProfile?: ConnectionTargetProfile | null
}

export function migrateConnectionRecord(input: unknown): ConnectionRecordV2 | null {
  const raw = input && typeof input === "object" ? (input as Record<string, unknown>) : null
  if (!raw) return null
  if (raw.version === 2) {
    return normalizeConnectionRecordV2(raw)
  }
  if (raw.mode === "direct") {
    return normalizeConnectionRecordV2({
      version: 2,
      name: raw.name,
      targetType: "codeg",
      routeMode: "direct",
      directBaseUrl: raw.url,
      directToken: raw.directToken,
    })
  }
  if (raw.mode === "relay") {
    return normalizeConnectionRecordV2({
      version: 2,
      name: raw.name,
      targetType: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: raw.url,
      pairCode: raw.pairCode,
      pairSecret: raw.pairSecret,
      gatewaySession: raw.relaySession,
    })
  }
  return null
}
```

```ts
// mcode-app/src/pages/connections/connectionConfigCode.ts
export interface ConfigCodePayloadV2 {
  version: 2
  name: string
  targetType: ConnectionTargetType
  routeMode: ConnectionRouteMode
  directBaseUrl?: string
  directToken?: string
  gatewayProvider?: ConnectionGatewayProvider
  gatewayBaseUrl?: string
  pairCode?: string
  pairSecret?: string
  gatewaySession?: RelaySessionInfo
  targetProfile?: ConnectionTargetProfile
}

export function parseConnectionConfigCodeToConnection(code: string): ConnectionRecordV2 {
  const payload = decodeConnectionConfigCode(code)
  if ((payload as { version?: number }).version === 2) {
    return normalizeV2ConfigCodePayload(payload as ConfigCodePayloadV2)
  }
  const migrated = migrateConnectionRecord(projectConfigCodePayloadToLegacyConnection(payload as ConfigCodePayload))
  if (!migrated) throw new Error("不支持的配置码内容")
  return migrated
}
```

- [ ] **Step 4: Update `connectionContext.ts` to read and persist v2 records**

```ts
// mcode-app/src/services/connectionContext.ts
export interface ConnectionContext extends ConnectionRecordV2 {}

export function readStoredConnections(): ConnectionContext[] {
  const raw = uni.getStorageSync("mcode_connections")
  if (!Array.isArray(raw)) return []
  return raw
    .map((item) => migrateConnectionRecord(item))
    .filter((item): item is ConnectionContext => Boolean(item))
}

export function persistResolvedConnection(connection: ConnectionContext) {
  const saved = readStoredConnections()
  const key = buildConnectionRecordKey(connection)
  const index = saved.findIndex((item) => buildConnectionRecordKey(item) === key)
  if (index < 0) return
  saved[index] = { ...saved[index], ...connection }
  uni.setStorageSync("mcode_connections", saved)
}
```

- [ ] **Step 5: Re-run the app tests and make sure they pass**

Run: `cd mcode-app && npm run test:unit -- tests/services/connectionSchema.spec.ts tests/pages/connections/connectionConfigCode.spec.ts`

Expected: PASS with legacy v1 compatibility and new v2 round-trip coverage.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/services/connectionSchema.ts \
  mcode-app/src/services/connectionContext.ts \
  mcode-app/src/pages/connections/connectionConfigCode.ts \
  mcode-app/tests/services/connectionSchema.spec.ts \
  mcode-app/tests/pages/connections/connectionConfigCode.spec.ts
git commit -m "feat(app): add v2 connection schema and config codes"
```

### Task 2: App Connection UI And Presentation Refactor

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`
- Modify: `mcode-app/src/pages/connections/connectionPresentation.ts`
- Modify: `mcode-app/src/pages.json`
- Modify: `mcode-app/tests/pages/connections/connectionPresentation.spec.ts`

**Interfaces:**
- Consumes:
  - `ConnectionRecordV2`
  - `buildConnectionRecordKey(record): string`
  - `buildConnectionConfigCode(record): string`
- Produces:
  - `getConnectionTargetLabel(connection: ConnectionRecordV2): string`
  - `getConnectionRouteLabel(connection: ConnectionRecordV2): string`
  - `getConnectionProviderLabel(connection: ConnectionRecordV2): string | ""`
  - `getConnectionSubtitle(connection: ConnectionRecordV2): string`
  - updated add-form sections for `直连` and `中转（网关）`

- [ ] **Step 1: Write failing presentation tests for target and route labels**

```ts
// mcode-app/tests/pages/connections/connectionPresentation.spec.ts
import {
  getConnectionProviderLabel,
  getConnectionRouteLabel,
  getConnectionSubtitle,
  getConnectionTargetLabel,
} from "@/pages/connections/connectionPresentation"

it("renders desktop gateway subtitles with provider context", () => {
  const subtitle = getConnectionSubtitle({
    targetType: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "official",
    gatewayBaseUrl: "https://relay.example.com",
  } as any)

  expect(getConnectionTargetLabel({ targetType: "mcode-desktop" } as any)).toBe("MCode Desktop")
  expect(getConnectionRouteLabel({ routeMode: "gateway" } as any)).toBe("网关")
  expect(getConnectionProviderLabel({ gatewayProvider: "official" } as any)).toBe("MCode 官方网关")
  expect(subtitle).toContain("MCode Desktop")
  expect(subtitle).toContain("网关")
})
```

- [ ] **Step 2: Run the presentation test and verify current copy fails**

Run: `cd mcode-app && npm run test:unit -- tests/pages/connections/connectionPresentation.spec.ts`

Expected: FAIL because the current helpers only know `direct | relay`.

- [ ] **Step 3: Replace mode-only presentation helpers with target + route helpers**

```ts
// mcode-app/src/pages/connections/connectionPresentation.ts
export function getConnectionTargetLabel(connection: Pick<ConnectionRecordV2, "targetType">): string {
  if (connection.targetType === "opencode") return "OpenCode"
  if (connection.targetType === "mcode-desktop") return "MCode Desktop"
  return "Codeg"
}

export function getConnectionRouteLabel(connection: Pick<ConnectionRecordV2, "routeMode">): string {
  return connection.routeMode === "gateway" ? "网关" : "直连"
}

export function getConnectionSubtitle(connection: Pick<
  ConnectionRecordV2,
  "targetType" | "routeMode" | "gatewayProvider" | "directBaseUrl" | "gatewayBaseUrl"
>): string {
  const parts = [getConnectionTargetLabel(connection), getConnectionRouteLabel(connection)]
  const provider = getConnectionProviderLabel(connection)
  if (provider) parts.push(provider)
  parts.push(connection.routeMode === "direct" ? connection.directBaseUrl || "" : connection.gatewayBaseUrl || "")
  return parts.filter(Boolean).join(" · ")
}
```

- [ ] **Step 4: Rewrite the add-connection form in `pages/connections/index.vue`**

```ts
// script setup additions in mcode-app/src/pages/connections/index.vue
const routeModeOptions = ["直连", "中转（网关）"] as const
const directTargetOptions = [
  { label: "Codeg", value: "codeg" },
  { label: "OpenCode", value: "opencode" },
  { label: "MCode Desktop", value: "mcode-desktop" },
] as const
const gatewayProviderOptions = [
  { label: "MCode 官方网关", value: "official" },
  { label: "自定义", value: "custom" },
] as const

const form = ref({
  name: "",
  routeMode: "direct" as ConnectionRouteMode,
  targetType: "codeg" as ConnectionTargetType,
  directBaseUrl: "",
  directToken: "",
  gatewayProvider: "official" as ConnectionGatewayProvider,
  gatewayBaseUrl: "",
  pairCode: "",
  pairSecret: "",
})
```

```vue
<!-- template branch in mcode-app/src/pages/connections/index.vue -->
<u-form-item label="连接方式" required>
  <u-radio-group :modelValue="form.routeMode" placement="row" @change="handleRouteModeChange">
    <u-radio name="direct" label="直连"></u-radio>
    <u-radio name="gateway" label="中转（网关）"></u-radio>
  </u-radio-group>
</u-form-item>

<template v-if="form.routeMode === 'direct'">
  <u-form-item label="目标类型" required>
    <u-subsection :list="['Codeg', 'OpenCode', 'MCode Desktop']" :current="directTargetIndex" @change="handleDirectTargetChange" />
  </u-form-item>
</template>

<template v-else>
  <u-form-item label="通道服务商" required>
    <u-select :columns="[gatewayProviderOptions]" @confirm="handleGatewayProviderConfirm" />
  </u-form-item>
  <u-form-item v-if="form.gatewayProvider === 'custom'" label="自定义域名" required>
    <u-input v-model="form.gatewayBaseUrl" placeholder="https://relay.example.com" />
  </u-form-item>
</template>
```

- [ ] **Step 5: Re-run the app presentation tests**

Run: `cd mcode-app && npm run test:unit -- tests/pages/connections/connectionPresentation.spec.ts tests/pages/connections/connectionConfigCode.spec.ts`

Expected: PASS with new target/route/provider text and no reintroduced `中继模式` copy in user-facing helpers.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/connections/index.vue \
  mcode-app/src/pages/connections/connectionPresentation.ts \
  mcode-app/src/pages.json \
  mcode-app/tests/pages/connections/connectionPresentation.spec.ts
git commit -m "feat(app): redesign connection form for targets and gateway providers"
```

### Task 3: App Driver Registry And Connection Resolution

**Files:**
- Create: `mcode-app/src/services/gateway/connectionDriverRegistry.ts`
- Create: `mcode-app/src/services/gateway/drivers/shared.ts`
- Create: `mcode-app/src/services/gateway/drivers/codegDirectDriver.ts`
- Create: `mcode-app/src/services/gateway/drivers/opencodeDirectDriver.ts`
- Create: `mcode-app/src/services/gateway/drivers/desktopDirectDriver.ts`
- Create: `mcode-app/src/services/gateway/drivers/desktopGatewayDriver.ts`
- Create: `mcode-app/src/services/gateway/drivers/legacyGatewayDriver.ts`
- Modify: `mcode-app/src/services/gateway/types.ts`
- Modify: `mcode-app/src/services/gateway/index.ts`
- Modify: `mcode-app/src/services/connectionContext.ts`
- Create: `mcode-app/tests/services/connectionDriverRegistry.spec.ts`

**Interfaces:**
- Consumes:
  - `ConnectionRecordV2`
  - existing `DirectGateway` and `RelayGateway`
- Produces:
  - `export interface ConnectionDriver`
  - `export function resolveConnectionDriver(record: ConnectionRecordV2): ConnectionDriver`
  - `export interface PairResultMetadata`
  - `export const codegDirectDriver: ConnectionDriver`
  - `export const opencodeDirectDriver: ConnectionDriver`
  - `export const desktopDirectDriver: ConnectionDriver`
  - `export const desktopGatewayDriver: ConnectionDriver`
  - `export const legacyGatewayDriver: ConnectionDriver`
  - `resolveConnectionContext(record): Promise<ResolvedConnectionContext>`

- [ ] **Step 1: Write failing registry tests for targetType + routeMode dispatch**

```ts
// mcode-app/tests/services/connectionDriverRegistry.spec.ts
import { resolveConnectionDriver } from "@/services/gateway/connectionDriverRegistry"

describe("connectionDriverRegistry", () => {
  it("resolves desktop gateway connections to the desktop gateway driver", () => {
    const driver = resolveConnectionDriver({
      version: 2,
      name: "Desktop Relay",
      targetType: "mcode-desktop",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    })

    expect(driver.id).toBe("desktop-gateway")
  })

  it("keeps legacy codeg gateway records on the compatibility driver", () => {
    const driver = resolveConnectionDriver({
      version: 2,
      name: "Legacy Relay",
      targetType: "codeg",
      routeMode: "gateway",
      gatewayProvider: "official",
      gatewayBaseUrl: "https://relay.example.com",
    })

    expect(driver.id).toBe("codeg-gateway-legacy")
  })
})
```

- [ ] **Step 2: Run the registry test and verify it fails**

Run: `cd mcode-app && npm run test:unit -- tests/services/connectionDriverRegistry.spec.ts`

Expected: FAIL because the registry and driver identifiers do not exist yet.

- [ ] **Step 3: Define gateway metadata and driver interfaces**

```ts
// mcode-app/src/services/gateway/types.ts
export interface PairTargetMetadata {
  targetId?: string
  targetType?: "codeg" | "opencode" | "mcode-desktop"
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export interface RelaySessionInfo {
  accessToken: string
  refreshToken?: string
  targetId?: string
  targetType?: string
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}
```

```ts
// mcode-app/src/services/gateway/connectionDriverRegistry.ts
export interface ConnectionDriver {
  id:
    | "codeg-direct"
    | "opencode-direct"
    | "desktop-direct"
    | "desktop-gateway"
    | "codeg-gateway-legacy"
  connect(connection: ConnectionRecordV2): Promise<ResolvedConnectionContext>
}
```

- [ ] **Step 4: Implement the registry and adapt `resolveConnectionContext`**

```ts
// mcode-app/src/services/gateway/connectionDriverRegistry.ts
export function resolveConnectionDriver(connection: ConnectionRecordV2): ConnectionDriver {
  if (connection.routeMode === "direct" && connection.targetType === "opencode") return opencodeDirectDriver
  if (connection.routeMode === "direct" && connection.targetType === "mcode-desktop") return desktopDirectDriver
  if (connection.routeMode === "gateway" && connection.targetType === "mcode-desktop") return desktopGatewayDriver
  if (connection.routeMode === "gateway") return legacyGatewayDriver
  return codegDirectDriver
}
```

```ts
// mcode-app/src/services/connectionContext.ts
export async function resolveConnectionContext(connection: ConnectionContext): Promise<ResolvedConnectionContext> {
  const driver = resolveConnectionDriver(connection)
  const resolved = await driver.connect(connection)
  persistResolvedConnection(resolved.connection)
  return resolved
}
```

- [ ] **Step 5: Re-run the app driver tests and the existing remote settings test suite**

Run: `cd mcode-app && npm run test:unit -- tests/services/connectionDriverRegistry.spec.ts tests/services/remoteSettings.spec.ts`

Expected: PASS with connection resolution shifted behind the driver registry and no regression in remote settings gateway usage.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/services/gateway/types.ts \
  mcode-app/src/services/gateway/index.ts \
  mcode-app/src/services/gateway/connectionDriverRegistry.ts \
  mcode-app/src/services/gateway/drivers \
  mcode-app/src/services/connectionContext.ts \
  mcode-app/tests/services/connectionDriverRegistry.spec.ts
git commit -m "feat(app): add connection driver registry"
```

### Task 4: Relay Target Metadata, ACK Replay, And Tunnel Protocol

**Files:**
- Create: `mcode-relay/src/protocol/types.ts`
- Create: `mcode-relay/src/protocol/replayBuffer.ts`
- Create: `mcode-relay/src/tunnel/httpProxy.ts`
- Modify: `mcode-relay/src/pairing/store.ts`
- Modify: `mcode-relay/src/tunnel/hub.ts`
- Modify: `mcode-relay/src/server.ts`
- Modify: `mcode-relay/test/relay.test.ts`
- Create: `mcode-relay/test/replayBuffer.test.ts`
- Create: `mcode-relay/test/httpProxy.test.ts`

**Interfaces:**
- Consumes: current pair/session/token flow and `RelayHub.sendProxyRequest(...)`
- Produces:
  - `export interface TargetMetadata`
  - `export interface DesktopUpstreamHello`
  - `export interface RelayEventFrame`
  - `export class ReplayBuffer`
  - `export interface TunnelHttpRequest`
  - `export interface TunnelHttpResponse`
  - `buildTunnelProxyPath(targetId: string, port: number, pathname?: string): string`
  - `RelayHub.sendTunnelRequest(targetId: string, request: TunnelHttpRequest): Promise<TunnelHttpResponse>`
  - `/v1/pair` and `/v1/session/refresh` responses with `target.targetType`, `displayName`, `capabilities`, `protocolVersion`

- [ ] **Step 1: Write failing relay tests for target metadata and replay**

```ts
// mcode-relay/test/relay.test.ts
it("returns target type and capabilities in pair responses", async () => {
  store.addOffer({
    code: "123456",
    secret: "secret",
    targetId: "desktop-1",
    targetName: "Work Mac Mini",
    targetType: "mcode-desktop",
    capabilities: ["desktop.runtime.codex-cli"],
    protocolVersion: "1",
    ttlSeconds: 300,
  })

  const res = await request(app.server)
    .post("/v1/pair")
    .send({ code: "123456", secret: "secret" })

  expect(res.body.target.targetType).toBe("mcode-desktop")
  expect(res.body.target.capabilities).toContain("desktop.runtime.codex-cli")
  expect(res.body.target.protocolVersion).toBe("1")
})
```

```ts
// mcode-relay/test/replayBuffer.test.ts
import { ReplayBuffer } from "../src/protocol/replayBuffer.js"

it("replays events after a last acknowledged id", () => {
  const buffer = new ReplayBuffer(4)
  buffer.push({ eventId: 1, payload: { type: "ready" } })
  buffer.push({ eventId: 2, payload: { type: "delta" } })

  expect(buffer.after(1).map((event) => event.eventId)).toEqual([2])
})
```

```ts
// mcode-relay/test/httpProxy.test.ts
import { buildTunnelProxyPath } from "../src/tunnel/httpProxy.js"

it("builds tunnel proxy paths under the desktop target", () => {
  expect(buildTunnelProxyPath("desktop-1", 1080, "/preview")).toBe("/v1/tunnel/desktop-1/1080/preview")
})
```

- [ ] **Step 2: Run the relay tests and verify they fail**

Run: `cd mcode-relay && npm test -- test/relay.test.ts test/replayBuffer.test.ts test/httpProxy.test.ts`

Expected: FAIL because `targetType`, `capabilities`, and replay helpers are not implemented.

- [ ] **Step 3: Extend the relay store and protocol types**

```ts
// mcode-relay/src/protocol/types.ts
export interface TargetMetadata {
  targetId: string
  targetType: "codeg" | "opencode" | "mcode-desktop"
  displayName: string | null
  capabilities: string[]
  protocolVersion: string
}

export interface RelayEventFrame {
  eventId: number
  channel: string
  payload: unknown
  controllerId?: string | null
}
```

```ts
// mcode-relay/src/pairing/store.ts
export interface TargetRecord {
  targetId: string
  targetName: string | null
  targetType: "codeg" | "opencode" | "mcode-desktop"
  capabilities: string[]
  protocolVersion: string
  relayUrl: string | null
  pairedAt: number
  lastSeenAt: number | null
  preferredMode: "relay" | "direct"
  revoked: boolean
}
```

- [ ] **Step 4: Add replay buffering and mobile re-subscription support**

```ts
// mcode-relay/src/protocol/replayBuffer.ts
export class ReplayBuffer {
  constructor(private readonly maxSize: number, private readonly items: RelayEventFrame[] = []) {}

  push(frame: RelayEventFrame): void {
    this.items.push(frame)
    while (this.items.length > this.maxSize) this.items.shift()
  }

  after(lastEventId: number): RelayEventFrame[] {
    return this.items.filter((item) => item.eventId > lastEventId)
  }
}
```

```ts
// mcode-relay/src/tunnel/hub.ts
attachMobileSubscriber(targetId: string, socket: WebSocket, lastEventId = 0): void {
  const set = this.mobileSubscribers.get(targetId) ?? new Set<WebSocket>()
  set.add(socket)
  this.mobileSubscribers.set(targetId, set)
  for (const frame of this.getReplayFrames(targetId, lastEventId)) {
    if (socket.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify(frame))
    }
  }
  socket.on("close", () => this.detachMobileSubscriber(targetId, socket))
}
```

```ts
// mcode-relay/src/tunnel/httpProxy.ts
export function buildTunnelProxyPath(targetId: string, port: number, pathname = "/"): string {
  const cleanPath = pathname.startsWith("/") ? pathname : `/${pathname}`
  return `/v1/tunnel/${targetId}/${port}${cleanPath}`
}
```

```ts
// mcode-relay/src/server.ts
app.all("/v1/tunnel/:targetId/:port/*", async (req, reply) => {
  const claims = await authenticate(req, context.config)
  if (claims.targetId !== (req.params as { targetId: string }).targetId) {
    return reply.code(403).send({ error: "target mismatch" })
  }
  const params = req.params as { targetId: string; port: string; "*": string }
  const result = await context.hub.sendTunnelRequest(params.targetId, {
    port: Number(params.port),
    method: req.method,
    path: `/${params["*"] || ""}`,
    headers: req.headers,
  })
  return reply.status(result.status).headers(result.headers).send(result.body)
})
```

- [ ] **Step 5: Update HTTP/WS routes and verify the relay tests pass**

Run: `cd mcode-relay && npm test -- test/relay.test.ts test/replayBuffer.test.ts test/httpProxy.test.ts`

Expected: PASS with:
- pair/refresh returning full target metadata
- `/v1/events` replaying missed events after `lastEventId`
- `/v1/tunnel/:targetId/:port/*` validating target ownership and forwarding request metadata
- store and hub keeping target type/capability/protocol version in sync

- [ ] **Step 6: Commit**

```bash
git add mcode-relay/src/protocol \
  mcode-relay/src/pairing/store.ts \
  mcode-relay/src/tunnel/httpProxy.ts \
  mcode-relay/src/tunnel/hub.ts \
  mcode-relay/src/server.ts \
  mcode-relay/test/relay.test.ts \
  mcode-relay/test/replayBuffer.test.ts \
  mcode-relay/test/httpProxy.test.ts
git commit -m "feat(relay): add target metadata and replayable events"
```

### Task 5: Desktop Tauri Shell And Shared State Scaffold

**Files:**
- Create: `mcode-desktop/package.json`
- Create: `mcode-desktop/tsconfig.json`
- Create: `mcode-desktop/vite.config.ts`
- Create: `mcode-desktop/src/main.ts`
- Create: `mcode-desktop/src/App.vue`
- Create: `mcode-desktop/src/pages/ConnectionsPage.vue`
- Create: `mcode-desktop/src/pages/TunnelPage.vue`
- Create: `mcode-desktop/src/stores/desktopRuntime.ts`
- Create: `mcode-desktop/src/lib/pairing.ts`
- Create: `mcode-desktop/src-tauri/Cargo.toml`
- Create: `mcode-desktop/src-tauri/tauri.conf.json`
- Create: `mcode-desktop/src-tauri/src/main.rs`
- Create: `mcode-desktop/src-tauri/src/lib.rs`
- Create: `mcode-desktop/src-tauri/src/app_state.rs`
- Create: `mcode-desktop/src-tauri/src/tray.rs`
- Create: `mcode-desktop/src/lib/pairing.spec.ts`

**Interfaces:**
- Consumes: target metadata contract from Task 4
- Produces:
  - frontend `DesktopRuntimeStore`
  - backend `AppState`
  - `generatePairOffer(): Promise<{ code: string; secret: string; qrPayload: string }>`
  - `buildGatewayQrPayload(input): ConnectionRecordV2-compatible payload`
  - tray commands `show_window`, `hide_window`, `shutdown_runtime`

- [ ] **Step 1: Write failing desktop frontend tests for pair-offer payload generation**

```ts
// mcode-desktop/src/lib/pairing.spec.ts
import { buildGatewayQrPayload } from "./pairing"

it("builds a v2 desktop gateway QR payload", () => {
  expect(
    buildGatewayQrPayload({
      name: "Work Mac Mini",
      gatewayProvider: "official",
      pairCode: "ABCD-1234",
      pairSecret: "pair-secret",
    })
  ).toEqual({
    version: 2,
    name: "Work Mac Mini",
    targetType: "mcode-desktop",
    routeMode: "gateway",
    gatewayProvider: "official",
    pairCode: "ABCD-1234",
    pairSecret: "pair-secret",
  })
})
```

- [ ] **Step 2: Create the Tauri workspace skeleton and run the new frontend test**

Run: `cd mcode-desktop && npm test -- src/lib/pairing.spec.ts`

Expected: FAIL because the desktop workspace and pairing helper do not exist yet.

- [ ] **Step 3: Add the minimal Tauri shell, tabs, and tray-managed app state**

```ts
// mcode-desktop/src/stores/desktopRuntime.ts
export const useDesktopRuntimeStore = defineStore("desktopRuntime", {
  state: () => ({
    relayStatus: "offline" as "offline" | "connecting" | "online",
    activeTargetType: "mcode-desktop" as const,
    capabilities: [] as string[],
    pairCode: "",
    pairSecret: "",
  }),
})
```

```rust
// mcode-desktop/src-tauri/src/app_state.rs
pub struct AppState {
    pub relay_url: RwLock<Option<String>>,
    pub pair_offer: RwLock<Option<PairOffer>>,
    pub capabilities: RwLock<Vec<String>>,
}
```

- [ ] **Step 4: Implement pair-offer payload helpers and basic tray commands**

```ts
// mcode-desktop/src/lib/pairing.ts
export function buildGatewayQrPayload(input: {
  name: string
  gatewayProvider: "official" | "custom"
  gatewayBaseUrl?: string
  pairCode: string
  pairSecret: string
}) {
  return {
    version: 2,
    name: input.name,
    targetType: "mcode-desktop" as const,
    routeMode: "gateway" as const,
    gatewayProvider: input.gatewayProvider,
    ...(input.gatewayBaseUrl ? { gatewayBaseUrl: input.gatewayBaseUrl } : {}),
    pairCode: input.pairCode,
    pairSecret: input.pairSecret,
  }
}
```

```rust
// mcode-desktop/src-tauri/src/tray.rs
pub fn build_tray_menu() -> SystemTrayMenu {
    SystemTrayMenu::new()
        .add_item(CustomMenuItem::new("show_window", "Show MCode Desktop"))
        .add_item(CustomMenuItem::new("shutdown_runtime", "Stop Bridge"))
}
```

- [ ] **Step 5: Re-run the desktop frontend test**

Run: `cd mcode-desktop && npm test -- src/lib/pairing.spec.ts`

Expected: PASS with a bootable desktop workspace, pair QR payload helper, and tray/app-state scaffolding in place.

- [ ] **Step 6: Commit**

```bash
git add mcode-desktop
git commit -m "feat(desktop): scaffold tauri host shell"
```

### Task 6: Desktop Bridge, CLI Capability Host, And Relay Upstream

**Files:**
- Create: `mcode-desktop/src-tauri/src/bridge/mod.rs`
- Create: `mcode-desktop/src-tauri/src/bridge/http.rs`
- Create: `mcode-desktop/src-tauri/src/bridge/events.rs`
- Create: `mcode-desktop/src-tauri/src/runtime/mod.rs`
- Create: `mcode-desktop/src-tauri/src/runtime/codex_cli.rs`
- Create: `mcode-desktop/src-tauri/src/runtime/claude_cli.rs`
- Create: `mcode-desktop/src-tauri/src/gateway/mod.rs`
- Create: `mcode-desktop/src-tauri/src/gateway/upstream.rs`
- Create: `mcode-desktop/src-tauri/src/tunnel/mod.rs`
- Create: `mcode-desktop/src-tauri/tests/upstream_registration.rs`
- Create: `mcode-desktop/src-tauri/tests/capabilities.rs`
- Create: `mcode-desktop/src-tauri/tests/tunnel_bindings.rs`

**Interfaces:**
- Consumes:
  - relay `TargetMetadata`, `RelayEventFrame`, replay handshake
  - desktop `AppState`
- Produces:
  - local bridge routes for project/session/event commands
  - upstream registration message with `targetType = "mcode-desktop"`
  - capability list containing `desktop.runtime.codex-cli`, `desktop.runtime.claude-cli`, `desktop.tunnel.available`
  - `detect_capabilities(codex_path, claude_path): Vec<String>`
  - `TunnelBinding::for_code_preview(port, upstream_origin) -> TunnelBinding`
  - `connect_upstream(state, relay_url) -> Result<()>`
  - `open_upstream_socket(relay_url) -> Result<WebSocketStream>`
  - `parse_upstream_frame(message) -> Result<RelayControlFrame>`
  - `handle_upstream_frame(state, frame) -> Result<()>`
  - `dispatch_codex_proxy(command, payload) -> Result<serde_json::Value>`
  - `proxy_http_request(upstream_origin, request) -> Result<TunnelHttpResponse>`
  - `serve_tunnel_request(binding, request) -> Result<TunnelHttpResponse>`

- [ ] **Step 1: Write failing Rust tests for upstream registration and capability reporting**

```rust
// mcode-desktop/src-tauri/tests/capabilities.rs
#[test]
fn reports_codex_and_claude_capabilities_when_binaries_are_available() {
    let capabilities = detect_capabilities(Some("codex"), Some("claude"));
    assert!(capabilities.contains(&"desktop.runtime.codex-cli".to_string()));
    assert!(capabilities.contains(&"desktop.runtime.claude-cli".to_string()));
}
```

```rust
// mcode-desktop/src-tauri/tests/upstream_registration.rs
#[test]
fn builds_desktop_upstream_hello_with_target_metadata() {
    let hello = DesktopUpstreamHello::new("desktop-1", "Work Mac Mini", vec!["desktop.runtime.codex-cli".into()]);
    assert_eq!(hello.target_type, "mcode-desktop");
    assert_eq!(hello.protocol_version, "1");
}
```

```rust
// mcode-desktop/src-tauri/tests/tunnel_bindings.rs
#[test]
fn binds_code_preview_to_loopback_port_1080() {
    let binding = TunnelBinding::for_code_preview(1080, "http://127.0.0.1:3000");
    assert_eq!(binding.local_bind, "127.0.0.1:1080");
    assert_eq!(binding.upstream_origin, "http://127.0.0.1:3000");
}
```

- [ ] **Step 2: Run the desktop Rust tests and verify they fail**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml capabilities upstream_registration tunnel_bindings`

Expected: FAIL because the runtime, capability detector, and upstream hello payload are not implemented.

- [ ] **Step 3: Implement the bridge server and CLI adapter capability surface**

```rust
// mcode-desktop/src-tauri/src/runtime/mod.rs
pub fn detect_capabilities(codex_path: Option<&str>, claude_path: Option<&str>) -> Vec<String> {
    let mut capabilities = vec!["desktop.tunnel.available".to_string()];
    if codex_path.is_some() {
        capabilities.push("desktop.runtime.codex-cli".to_string());
    }
    if claude_path.is_some() {
        capabilities.push("desktop.runtime.claude-cli".to_string());
    }
    capabilities
}
```

```rust
// mcode-desktop/src-tauri/src/gateway/upstream.rs
pub struct DesktopUpstreamHello {
    pub target_id: String,
    pub target_type: String,
    pub display_name: String,
    pub capabilities: Vec<String>,
    pub protocol_version: String,
}
```

```rust
// mcode-desktop/src-tauri/src/tunnel/mod.rs
pub struct TunnelBinding {
    pub local_bind: String,
    pub upstream_origin: String,
}

impl TunnelBinding {
    pub fn for_code_preview(port: u16, upstream_origin: &str) -> Self {
        Self {
            local_bind: format!("127.0.0.1:{port}"),
            upstream_origin: upstream_origin.to_string(),
        }
    }
}
```

- [ ] **Step 4: Add relay upstream registration, ACK handling, and single-controller state**

```rust
// mcode-desktop/src-tauri/src/gateway/mod.rs
pub async fn connect_upstream(state: Arc<AppState>, relay_url: &str) -> Result<()> {
    let mut socket = open_upstream_socket(relay_url).await?;
    let hello = DesktopUpstreamHello::from_state(&state).await;
    socket.send(Message::Text(serde_json::to_string(&hello)?)).await?;
    while let Some(frame) = socket.next().await {
        let frame = parse_upstream_frame(frame?)?;
        handle_upstream_frame(&state, frame).await?;
    }
    Ok(())
}
```

```rust
// mcode-desktop/src-tauri/src/bridge/events.rs
pub fn emit_event_with_ack(event_id: u64, channel: &str, payload: serde_json::Value) -> RelayEventFrame {
    RelayEventFrame {
        event_id,
        channel: channel.to_string(),
        payload,
        controller_id: None,
    }
}
```

```rust
// mcode-desktop/src-tauri/src/runtime/codex_cli.rs
pub async fn dispatch_codex_proxy(command: &str, payload: serde_json::Value) -> Result<serde_json::Value> {
    match command {
        "list_open_folder_details" => list_open_folder_details().await,
        "list_all_conversations" => list_all_conversations(payload).await,
        "acp_prompt" => acp_prompt(payload).await,
        _ => Err(anyhow!("unsupported codex command: {command}")),
    }
}
```

```rust
// mcode-desktop/src-tauri/src/bridge/http.rs
pub async fn serve_tunnel_request(binding: &TunnelBinding, request: TunnelHttpRequest) -> Result<TunnelHttpResponse> {
    proxy_http_request(&binding.upstream_origin, request).await
}
```

- [ ] **Step 5: Re-run the desktop Rust tests**

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml capabilities upstream_registration tunnel_bindings`

Expected: PASS with upstream registration, capability metadata, controller/ACK scaffolding, and loopback tunnel binding helpers implemented.

- [ ] **Step 6: Commit**

```bash
git add mcode-desktop/src-tauri
git commit -m "feat(desktop): add bridge runtime and relay upstream"
```

### Task 7: App Desktop Gateway Rollout, Tunnel Labels, And Cross-Repo Verification

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`
- Modify: `mcode-app/src/pages/connections/connectionPresentation.ts`
- Modify: `mcode-app/src/services/connectionContext.ts`
- Modify: `mcode-app/tests/pages/connections/connectionPresentation.spec.ts`
- Modify: `mcode-relay/README.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Consumes:
  - relay pair/refresh `targetType`, `displayName`, `capabilities`, `protocolVersion`
  - desktop-generated v2 QR payloads
- Produces:
  - `applyPairMetadata(connection, session, target): ConnectionContext`
  - `getConnectionCapabilityChips(connection): string[]`
  - capability chips on saved connections
  - custom gateway validation and official-provider defaults
  - updated architecture note and relay README for the shipped protocol

- [ ] **Step 1: Write failing app tests for capability-chip presentation**

```ts
// mcode-app/tests/pages/connections/connectionPresentation.spec.ts
it("exposes desktop capability chips from target metadata", () => {
  expect(
    getConnectionCapabilityChips({
      targetType: "mcode-desktop",
      targetProfile: {
        targetType: "mcode-desktop",
        capabilities: ["desktop.runtime.codex-cli", "desktop.tunnel.available"],
      },
    } as any)
  ).toEqual(["Codex CLI", "内网穿透"])
})
```

- [ ] **Step 2: Run the app and relay verification commands before the final polish**

Run: `cd mcode-app && npm run test:unit -- tests/pages/connections/connectionPresentation.spec.ts tests/services/connectionDriverRegistry.spec.ts`

Run: `cd mcode-relay && npm test -- test/relay.test.ts test/replayBuffer.test.ts test/httpProxy.test.ts`

Expected: FAIL on capability-chip presentation or missing final provider validation glue.

- [ ] **Step 3: Wire pair/refresh metadata into stored connections and surface capability chips**

```ts
// mcode-app/src/services/connectionContext.ts
function applyPairMetadata(
  connection: ConnectionContext,
  session: RelaySessionInfo | null,
  target: PairTargetMetadata | null
): ConnectionContext {
  return {
    ...connection,
    targetType: (target?.targetType as ConnectionTargetType) || connection.targetType,
    gatewaySession: session
      ? {
          ...session,
          targetType: target?.targetType,
          displayName: target?.displayName,
          capabilities: target?.capabilities,
          protocolVersion: target?.protocolVersion,
        }
      : connection.gatewaySession,
    targetProfile: target ? normalizePairTargetProfile(target) : connection.targetProfile,
  }
}
```

```ts
// mcode-app/src/pages/connections/connectionPresentation.ts
export function getConnectionCapabilityChips(connection: Pick<ConnectionRecordV2, "targetType" | "targetProfile">): string[] {
  const capabilities = connection.targetProfile?.capabilities || []
  return capabilities.flatMap((value) => {
    if (value === "desktop.runtime.codex-cli") return ["Codex CLI"]
    if (value === "desktop.runtime.claude-cli") return ["Claude CLI"]
    if (value === "desktop.tunnel.available") return ["内网穿透"]
    return []
  })
}
```

- [ ] **Step 4: Update relay README and architecture note to match shipped behavior**

```md
<!-- mcode-relay/README.md -->
## Pair Response Contract

- `target.targetType`
- `target.displayName`
- `target.capabilities`
- `target.protocolVersion`
- replayable `/v1/events?lastEventId=<n>`
```

```md
<!-- docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md -->
- Document the final path names, protocol-version field name, replay query parameter, and the capability keys actually shipped.
```

- [ ] **Step 5: Run the end-to-end verification set**

Run: `cd mcode-app && npm run test:unit -- tests/services/connectionSchema.spec.ts tests/services/connectionDriverRegistry.spec.ts tests/pages/connections/connectionPresentation.spec.ts tests/pages/connections/connectionConfigCode.spec.ts`

Run: `cd mcode-relay && npm test -- test/relay.test.ts test/replayBuffer.test.ts test/httpProxy.test.ts`

Run: `cd mcode-relay && npm run typecheck`

Run: `cd mcode-desktop && npm test -- src/lib/pairing.spec.ts`

Run: `cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml`

Expected: PASS for targeted tests and typecheck. If full cargo test or desktop frontend setup exposes environment-specific failures, record the exact failing command and stop before broad cleanup work.

- [ ] **Step 6: Commit**

```bash
git add mcode-app/src/pages/connections/index.vue \
  mcode-app/src/pages/connections/connectionPresentation.ts \
  mcode-app/src/services/connectionContext.ts \
  mcode-app/tests/pages/connections/connectionPresentation.spec.ts \
  mcode-relay/README.md \
  docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md
git commit -m "feat: complete multi-provider routing rollout"
```
