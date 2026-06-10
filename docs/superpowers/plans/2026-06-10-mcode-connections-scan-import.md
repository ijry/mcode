# Connections Scan Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the add-connection scan flow import existing connection config codes using `up-scanner`.

**Architecture:** Keep config-code parsing in `connectionConfigCode.ts` so the connections page only orchestrates scanning and persistence. Reuse the existing connection storage and runtime refresh flow to avoid introducing a second import path.

**Tech Stack:** Vue 3, uni-app, TypeScript, UTS uni module, Jest

---

### Task 1: Add import helpers for connection config codes

**Files:**
- Modify: `mcode-app/src/pages/connections/connectionConfigCode.ts`
- Test: `mcode-app/tests/pages/connections/connectionConfigCode.spec.ts`

- [ ] **Step 1: Write failing tests for import conversion**

```ts
const code = buildConnectionConfigCode({
  name: "Local Codeg",
  mode: "direct",
  url: "http://192.168.1.8:3089/",
  directToken: "direct-token",
})

expect(parseConnectionConfigCodeToConnection(code)).toEqual({
  name: "Local Codeg",
  mode: "direct",
  url: "http://192.168.1.8:3089",
  directToken: "direct-token",
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test:unit -- connectionConfigCode.spec.ts`
Expected: FAIL because `parseConnectionConfigCodeToConnection` does not exist.

- [ ] **Step 3: Implement payload validation and conversion**

```ts
export function parseConnectionConfigCodeToConnection(code: string): ParsedConfigCodeConnection {
  const payload = decodeConnectionConfigCode(code)
  return projectConfigCodePayloadToConnection(payload)
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test:unit -- connectionConfigCode.spec.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/connections/connectionConfigCode.ts mcode-app/tests/pages/connections/connectionConfigCode.spec.ts
git commit -m "feat: support importing connection config codes"
```

### Task 2: Wire scan import into the connections page

**Files:**
- Modify: `mcode-app/src/pages/connections/index.vue`
- Create: `mcode-app/uni_modules/up-scanner/**`

- [ ] **Step 1: Copy the scanner uni module into the app**

```bash
Copy-Item -Recurse -Force D:\Repos\xyito\lingyun\up-scan\uni_modules\up-scanner D:\Repos\xyito\lingyun\mcode\mcode-app\uni_modules\
```

- [ ] **Step 2: Replace scan placeholder UI with a trigger button**

```vue
<u-button type="primary" block @click="startScanImport" :loading="scanImporting">
  扫码导入连接
</u-button>
```

- [ ] **Step 3: Implement scan, parse, save, and refresh**

```ts
scanCode({
  scanType: ["qrCode"],
  success: (res) => {
    const imported = parseConnectionConfigCodeToConnection(res.content)
    saveConnection({ ...imported, active: true })
    loadConnections()
  },
})
```

- [ ] **Step 4: Verify the page still builds and type-checks**

Run: `pnpm exec vue-tsc --noEmit`
Expected: no type errors from the new import flow.

- [ ] **Step 5: Commit**

```bash
git add mcode-app/src/pages/connections/index.vue mcode-app/uni_modules/up-scanner
git commit -m "feat: add connection scan import"
```
