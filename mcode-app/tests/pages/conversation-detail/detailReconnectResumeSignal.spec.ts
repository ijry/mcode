import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, "../../../src", relativePath), "utf8")
}

/**
 * 重连时「接回原会话」的取数顺序。
 *
 * 这里曾经有一个**不会报错**的 bug：`reconnectDetailAgent()` 先
 * `runtime.invalidateConnection()`，再去读 resume id。而 resume id 只挂在
 * `connectionSessionManager` 的那条记录上（`externalId` / `connection.sessionId`），
 * `invalidateConnection` 内部又会 `clearConversation()` 把整条记录删掉 ——
 * 于是读到的永远是 `undefined`，重连必然拉起一个空会话，用户看到的是「历史没了」。
 *
 * 更早的写法读的是 `session.value?.resumeSessionId`，那个字段根本不存在于
 * `RuntimeSession`（v-tsc 报 TS2339），等于同一个错误的另一种形态。
 *
 * 这组断言钉的是**顺序**与**来源**，因为两者都错了也照样能编译、能跑。
 */
describe("detail reconnect keeps the resume session id", () => {
  const page = read("pages/conversation-detail/index.vue")

  function reconnectBody() {
    const start = page.indexOf("async function reconnectDetailAgent(")
    expect(start).toBeGreaterThan(-1)
    return page.slice(start, start + 2200)
  }

  it("reads the resume id before invalidating the connection", () => {
    const body = reconnectBody()
    const readAt = body.indexOf("resumeSessionId")
    const invalidateAt = body.indexOf("invalidateConnection(")

    expect(readAt).toBeGreaterThan(-1)
    expect(invalidateAt).toBeGreaterThan(-1)
    // 顺序是这条契约的全部 —— 反了就读到已被清空的记录。
    expect(readAt).toBeLessThan(invalidateAt)
  })

  it("takes the resume id from the connection manager, not the runtime session", () => {
    const body = reconnectBody()
    expect(body).toContain("connectionSessionManager.getByConversationId(")
    expect(body).toContain("managed?.externalId")
    // RuntimeSession 上没有这个字段，读它会静默拿到 undefined。
    expect(body).not.toContain("session.value?.resumeSessionId")
  })

  it("falls back to the persisted summary for a cold re-connect", () => {
    // 没有热连接时管理器里没有记录（冷启动、agent 进程被杀之后），
    // 必须能退到持久化摘要 —— 与首次加载走的是同一条来源。
    const body = reconnectBody()
    expect(body).toContain("getConversationSummaryById(instanceKey")
    expect(body).toMatch(/summary\?\.externalId/)
  })

  it("forwards the resolved id into runtime.connect", () => {
    const body = reconnectBody()
    const connectAt = body.indexOf("await runtime.connect(")
    expect(connectAt).toBeGreaterThan(-1)
    const call = body.slice(connectAt, connectAt + 320)
    // 第 4 个入参就是 sessionId；不能再是写死的 undefined。
    expect(call).toContain("resumeSessionId")
    expect(call).not.toContain("undefined,\n      undefined,")
  })
})
