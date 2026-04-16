# MCode Phase-1 (Channel + Relay + Mobile Client) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver an end-to-end MCode remote-control workflow with relay/direct dual-mode support while keeping `codeg-main` changes minimal and upstream-friendly.

**Architecture:** Extend `codeg-main` with a new `mcode` chat-channel type and a lightweight relay tunnel backend, implement a standalone `mcode-relay` service for pairing/session/proxy/event forwarding, and build a `uni-app + uview-plus` mobile client with a unified gateway abstraction for relay/direct operation.

**Tech Stack:** Rust (codeg-main), TypeScript + Fastify + ws + JWT (mcode-relay), Vue3/uni-app + uview-plus + Pinia (MCode), WebSocket + HTTP JSON.

---

## File Structure Mapping

- `codeg-main` (existing)
  - Modify: `src-tauri/src/chat_channel/types.rs`
  - Modify: `src-tauri/src/chat_channel/backends/mod.rs`
  - Create: `src-tauri/src/chat_channel/backends/mcode.rs`
  - Modify: `src/components/settings/add-chat-channel-dialog.tsx`
  - Modify: `src/components/settings/edit-chat-channel-dialog.tsx`
  - Modify: `src/lib/types.ts`
  - Modify: `src/i18n/messages/en.json` (then propagate minimal key additions to other locales)

- `mcode-relay` (new project under `D:\Repos\mcode\mcode\mcode-relay`)
  - Create: `package.json`, `tsconfig.json`
  - Create: `src/server.ts`
  - Create: `src/config.ts`
  - Create: `src/auth/tokens.ts`
  - Create: `src/pairing/store.ts`
  - Create: `src/tunnel/hub.ts`
  - Create: `src/routes/*.ts`
  - Create: `test/*.test.ts`

- `mcode-app` (new uni-app project under `D:\Repos\mcode\mcode\mcode-app`)
  - Create: `pages.json`, `manifest.json`, `uni.scss`
  - Create: `src/main.ts`
  - Create: `src/stores/*`
  - Create: `src/services/gateway/*`
  - Create: `src/pages/*`
  - Create: `src/components/*`
  - Create: `src/utils/*`

---

### Task 1: Bootstrap Multi-Project Workspace

**Files:**
- Create: `D:\Repos\mcode\mcode\mcode-relay/*`
- Create: `D:\Repos\mcode\mcode\mcode-app/*`
- Modify: `D:\Repos\mcode\mcode\README.md` (workspace bootstrap notes, if file exists; else create `SETUP.md`)

- [ ] **Step 1: Scaffold relay project skeleton**

```bash
mkdir mcode-relay
cd mcode-relay
pnpm init
pnpm add fastify @fastify/websocket zod jose pino pino-pretty
pnpm add -D typescript tsx vitest @types/node supertest
```

- [ ] **Step 2: Scaffold uni-app project with Vue3 + TypeScript**

```bash
cd D:\Repos\mcode\mcode
npx degit dcloudio/uni-preset-vue#vite mcode-app
cd mcode-app
pnpm install
pnpm add uview-plus pinia
```

- [ ] **Step 3: Verify toolchains**

Run: `pnpm --dir mcode-relay exec tsc --noEmit`  
Expected: `Found 0 errors`

Run: `pnpm --dir mcode-app exec vite --version`  
Expected: prints vite version

- [ ] **Step 4: Commit**

```bash
git add mcode-relay mcode-app
git commit -m "chore: scaffold relay and uni-app client projects"
```

---

### Task 2: Add `mcode` Channel Type in `codeg-main` (Minimal Intrusion)

**Files:**
- Modify: `D:\Repos\mcode\mcode\codeg-main\src-tauri\src\chat_channel\types.rs`
- Modify: `D:\Repos\mcode\mcode\codeg-main\src-tauri\src\chat_channel\backends\mod.rs`
- Create: `D:\Repos\mcode\mcode\codeg-main\src-tauri\src\chat_channel\backends\mcode.rs`
- Test: `D:\Repos\mcode\mcode\codeg-main\src-tauri\src\chat_channel\backends\mcode.rs` (unit tests in same file)

- [ ] **Step 1: Add failing backend factory test for `mcode` config parsing**

```rust
#[test]
fn create_mcode_backend_requires_mode_and_url() {
    let cfg = serde_json::json!({"connection_mode":"relay","relay_url":""});
    let result = create_backend(1, ChannelType::Mcode, &cfg, "token".into());
    assert!(result.is_err());
}
```

- [ ] **Step 2: Implement `ChannelType::Mcode` + `McodeConfig`**

```rust
#[derive(Debug, Clone, Deserialize)]
pub struct McodeConfig {
    pub connection_mode: String,
    pub relay_url: Option<String>,
    pub direct_base_url: Option<String>,
    pub relay_target_id: Option<String>,
    pub display_name: Option<String>,
}
```

- [ ] **Step 3: Implement backend factory branch and `mcode.rs` backend**

```rust
ChannelType::Mcode => {
    let cfg: McodeConfig = serde_json::from_value(config.clone())?;
    Ok(Box::new(mcode::McodeBackend::new(channel_id, token, cfg)?))
}
```

- [ ] **Step 4: Run tests**

Run: `cargo test --manifest-path src-tauri/Cargo.toml chat_channel::backends::mcode -- --nocapture`  
Expected: all `mcode` backend tests pass.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/chat_channel/types.rs src-tauri/src/chat_channel/backends/mod.rs src-tauri/src/chat_channel/backends/mcode.rs
git commit -m "feat(chat-channel): add mcode backend type with relay/direct config"
```

---

### Task 3: Expose `mcode` in Settings UI

**Files:**
- Modify: `D:\Repos\mcode\mcode\codeg-main\src\lib\types.ts`
- Modify: `D:\Repos\mcode\mcode\codeg-main\src\components\settings\add-chat-channel-dialog.tsx`
- Modify: `D:\Repos\mcode\mcode\codeg-main\src\components\settings\edit-chat-channel-dialog.tsx`
- Modify: `D:\Repos\mcode\mcode\codeg-main\src\i18n\messages\en.json`

- [ ] **Step 1: Add failing type check for unsupported `mcode` value**

```ts
const type: ChannelType = "mcode"
```

- [ ] **Step 2: Extend `ChannelType` union and form options**

```ts
export type ChannelType = "lark" | "telegram" | "weixin" | "mcode"
```

- [ ] **Step 3: Add `mcode` form fields**

```tsx
{channelType === "mcode" && (
  <>
    <Select value={connectionMode} onValueChange={setConnectionMode}>
      <SelectItem value="relay">Relay</SelectItem>
      <SelectItem value="direct">Direct</SelectItem>
    </Select>
    <Input value={relayUrl} ... />
    <Input value={directBaseUrl} ... />
  </>
)}
```

- [ ] **Step 4: Run lint/type checks**

Run: `pnpm --dir . lint`  
Expected: no new errors in modified files.

- [ ] **Step 5: Commit**

```bash
git add src/lib/types.ts src/components/settings/add-chat-channel-dialog.tsx src/components/settings/edit-chat-channel-dialog.tsx src/i18n/messages/en.json
git commit -m "feat(ui): add mcode channel configuration in settings dialogs"
```

---

### Task 4: Implement Relay Core Server (Pair/Auth/Target/Tunnel)

**Files:**
- Create: `D:\Repos\mcode\mcode\mcode-relay\src\server.ts`
- Create: `D:\Repos\mcode\mcode\mcode-relay\src\config.ts`
- Create: `D:\Repos\mcode\mcode\mcode-relay\src\auth\tokens.ts`
- Create: `D:\Repos\mcode\mcode\mcode-relay\src\pairing\store.ts`
- Create: `D:\Repos\mcode\mcode\mcode-relay\src\tunnel\hub.ts`
- Test: `D:\Repos\mcode\mcode\mcode-relay\test\pairing.test.ts`

- [ ] **Step 1: Write failing tests for pairing and token refresh**

```ts
it("pairs with valid code+secret and returns access/refresh", async () => {
  const res = await request(app.server).post("/v1/pair").send({...})
  expect(res.status).toBe(200)
  expect(res.body.accessToken).toBeTruthy()
})
```

- [ ] **Step 2: Implement in-memory pairing store + TTL**

```ts
type PairOffer = { code: string; secretHash: string; targetId: string; expiresAt: number; used: boolean }
```

- [ ] **Step 3: Implement JWT access/refresh issuance**

```ts
export function signAccess(payload: AccessClaims, secret: string, ttlSec = 900): string
export function signRefresh(payload: RefreshClaims, secret: string, ttlSec = 1209600): string
```

- [ ] **Step 4: Run relay test suite**

Run: `pnpm --dir mcode-relay test`  
Expected: pairing/auth tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcode-relay/src mcode-relay/test mcode-relay/package.json mcode-relay/tsconfig.json
git commit -m "feat(relay): implement pairing and token session core"
```

---

### Task 5: Implement Relay Proxy + WS Event Forwarding

**Files:**
- Modify: `D:\Repos\mcode\mcode\mcode-relay\src\server.ts`
- Create: `D:\Repos\mcode\mcode\mcode-relay\src\routes\proxy.ts`
- Create: `D:\Repos\mcode\mcode\mcode-relay\src\routes\events.ts`
- Test: `D:\Repos\mcode\mcode\mcode-relay\test\proxy.test.ts`

- [ ] **Step 1: Add failing proxy correlation test**

```ts
it("forwards /v1/proxy/{command} to desktop tunnel and returns response", async () => {
  // setup fake desktop ws session then assert round-trip
})
```

- [ ] **Step 2: Implement request-response multiplexing**

```ts
hub.sendToDesktop(targetId, { type: "proxy_request", requestId, command, payload })
const result = await hub.awaitResponse(requestId, 10_000)
```

- [ ] **Step 3: Implement mobile event WS subscription**

```ts
fastify.get("/v1/events", { websocket: true }, (socket, req) => {
  hub.attachMobileConsumer(targetId, socket)
})
```

- [ ] **Step 4: Run tests**

Run: `pnpm --dir mcode-relay test`  
Expected: proxy/events tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcode-relay/src/routes mcode-relay/src/tunnel mcode-relay/test/proxy.test.ts
git commit -m "feat(relay): add proxy command forwarding and ws event bridge"
```

---

### Task 6: Build MCode App Gateway + Auth/Target Stores

**Files:**
- Create: `D:\Repos\mcode\mcode\mcode-app\src\services\gateway\types.ts`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\services\gateway\relayGateway.ts`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\services\gateway\directGateway.ts`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\stores\auth.ts`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\stores\targets.ts`
- Test: `D:\Repos\mcode\mcode\mcode-app\src\services\gateway\gateway.spec.ts`

- [ ] **Step 1: Write failing tests for unified gateway call mapping**

```ts
it("maps list_folders to relay proxy in relay mode", async () => { ... })
it("maps list_folders to /api/list_folders in direct mode", async () => { ... })
```

- [ ] **Step 2: Implement gateway interface**

```ts
export interface CodegGateway {
  call<T>(command: string, payload?: Record<string, unknown>): Promise<T>
  connectEvents(onEvent: (evt: unknown) => void): Promise<() => void>
  refreshAuth(): Promise<void>
}
```

- [ ] **Step 3: Implement persistent auth/target stores**

```ts
export const useAuthStore = defineStore("auth", { ... })
export const useTargetsStore = defineStore("targets", { ... })
```

- [ ] **Step 4: Run tests**

Run: `pnpm --dir mcode-app test`  
Expected: gateway unit tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/services mcode-app/src/stores
git commit -m "feat(mcode-app): add relay/direct gateway abstraction and auth stores"
```

---

### Task 7: Build MCode Pages for Full Phase-1 Remote Control

**Files:**
- Create: `D:\Repos\mcode\mcode\mcode-app\src\pages\pair\index.vue`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\pages\targets\index.vue`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\pages\projects\index.vue`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\pages\sessions\index.vue`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\pages\session-detail\index.vue`
- Create: `D:\Repos\mcode\mcode\mcode-app\src\pages\settings\index.vue`
- Modify: `D:\Repos\mcode\mcode\mcode-app\pages.json`

- [ ] **Step 1: Add pair page (relay + direct)**

```vue
<u-form>... relayUrl/code/secret ... directBaseUrl/token ...</u-form>
```

- [ ] **Step 2: Add target/project/session list pages**

```ts
await gateway.call("list_folders")
await gateway.call("list_folder_conversations", { folderId })
```

- [ ] **Step 3: Add session detail actions**

```ts
await gateway.call("acp_prompt", { connectionId, blocks })
await gateway.call("acp_cancel", { connectionId })
await gateway.call("acp_respond_permission", { connectionId, requestId, optionId })
```

- [ ] **Step 4: Run app build checks**

Run: `pnpm --dir mcode-app run build:h5`  
Expected: build succeeds.

Run: `pnpm --dir mcode-app run dev:mp-weixin`  
Expected: mini-program dev build starts.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages mcode-app/pages.json
git commit -m "feat(mcode-app): implement phase1 pages and remote session controls"
```

---

### Task 8: Add Reconnect, Health, and Security Hardening

**Files:**
- Modify: `D:\Repos\mcode\mcode\mcode-app\src\services\gateway\*.ts`
- Modify: `D:\Repos\mcode\mcode\mcode-relay\src\server.ts`
- Modify: `D:\Repos\mcode\mcode\mcode-relay\src\tunnel\hub.ts`
- Create: `D:\Repos\mcode\mcode\mcode-relay\test\reconnect.test.ts`

- [ ] **Step 1: Add failing reconnect behavior tests**

```ts
it("reconnects mobile ws with exponential backoff after close", async () => { ... })
```

- [ ] **Step 2: Implement reconnect + heartbeat**

```ts
const nextDelay = Math.min(30000, 1000 * 2 ** retryCount)
```

- [ ] **Step 3: Add secret redaction in logs**

```ts
const masked = token ? `${token.slice(0, 6)}***` : ""
```

- [ ] **Step 4: Run tests**

Run: `pnpm --dir mcode-relay test`  
Expected: reconnect/security tests pass.

- [ ] **Step 5: Commit**

```bash
git add mcode-relay/src mcode-relay/test mcode-app/src/services/gateway
git commit -m "feat: add reconnect strategy and token redaction hardening"
```

---

### Task 9: System Integration and Regression Validation

**Files:**
- Create: `D:\Repos\mcode\mcode\docs\mcode\phase1-manual-test.md`
- Create: `D:\Repos\mcode\mcode\docs\mcode\deployment.md`
- Modify: `D:\Repos\mcode\mcode\codeg-main\README.md` (minimal MCode channel note)

- [ ] **Step 1: Run codeg-main checks**

Run: `pnpm --dir codeg-main lint`  
Expected: no lint errors from mcode changes.

Run: `cargo test --manifest-path codeg-main/src-tauri/Cargo.toml`  
Expected: all affected tests pass.

- [ ] **Step 2: Run relay checks**

Run: `pnpm --dir mcode-relay test && pnpm --dir mcode-relay exec tsc --noEmit`  
Expected: test pass + no type errors.

- [ ] **Step 3: Run app checks**

Run: `pnpm --dir mcode-app run build:h5`  
Expected: successful build artifacts.

- [ ] **Step 4: Execute manual acceptance matrix**

```md
- relay mode full flow
- direct mode full flow
- permission/stop actions
- disconnect/reconnect recovery
- mini-program connectivity
```

- [ ] **Step 5: Commit**

```bash
git add docs/mcode codeg-main/README.md
git commit -m "docs: add phase1 integration, deploy, and acceptance guides"
```

---

## Self-Review Checklist

### 1) Spec coverage mapping

- `mcode` channel minimal intrusion: Task 2 + Task 3
- standalone relay service: Task 4 + Task 5 + Task 8
- mobile client full feature loop: Task 6 + Task 7
- pairing/secret/reconnect/security: Task 4 + Task 8
- direct mode support: Task 2 + Task 6 + Task 7
- release and regression: Task 9

### 2) Placeholder scan

No TBD/TODO placeholders left in tasks, commands, or file paths.

### 3) Type/interface consistency

- `connection_mode` value set is consistent (`relay | direct`) across backend, relay, and app gateway.
- Command names reused from existing `codeg-main` API command surface.

