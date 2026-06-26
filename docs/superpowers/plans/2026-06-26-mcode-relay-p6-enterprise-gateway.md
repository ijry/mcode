# MCode Relay P6 Enterprise Gateway Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make self-hosted `mcode-relay` instances verifiable and diagnosable through gateway metadata, richer health checks, production safety reporting, and deployment documentation.

**Architecture:** Add a focused relay gateway metadata module that derives public health/info payloads from `RelayConfig`, `PairingStore`, and `RelayHub`. Keep pair/proxy/events/tunnel protocols unchanged; P6 only adds unauthenticated self-description endpoints and docs for enterprise deployment.

**Tech Stack:** Node.js, Fastify 5, TypeScript, zod, Vitest, supertest, existing in-memory `PairingStore` and `RelayHub`.

## Global Constraints

- Use `targetAgent`, not `targetType`.
- User-visible copy must use `网关`, not newly introduced `中继`.
- Do not add tenant/device/revocation/access-policy management in P6 first slice.
- Do not expose secrets, tokens, pair codes, session ids, target names, or client IPs through public health/info endpoints.
- Keep official and self-hosted gateway protocol shapes identical.
- Every mcode change must update a Markdown note under `docs/mcode-architecture-notes/`.

---

## File Structure

- `mcode-relay/src/config.ts`
  - Extend config schema with enterprise deployment metadata and safe enum values.
- `mcode-relay/src/gateway/info.ts`
  - New module that builds `/health` and `/v1/gateway/info` payloads.
- `mcode-relay/src/server.ts`
  - Replace simple health response and add gateway info route.
- `mcode-relay/test/gatewayInfo.test.ts`
  - New tests for health/info payloads and production safety derivation.
- `mcode-relay/test/relay.test.ts`
  - Update test config helper to include new required/defaulted config fields only if TypeScript requires it.
- `mcode-relay/README.md`
  - Document enterprise env vars, TLS, health/info, and runbook.
- `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`
  - Add P6 enterprise gateway behavior and native replication guidance.

### Task 1: Gateway Metadata Tests

**Files:**
- Create: `mcode-relay/test/gatewayInfo.test.ts`

**Interfaces:**
- Consumes existing `buildRelayApp({ config, store, hub })`.
- Produces failing tests for:
  - `GET /health`
  - `GET /v1/gateway/info`
  - production-unsafe and production-ready security status

- [ ] **Step 1: Add the failing health/info tests**

Create `mcode-relay/test/gatewayInfo.test.ts` with tests equivalent to:

```ts
import request from "supertest"
import { describe, expect, it } from "vitest"
import { buildRelayApp } from "../src/server.js"
import { PairingStore } from "../src/pairing/store.js"
import { RelayHub } from "../src/tunnel/hub.js"
import type { RelayConfig } from "../src/config.js"

function config(overrides: Partial<RelayConfig> = {}): RelayConfig {
  return {
    PORT: 0,
    HOST: "127.0.0.1",
    JWT_SECRET: "test-secret",
    PAIRING_CODE_TTL_SECONDS: 300,
    ACCESS_TOKEN_TTL_SECONDS: 60,
    REFRESH_TOKEN_TTL_SECONDS: 120,
    GATEWAY_NAME: "Enterprise Gateway",
    PUBLIC_BASE_URL: "https://gateway.example.com",
    GATEWAY_PROVIDER: "custom",
    DEPLOYMENT_ENV: "production",
    LOG_POLICY: "metadata-only",
    AUDIT_POLICY: "external",
    ALLOW_DEV_SECRETS: false,
    ...overrides,
  }
}

async function appFor(configOverrides: Partial<RelayConfig> = {}) {
  const app = await buildRelayApp({
    config: config(configOverrides),
    store: new PairingStore(),
    hub: new RelayHub(),
  })
  await app.ready()
  return app
}

describe("gateway info", () => {
  it("returns public health with version protocol security and stats", async () => {
    const app = await appFor()
    const res = await request(app.server).get("/health")
    await app.close()

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      status: "ok",
      name: "Enterprise Gateway",
      provider: "custom",
      baseUrl: "https://gateway.example.com",
      protocolVersion: "1",
      environment: "production",
      security: {
        jwtSecretConfigured: true,
        publicBaseUrlConfigured: true,
        devSecretsAllowed: false,
        productionReady: true,
      },
      stats: {
        targets: 0,
        sessions: 0,
        desktopsOnline: 0,
      },
    })
    expect(res.body.version).toBeTruthy()
    expect(JSON.stringify(res.body)).not.toContain("test-secret")
  })

  it("returns gateway info for client diagnostics", async () => {
    const app = await appFor()
    const res = await request(app.server).get("/v1/gateway/info")
    await app.close()

    expect(res.status).toBe(200)
    expect(res.body).toMatchObject({
      name: "Enterprise Gateway",
      provider: "custom",
      baseUrl: "https://gateway.example.com",
      version: expect.any(String),
      protocolVersion: "1",
      features: expect.arrayContaining([
        "pairing",
        "proxy",
        "events.replay",
        "tunnel.http",
        "desktop.upstream",
      ]),
      deployment: {
        environment: "production",
        logPolicy: "metadata-only",
        auditPolicy: "external",
      },
    })
  })

  it("reports production warnings for default development secrets", async () => {
    const app = await appFor({
      JWT_SECRET: "dev-secret",
      PUBLIC_BASE_URL: "",
      ALLOW_DEV_SECRETS: true,
    })
    const res = await request(app.server).get("/health")
    await app.close()

    expect(res.body.security.productionReady).toBe(false)
    expect(res.body.security.warnings).toEqual(
      expect.arrayContaining([
        "JWT_SECRET uses the development default",
        "PUBLIC_BASE_URL is not configured",
        "development secrets are allowed",
      ])
    )
  })
})
```

- [ ] **Step 2: Run tests and verify failure**

Run:

```bash
cd mcode-relay && npm test -- gatewayInfo.test.ts
```

Expected: FAIL because `/v1/gateway/info` does not exist and `/health` only returns `{ status: "ok" }`.

### Task 2: Config And Gateway Info Implementation

**Files:**
- Modify: `mcode-relay/src/config.ts`
- Create: `mcode-relay/src/gateway/info.ts`
- Modify: `mcode-relay/src/server.ts`

**Interfaces:**
- Produces:
  - `PROTOCOL_VERSION = "1"`
  - `GATEWAY_FEATURES: string[]`
  - `buildGatewaySecurity(config: RelayConfig): GatewaySecurityStatus`
  - `buildGatewayHealth(context: RelayAppContext): GatewayHealthResponse`
  - `buildGatewayInfo(context: RelayAppContext): GatewayInfoResponse`

- [ ] **Step 1: Extend relay config**

In `mcode-relay/src/config.ts`, add:

```ts
const gatewayProviderSchema = z.enum(["official", "custom"])
const deploymentEnvSchema = z.enum(["development", "staging", "production"])

const envSchema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  HOST: z.string().default("0.0.0.0"),
  JWT_SECRET: z.string().default("dev-secret"),
  PAIRING_CODE_TTL_SECONDS: z.coerce.number().int().positive().default(300),
  ACCESS_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(900),
  REFRESH_TOKEN_TTL_SECONDS: z.coerce.number().int().positive().default(60 * 60 * 24 * 14),
  GATEWAY_NAME: z.string().trim().min(1).default("MCode Gateway"),
  PUBLIC_BASE_URL: z.string().trim().default(""),
  GATEWAY_PROVIDER: gatewayProviderSchema.default("custom"),
  DEPLOYMENT_ENV: deploymentEnvSchema.default("development"),
  LOG_POLICY: z.string().trim().min(1).default("standard"),
  AUDIT_POLICY: z.string().trim().min(1).default("disabled"),
  ALLOW_DEV_SECRETS: z.coerce.boolean().default(true),
})
```

- [ ] **Step 2: Create gateway info module**

Create `mcode-relay/src/gateway/info.ts` with exported payload builders. It must only expose counts and config labels, never secrets:

```ts
import type { RelayAppContext } from "../server.js"
import type { RelayConfig } from "../config.js"

export const PROTOCOL_VERSION = "1"
export const GATEWAY_FEATURES = [
  "pairing",
  "session.refresh",
  "proxy",
  "events.replay",
  "desktop.upstream",
  "tunnel.http",
]

export interface GatewaySecurityStatus {
  jwtSecretConfigured: boolean
  publicBaseUrlConfigured: boolean
  devSecretsAllowed: boolean
  productionReady: boolean
  warnings: string[]
}

export function buildGatewaySecurity(config: RelayConfig): GatewaySecurityStatus {
  const jwtSecretConfigured = config.JWT_SECRET.trim() !== "" && config.JWT_SECRET !== "dev-secret"
  const publicBaseUrlConfigured = config.PUBLIC_BASE_URL.trim() !== ""
  const devSecretsAllowed = config.ALLOW_DEV_SECRETS
  const warnings: string[] = []
  if (!jwtSecretConfigured) warnings.push("JWT_SECRET uses the development default")
  if (!publicBaseUrlConfigured) warnings.push("PUBLIC_BASE_URL is not configured")
  if (devSecretsAllowed) warnings.push("development secrets are allowed")
  const productionReady =
    config.DEPLOYMENT_ENV === "production"
      ? jwtSecretConfigured && publicBaseUrlConfigured && !devSecretsAllowed
      : warnings.length === 0
  return {
    jwtSecretConfigured,
    publicBaseUrlConfigured,
    devSecretsAllowed,
    productionReady,
    warnings,
  }
}
```

Add stats builders using `context.store.listTargets().length`, session count helper if available or add `listSessions()` to store only if needed, and `context.hub.isDesktopOnline(target.targetId)`.

- [ ] **Step 3: Wire routes**

In `mcode-relay/src/server.ts`, replace:

```ts
app.get("/health", async () => ({ status: "ok" }))
```

with:

```ts
app.get("/health", async () => buildGatewayHealth(context))
app.get("/v1/gateway/info", async () => buildGatewayInfo(context))
```

Import the builders from `./gateway/info.js`.

- [ ] **Step 4: Run relay tests**

Run:

```bash
cd mcode-relay && npm test -- gatewayInfo.test.ts
cd mcode-relay && npm run typecheck
```

Expected: PASS.

### Task 3: Documentation And Architecture Note

**Files:**
- Modify: `mcode-relay/README.md`
- Modify: `docs/mcode-architecture-notes/2026-06-25-multi-provider-connection-routing.md`

**Interfaces:**
- Produces P6 runbook and native replication guidance.

- [ ] **Step 1: Update relay README**

Add sections:

- Enterprise gateway scope.
- Required production env vars.
- TLS termination guidance.
- `/health` and `/v1/gateway/info` sample responses.
- Security warnings: default `JWT_SECRET`, missing `PUBLIC_BASE_URL`, and `ALLOW_DEV_SECRETS=true`.
- Explicitly deferred items: tenants, device management, revocation, policy admin.

- [ ] **Step 2: Update architecture note**

Append `## P6 Enterprise Gateway Behavior` to the existing architecture note. Include:

- Same protocol as official gateway.
- `gatewayProvider = custom` and enterprise domain flow.
- Public health/info endpoint fields.
- No secrets in public diagnostics.
- Native clients should treat gateway info as optional diagnostics.

- [ ] **Step 3: Full verification**

Run:

```bash
cd mcode-relay && npm test
cd mcode-relay && npm run typecheck
cd mcode-desktop && npm test
cd mcode-desktop && npm run build
cargo test --manifest-path mcode-desktop/src-tauri/Cargo.toml
```

Expected: all pass.

## Self-Review

- Spec coverage: Covers relay health/info, enterprise config metadata, production safety status, deployment docs, and native replication guidance.
- Placeholder scan: No `TBD`, `TODO`, or unbounded "implement later" items are present.
- Type consistency: Uses `targetAgent`, `gatewayProvider`, `PUBLIC_BASE_URL`, `DEPLOYMENT_ENV`, and `ALLOW_DEV_SECRETS` consistently.
