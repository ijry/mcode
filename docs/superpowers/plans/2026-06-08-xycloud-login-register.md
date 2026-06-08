# Xycloud Login Register Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add xycloud-compatible login and registration screens to `mcode-app`, with a fixed backend base URL, persisted account session, and profile-page entry/logout flow.

**Architecture:** Keep the new account flow isolated from the existing `relay/direct` connection auth. A small `xycloudAuth` service owns HTTP request formatting and response parsing, while a dedicated Pinia store owns the logged-in account state. The login/register pages render the xycloud-style forms and call that service directly.

**Tech Stack:** Vue 3, uni-app, uview-plus, Pinia, Jest

---

### Task 1: Xycloud auth service and account store

**Files:**
- Create: `mcode-app/src/services/xycloudAuth.ts`
- Create: `mcode-app/src/stores/account.ts`
- Modify: `mcode-app/src/main.ts`
- Test: `mcode-app/tests/services/xycloudAuth.spec.ts`
- Test: `mcode-app/tests/stores/account.spec.ts`

- [ ] **Step 1: Write the failing tests**

```ts
import { login, registerEmail, sendEmailVerifyCode, resolveXycloudBaseUrl } from "@/services/xycloudAuth"

describe("xycloud auth service", () => {
  beforeEach(() => {
    ;(globalThis as any).__XYCLOUD_BASE_URL__ = "https://xycloud.example.com/"
    uni.request.mockResolvedValue({
      statusCode: 200,
      data: { code: 200, msg: "ok", data: { token: "t-1", userInfo: { name: "Ada" } } },
    })
  })

  it("normalizes the runtime base url", () => {
    expect(resolveXycloudBaseUrl()).toBe("https://xycloud.example.com")
  })

  it("posts login payload to the xycloud login endpoint", async () => {
    await login({ account: "alice", password: "secret" })
    expect(uni.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://xycloud.example.com/v1/core/user/login",
      method: "POST",
      data: { account: "alice", password: "secret" },
    }))
  })

  it("posts register payload to the email register endpoint", async () => {
    await registerEmail({
      email: "alice@example.com",
      verify: "123456",
      token: "verify-token",
      password: "secret123",
      inviteCode: "INVITE",
      channelName: "mcode",
      agreement: true,
    })
    expect(uni.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://xycloud.example.com/v1/reg_email/user/register",
    }))
  })

  it("posts email verification payload to the send endpoint", async () => {
    await sendEmailVerifyCode({
      email: "alice@example.com",
      title: "用户注册",
      verifyUser: 0,
    })
    expect(uni.request).toHaveBeenCalledWith(expect.objectContaining({
      url: "https://xycloud.example.com/v1/email/verify/send",
      data: { email: "alice@example.com", title: "用户注册", verifyUser: 0 },
    }))
  })
})
```

```ts
import { createPinia, setActivePinia } from "pinia"
import { useAccountStore } from "@/stores/account"

describe("account store", () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    uni.clearStorageSync()
  })

  it("stores and clears the session", () => {
    const account = useAccountStore()
    account.setSession({ token: "token-1", userInfo: { name: "Ada" } })
    expect(account.token).toBe("token-1")
    expect(account.userInfo?.name).toBe("Ada")
    account.logout()
    expect(account.token).toBe("")
    expect(account.userInfo).toBeNull()
  })
})
```

- [ ] **Step 2: Run the tests and confirm they fail**

Run: `npm run test:unit -- --runInBand tests/services/xycloudAuth.spec.ts tests/stores/account.spec.ts`
Expected: fail because the service and store do not exist yet.

- [ ] **Step 3: Implement the service, store, and env bootstrap**

```ts
// main.ts
;(globalThis as any).__XYCLOUD_BASE_URL__ = String(import.meta.env.VITE_XYCLOUD_BASE_URL || "").trim().replace(/\/+$/, "")
```

```ts
// src/services/xycloudAuth.ts
export function resolveXycloudBaseUrl(): string {
  return String((globalThis as any).__XYCLOUD_BASE_URL__ || "").trim().replace(/\/+$/, "")
}
```

```ts
// src/stores/account.ts
export const useAccountStore = defineStore("account", {
  state: () => ({ token: "", userInfo: null as XycloudUserInfo | null }),
  actions: {
    setSession(session) { /* store token + userInfo */ },
    logout() { /* clear session */ },
  },
})
```

- [ ] **Step 4: Run the tests and confirm they pass**

Run: `npm run test:unit -- --runInBand tests/services/xycloudAuth.spec.ts tests/stores/account.spec.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/services/xycloudAuth.ts mcode-app/src/stores/account.ts mcode-app/src/main.ts mcode-app/tests/services/xycloudAuth.spec.ts mcode-app/tests/stores/account.spec.ts docs/superpowers/plans/2026-06-08-xycloud-login-register.md
git commit -m "feat: add xycloud auth foundation"
```

### Task 2: Login and registration pages

**Files:**
- Create: `mcode-app/src/pages/auth/login.vue`
- Create: `mcode-app/src/pages/auth/register.vue`
- Modify: `mcode-app/src/pages.json`

- [ ] **Step 1: Add the page tests or page-level verification notes**

```text
Login page:
- account + password fields
- safety-verify popup on 401003
- login button calls /v1/core/user/login

Register page:
- email/mobile tabs
- send verify code buttons
- agreement checkbox
- register button calls /v1/reg_email/user/register or /v1/reg_mobile/user/register
```

- [ ] **Step 2: Implement the pages**

```vue
<!-- login.vue -->
<template>
  <view class="page auth-page">
    <view class="auth-card">
      <input v-model="form.account" placeholder="请输入账号" />
      <input v-model="form.password" type="password" placeholder="请输入登录密码" />
      <up-button :loading="loading" @click="submit">登录</up-button>
    </view>
  </view>
</template>
```

```vue
<!-- register.vue -->
<template>
  <view class="page auth-page">
    <up-tabs v-model:current="tabIndex" :list="tabs" />
    <!-- email/mobile forms with verify button and agreement -->
  </view>
</template>
```

- [ ] **Step 3: Register the routes**

```json
{
  "path": "pages/auth/login",
  "style": { "navigationStyle": "custom", "navigationBarTitleText": "登录" }
}
```

```json
{
  "path": "pages/auth/register",
  "style": { "navigationStyle": "custom", "navigationBarTitleText": "注册" }
}
```

- [ ] **Step 4: Verify page wiring manually**

Run: `npm run dev:h5`
Expected: login page renders, register page opens from it, and the submit buttons hit the xycloud endpoints.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/auth/login.vue mcode-app/src/pages/auth/register.vue mcode-app/src/pages.json
git commit -m "feat: add xycloud login and register pages"
```

### Task 3: Profile entry and logout flow

**Files:**
- Modify: `mcode-app/src/pages/profile/index.vue`

- [ ] **Step 1: Update the profile UI to use account store state**

```ts
import { useAccountStore } from "@/stores/account"

const account = useAccountStore()
const isLoggedIn = computed(() => Boolean(account.token))
```

- [ ] **Step 2: Add the login/register entry and logout actions**

```vue
<u-button v-if="!isLoggedIn" type="primary" @click="goLogin">登录 / 注册</u-button>
<u-button v-else type="error" plain @click="logout">退出登录</u-button>
```

- [ ] **Step 3: Verify the logout clears session state**

Run: `npm run test:unit -- --runInBand`
Expected: existing tests still pass and profile no longer depends on the old storage-only user state.

- [ ] **Step 4: Commit**

```bash
git add mcode-app/src/pages/profile/index.vue
git commit -m "feat: wire profile entry to xycloud auth"
```

### Task 4: Final verification

**Files:**
- Validate the modified files from Tasks 1 to 3

- [ ] **Step 1: Run unit tests**

Run: `npm run test:unit -- --runInBand`
Expected: all tests pass.

- [ ] **Step 2: Run type/build smoke checks**

Run: `npx vue-tsc --noEmit`
Expected: no type errors in the new auth flow.

- [ ] **Step 3: Manual smoke test**

Run: `npm run dev:h5`
Expected: login page opens, register page submits, profile shows logged-in state, logout clears it.

