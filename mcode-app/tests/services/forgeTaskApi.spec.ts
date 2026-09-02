import {
  createWorkTaskFromForge,
  FORGE_LOOKUP_KEYS_CAP,
  forgeTaskLinkMap,
  lookupForgeTasks,
  normalizeForgeCreateResult,
  normalizeForgeTaskLink,
} from "@/services/forge/forgeTaskApi"
import type { CodegGateway } from "@/services/gateway"
import type { ForgeTaskDraft } from "@/types/forge"

function makeGateway(result: unknown = null) {
  const calls: Array<{ command: string; payload: any }> = []
  const gateway = {
    mode: "direct" as const,
    async pair() {
      return null
    },
    async call(command: string, payload?: Record<string, unknown>) {
      calls.push({ command, payload })
      return result as any
    },
    async connectEvents() {
      throw new Error("not used")
    },
    async refreshAuth() {},
    getRemoteInstanceDescriptor() {
      return { instanceKey: "test", mode: "direct" as const, baseUrl: "", principal: "" }
    },
  }
  return { gateway: gateway as unknown as CodegGateway, calls }
}

const DRAFT: ForgeTaskDraft = {
  folder_id: 3,
  source: {
    kind: "issue",
    provider: "github",
    server_host: "github.com",
    account_id: null,
    owner_repo: "owner/repo",
    number: 42,
  },
  snapshot: { title: "Crash", body: "steps", labels: ["bug"], author: "octocat" },
  scenario: "fix",
  instruction: null,
  writeback: true,
  agent_type: null,
  force: false,
}

describe("createWorkTaskFromForge", () => {
  /**
   * **这是整套 API 里最容易写错的一处。** 外层是 `{draft}` 但 draft 内部全是
   * snake_case（`commands/forge.rs` 的 `ForgeTaskDraft` 没有 rename）。写成 camelCase
   * 会让 serde 用默认值填满整个结构 —— 表现是「创建成功但任务指向 folder 0」。
   */
  it("sends the draft in snake_case, not camelCase", async () => {
    const { gateway, calls } = makeGateway({ outcome: "created", task: { id: 1 } })
    await createWorkTaskFromForge(gateway, DRAFT)
    expect(calls[0].command).toBe("work_task_create_from_forge")
    const draft = calls[0].payload.draft
    expect(draft).toEqual({
      folder_id: 3,
      source: {
        kind: "issue",
        provider: "github",
        server_host: "github.com",
        account_id: null,
        owner_repo: "owner/repo",
        number: 42,
      },
      snapshot: { title: "Crash", body: "steps", labels: ["bug"], author: "octocat" },
      scenario: "fix",
      instruction: null,
      writeback: true,
      agent_type: null,
      force: false,
    })
    const serialized = JSON.stringify(calls[0].payload)
    expect(serialized).not.toContain("folderId")
    expect(serialized).not.toContain("serverHost")
    expect(serialized).not.toContain("ownerRepo")
    expect(serialized).not.toContain("accountId")
    expect(serialized).not.toContain("agentType")
  })

  /**
   * `writeback` **总要显式送**：服务端把缺失读作「静默」而不是弹层的默认值，因为一个
   * 没带这个字段的请求来自从未展示过这个问题的客户端。
   */
  it("always states the write-back answer explicitly", async () => {
    const off = makeGateway({ outcome: "created", task: { id: 1 } })
    await createWorkTaskFromForge(off.gateway, { ...DRAFT, writeback: false })
    expect(off.calls[0].payload.draft.writeback).toBe(false)
    expect("writeback" in off.calls[0].payload.draft).toBe(true)
  })

  it("forwards the force flag for a deliberate duplicate", async () => {
    const { gateway, calls } = makeGateway({ outcome: "created", task: { id: 1 } })
    await createWorkTaskFromForge(gateway, { ...DRAFT, force: true })
    expect(calls[0].payload.draft.force).toBe(true)
  })
})

describe("lookupForgeTasks", () => {
  /** 外层是 `{sourceKeys}`（camelCase，那是 handler 的 param struct）—— 与 draft 相反。 */
  it("sends the keys under a camelCase param", async () => {
    const { gateway, calls } = makeGateway([])
    await lookupForgeTasks(gateway, ["github:github.com:o/r:issue:1"])
    expect(calls[0]).toEqual({
      command: "work_task_lookup_by_source",
      payload: { sourceKeys: ["github:github.com:o/r:issue:1"] },
    })
  })

  /** 空 key 与重复 key 都不该占用配额上限里的位置。 */
  it("drops blanks and duplicates", async () => {
    const { gateway, calls } = makeGateway([])
    await lookupForgeTasks(gateway, ["a", "a", "", "b"])
    expect(calls[0].payload.sourceKeys).toEqual(["a", "b"])
  })

  /** 一批都没有可用 key 时不发请求 —— 那是一次注定拿回空数组的往返。 */
  it("does not spend a request on an empty batch", async () => {
    const { gateway, calls } = makeGateway([])
    await expect(lookupForgeTasks(gateway, ["", ""])).resolves.toEqual([])
    expect(calls).toHaveLength(0)
  })

  /** 服务端有硬上限（`LOOKUP_KEYS_CAP`），超出会被拒 —— 在这里截断而不是白花一次。 */
  it("truncates at the backend's own cap", async () => {
    const { gateway, calls } = makeGateway([])
    const many = Array.from({ length: 250 }, (_, index) => `k${index}`)
    await lookupForgeTasks(gateway, many)
    expect(calls[0].payload.sourceKeys).toHaveLength(FORGE_LOOKUP_KEYS_CAP)
  })
})

describe("normalizeForgeCreateResult", () => {
  it("reads the created outcome", () => {
    expect(
      normalizeForgeCreateResult({ outcome: "created", task: { id: 7, title: "t" } })
    ).toEqual({ outcome: "created", task: { id: 7, title: "t" } })
  })

  it("reads the duplicate outcome", () => {
    expect(
      normalizeForgeCreateResult({ outcome: "duplicate", existing: { id: 7 } })
    ).toEqual({ outcome: "duplicate", existing: { id: 7 } })
  })

  it("reads the folder mismatch outcome", () => {
    const result = normalizeForgeCreateResult({
      outcome: "folder_mismatch",
      folder_remote: { server_host: "github.com", owner_repo: "other/repo", provider: "github" },
    })
    expect(result).toMatchObject({ outcome: "folder_mismatch" })
    expect((result as any).folder_remote.owner_repo).toBe("other/repo")
  })

  /** 服务端可能连远端都给不出（文件夹压根没有可识别的远端）—— 那仍然是一个 mismatch。 */
  it("accepts a mismatch with no readable remote", () => {
    expect(normalizeForgeCreateResult({ outcome: "folder_mismatch" })).toEqual({
      outcome: "folder_mismatch",
      folder_remote: null,
    })
  })

  /**
   * 认不出的 outcome 返回 `null` —— 猜一个分支会让弹层做出错误的事（把
   * `folder_mismatch` 当成 `created` 然后关掉弹层，用户以为任务建好了）。
   */
  it("refuses to guess an unknown outcome", () => {
    expect(normalizeForgeCreateResult({ outcome: "something_new" })).toBeNull()
    expect(normalizeForgeCreateResult({ outcome: "created" })).toBeNull()
    expect(normalizeForgeCreateResult(null)).toBeNull()
  })
})

describe("normalizeForgeTaskLink", () => {
  it("carries the fields the chip renders", () => {
    expect(
      normalizeForgeTaskLink({
        source_key: "github:github.com:o/r:issue:1",
        task_id: 7,
        status: "running",
        verdict: null,
        updated_at: "2026-09-01T00:00:00Z",
      })
    ).toEqual({
      source_key: "github:github.com:o/r:issue:1",
      task_id: 7,
      status: "running",
      verdict: null,
      updated_at: "2026-09-01T00:00:00Z",
    })
  })

  /** source_key 是匹配依据，task_id 是点芯片的跳转目标 —— 两个都没有替代品。 */
  it("drops a row missing either load-bearing field", () => {
    expect(normalizeForgeTaskLink({ task_id: 7 })).toBeNull()
    expect(normalizeForgeTaskLink({ source_key: "k" })).toBeNull()
    expect(normalizeForgeTaskLink({ source_key: "k", task_id: 0 })).toBeNull()
  })

  /**
   * `status` **不做白名单校验** —— 硬校验会让那一行的芯片整个消失（表现是「这个 issue
   * 看起来没人处理过」，于是被重复触发）。
   */
  it("passes an unknown status through", () => {
    expect(
      normalizeForgeTaskLink({ source_key: "k", task_id: 1, status: "some_new_status" })?.status
    ).toBe("some_new_status")
  })
})

describe("forgeTaskLinkMap", () => {
  it("indexes by source key", () => {
    const map = forgeTaskLinkMap([
      { source_key: "a", task_id: 1, status: "running", verdict: null, updated_at: "" },
      { source_key: "b", task_id: 2, status: "done", verdict: null, updated_at: "" },
    ])
    expect(map.get("a")?.task_id).toBe(1)
    expect(map.get("b")?.task_id).toBe(2)
    expect(map.get("c")).toBeUndefined()
  })
})
