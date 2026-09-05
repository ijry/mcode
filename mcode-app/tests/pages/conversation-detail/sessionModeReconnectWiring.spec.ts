import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, "../../../src", relativePath), "utf8")
}

/**
 * 「切了 bypass，回一条消息又变回 Manual」的接线契约。
 *
 * 根因不在 mcode-app 里，但补偿只能在这里做，所以这一组钉的是**补偿链路的三段接线**：
 *
 * 1. ACP 会话的授权模式活在 agent 进程里，而 codeg-plus 会把空闲连接收走
 *    （`acp/manager.rs::sweep_idle`）。重连时 `@agentclientprotocol/claude-agent-acp`
 *    给新会话播种的模式来自 `~/.claude` 的 `permissions.defaultMode` —— 缺省是
 *    `default`，而该适配器把 `default` 显示成「Manual」。
 * 2. 因此建连时必须把用户选过的模式一起交上去（`acp_connect.preferredModeId`）。
 *    在此之前只有新建会话弹层传它，重连一律传 `undefined`。
 * 3. 这不违反 `2026-07-03-detail-session-config-no-auto-replay.md`：codeg-plus 的
 *    `spawn_agent` 先做连接去重，命中已有会话就复用并跳过 `apply_preferred_session_options`，
 *    所以这两个字段只在「连接由我们新建」时生效。
 *
 * 少任何一段都不会报错，只会让症状原样保留。
 */
describe("session permission mode survives a reconnect", () => {
  const manager = read("services/conversation/connectionSessionManager.ts")
  const pane = read("pages/conversation-detail/ConversationDetailInteractivePane.vue")
  const createSheet = read("pages/conversations/components/CreateConversationSheet.vue")
  const memory = read("services/conversation/sessionModeMemory.ts")

  /**
   * 建连是唯一能把模式交回远端的时机 —— 而它此前把 `preferredModeId` 写死成 `undefined`。
   */
  it("ships the remembered selection on every conversation connect", () => {
    expect(manager).toContain("readConversationSessionSelection(")
    expect(manager).toContain("remembered?.modeId || undefined")
    expect(manager).toContain("remembered.configValues")
    // 反向断言：那两个位置不能再是写死的 undefined。
    const connectAt = manager.indexOf("const connection = await acpApi.acpConnect(")
    expect(connectAt).toBeGreaterThan(-1)
    const call = manager.slice(connectAt, connectAt + 420)
    expect(call).not.toContain("      undefined,\n      undefined,")
  })

  /**
   * 记忆按 `conversationId` + agent 分桶，**不含项目路径也不含 instanceKey**：建连路径
   * 只拿得到这两样。详情页那份 UI 持久化（`persistAgentConfigSelection`）的键里含项目
   * 路径与 instanceKey，两者不能互相替代。
   */
  it("keys the memory on what the connect path actually knows", () => {
    expect(memory).toContain("export function readConversationSessionSelection(")
    expect(memory).toContain("conversationId: number")
    expect(memory).toContain("agentType: string")
    // 键里不能出现项目路径 —— 建连时那一段拿不到。
    expect(memory).not.toContain("projectPath")
  })

  /** 用户显式选一次，就要同时更新 UI 持久化与会话记忆；漏掉后者等于没修。 */
  it("records the pick from the composer that owns the selector", () => {
    expect(pane).toContain("rememberConversationSessionMode(")
    expect(pane).toContain("rememberConversationSessionConfigValue(")

    const modeAt = pane.indexOf("async function selectDetailMode(modeId: string)")
    expect(modeAt).toBeGreaterThan(-1)
    const modeBody = pane.slice(modeAt, modeAt + 900)
    // 两条分支（有连接、无连接）都要记 —— 没连上时用户照样会先把模式挑好。
    expect(modeBody.match(/rememberSessionMode\(modeId\)/g)?.length).toBe(2)
    expect(modeBody).toContain("acpApi.acpSetMode(conn, modeId)")

    const valueAt = pane.indexOf("async function selectDetailConfigValue(")
    expect(valueAt).toBeGreaterThan(-1)
    const valueBody = pane.slice(valueAt, valueAt + 900)
    expect(valueBody.match(/rememberSessionConfigValue\(configId, valueId\)/g)?.length).toBe(2)
  })

  /**
   * 新建会话时选的模式也要记下来，否则「新建时挑了 bypass、从没进过详情页 composer」
   * 的会话在第一次重连后就退回 Manual。
   */
  it("seeds the memory from the create sheet", () => {
    expect(createSheet).toContain("rememberConversationSessionMode({")
    const seedAt = createSheet.indexOf("rememberConversationSessionMode({")
    const seed = createSheet.slice(seedAt, seedAt + 220)
    expect(seed).toContain("conversationId: newConversationId")
    expect(seed).toContain("modeId: preferredModeId")
  })

  /**
   * 反向断言：不能改成「attach / 重连后主动补一发 `acp_set_mode`」。那正是
   * 2026-07-03 笔记禁止的写法 —— 它会把另一端刚设好的现场配置掀掉。
   */
  it("does not replay set-mode onto a session it did not create", () => {
    expect(manager).not.toContain("acpSetMode")
    // pane 里的 `acpSetMode` 只能出现在用户显式点选那一处。
    expect(pane.match(/acpApi\.acpSetMode\(/g)?.length).toBe(1)
  })
})
