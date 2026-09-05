import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PANE = "../../../src/pages/conversation-detail/ConversationDetailInteractivePane.vue"

/**
 * 草稿按会话落库的接线契约。
 *
 * 这套基础设施（`conversation_runtime` 表、`saveDraftState` 的 read-modify-write、
 * `resolveConversationDraftRestoreState` 的三层优先级）**早就存在**，唯一的接线却在
 * `index.vue` 上 —— 而那个组件的输入框在抽离本 pane 时就没了。于是整套东西在往一个
 * 永远为空的 ref 上写。
 *
 * 所以这里钉的不是「功能存在」，而是**接线接在真正有输入框的那个组件上**，以及几个
 * 一旦漏掉就会静默丢数据的时机。
 */
describe("pane draft persistence wiring contract", () => {
  it("persists from the component that actually owns the composer", () => {
    const source = read(PANE)

    // 输入框在这个组件里（v-model 绑 inputText），落库也必须在这里。
    expect(source).toContain('v-model="inputText"')
    expect(source).toContain("saveDraftState({")
    expect(source).toContain("getRuntime(")
  })

  it("restores on mount and flushes on unmount", () => {
    const source = read(PANE)

    // 这个组件原本**没有任何生命周期钩子** —— 两个都得新增。
    expect(source).toContain("onMounted(")
    expect(source).toContain("onUnmounted(")
    expect(source).toContain("restorePaneDraft()")

    // 切 tab 是销毁式的（±1 挂载窗口），防抖里压着的那次必须在 unmount 时立即落盘，
    // 否则最后一段输入直接丢。
    const unmountAt = source.indexOf("onUnmounted(")
    const unmountBody = source.slice(unmountAt, unmountAt + 500)
    expect(unmountBody).toContain("clearDraftPersistTimer()")
    expect(unmountBody).toContain("persistPaneDraft()")
  })

  it("gates persistence behind a completed restore", () => {
    // 恢复是异步的。不设闸门的话，mount 那一刻的空值会先被防抖 watch 落盘，
    // 把上一次存的草稿覆盖成空 —— 症状是「偶尔草稿没了」，取决于时序。
    const source = read(PANE)

    expect(source).toContain("draftRestored")
    const persistAt = source.indexOf("async function persistPaneDraft()")
    expect(persistAt).toBeGreaterThan(-1)
    expect(source.slice(persistAt, persistAt + 260)).toContain("!draftRestored.value")
  })

  it("never writes base64 image payloads into the database", () => {
    // `data` 是整张图的 base64。H5 侧每次 execute 都会整库 dump 重写 IndexedDB，
    // 而草稿是每敲一个字就防抖落盘的。
    const source = read(PANE)

    expect(source).toContain("sanitizeAttachmentsForPersist(attachments.value)")
    // 直接 stringify 整个 attachments 就是漏掉过滤的写法（index.vue 那条死代码正是如此）。
    expect(source).not.toContain("attachmentsJson: JSON.stringify(attachments.value)")
  })

  it("ensures the schema itself instead of relying on another component", () => {
    // pane 可能是第一个碰 SQLite 的组件（详情页的本地水合只在有缓存那条路上跑）。
    // 少这一句，干净安装上直接 `no such table: conversation_runtime` —— 实测撞过。
    const source = read(PANE)

    expect(source).toContain("ensureConversationSchema()")
  })

  // 这条测试扫的是**另一个文件**。之前那条 `not.toContain("attachmentsJson:
  // JSON.stringify(attachments.value)")` 只检查 pane，而 index.vue 里一模一样的写法
  // （它手里的 attachments 是抽离后留下的空 ref）原封不动地躲过去了 —— 于是每次
  // onHide / onUnload 都把 pane 刚落的草稿擦成空串。
  //
  // 教训：契约测试要盯的是「这一行的所有写入者」，不是「我刚改的那个文件」。
  it("keeps the detail page from writing draft columns at all", () => {
    const source = read("../../../src/pages/conversation-detail/index.vue")

    // 详情页只拥有断点列（live/seq/isActive），必须用签名里没有草稿列的那个函数。
    expect(source).toContain("saveRuntimeCheckpoint({")
    expect(source).not.toContain("saveDraftState({")
    // 具体到落库那两列：详情页手里的值永远是空的，写进去就是数据丢失。
    expect(source).not.toContain("attachmentsJson: JSON.stringify(attachments.value)")
    expect(source).not.toContain("draftQueueJson: JSON.stringify(draftQueue.value)")

    // 内存缓存 / uni.storage 那两处写空草稿的残留（`persistConversationDraftSnapshot` 与
    // 带草稿字段的 `cacheStore.persistViewState`）已随死代码清理删掉，所以断言收紧到
    // 「页面里连这些 composer ref 都不存在」—— 少了它们，任何新的写入都无从下手。
    for (const gone of ["inputText", "attachments", "draftQueue"]) {
      expect(source).not.toContain(`${gone}.value`)
    }
    // `persistViewState` 本身留着：滚动位置确实归外壳所有。
    expect(source).toContain("cacheStore.persistViewState({")
  })

  // PC 端 opened-tab 预热在抽离 pane 时丢过一次：`ensurePcTabReadyForPrompt` 留在了
  // 详情页那条已经没有输入框的 sendDraft 上，于是手机端发消息不再帮 PC 打开标签 ——
  // 而且没有任何报错。这条钉住「能力留在详情页、调用点在 pane」这个分工。
  it("keeps the PC opened-tab warmup on the real send path", () => {
    const pane = read(PANE)
    const page = read("../../../src/pages/conversation-detail/index.vue")

    // 详情页提供能力并通过 prop 传下去（它持有 gateway / descriptor / 偏好）。
    expect(page).toContain("async function ensurePcTabReadyForPrompt()")
    expect(page).toContain(':on-before-send-prompt="ensurePcTabReadyForPrompt"')

    // pane 在真正的发送链路里调用它，且必须在建连之前 —— 建连之后才预热就晚了。
    expect(pane).toContain("props.onBeforeSendPrompt?.()")
    const sendAt = pane.indexOf("async function sendDraft(")
    expect(sendAt).toBeGreaterThan(-1)
    const body = pane.slice(sendAt, sendAt + 900)
    const hookAt = body.indexOf("props.onBeforeSendPrompt?.()")
    const connAt = body.indexOf("ensureConversationReadyForSend()")
    expect(hookAt).toBeGreaterThan(-1)
    expect(connAt).toBeGreaterThan(hookAt)
  })

  // 删死代码时漏掉了一个调用点：`restoreDraftState` 的定义被删了，`loadConversation`
  // 里那句调用留着 —— 详情页一进就 `ReferenceError: restoreDraftState is not defined`，
  // toast 显示「加载失败」。
  //
  // tsc 与 uni build **都没报**：Vue SFC 的 `<script setup>` 里，模板可见的顶层标识符
  // 在类型检查时被当作可能来自宏/全局注入，未定义的函数调用不产生 TS2304。这条空缺只能
  // 靠运行时或这种源码级断言补上。
  it("has no dangling calls to the deleted draft helpers", () => {
    const page = read("../../../src/pages/conversation-detail/index.vue")

    // 这些函数随 composer 一起删了/搬走了，页面里不能再有调用。
    for (const gone of [
      "restoreDraftState(",
      "persistConversationDraftSnapshot(",
      "readConversationDraftSnapshot(",
      "buildConversationDraftSnapshotStorageKey(",
      "submitPreparedDraft(",
      "processDraftQueue(",
      "sendQueuedDraft(",
      "prepareDraftForSend(",
    ]) {
      expect(page).not.toContain(gone)
    }
  })

  it("keys the row by instance so two hosts do not share a draft", () => {
    // `conversation_runtime` 的主键是 (instance_key, conversation_id)。传空 instanceKey
    // 会让不同主机上同号会话的草稿互相覆盖。
    const source = read(PANE)

    expect(source).toContain("function resolvePaneInstanceKey()")
    expect(source).toContain("instanceKey: resolvePaneInstanceKey()")
  })
})
