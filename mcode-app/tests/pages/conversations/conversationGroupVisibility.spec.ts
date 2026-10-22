import fs from "node:fs"
import path from "node:path"

import {
  CONVERSATION_GROUP_INITIAL_ROWS,
  CONVERSATION_GROUP_STEP_ROWS,
  buildGroupMoreLabel,
  resolveGroupHiddenCount,
  resolveGroupVisibleCards,
} from "@/pages/conversations/conversationListPresentation"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

const PAGE = "../../../src/pages/conversations/index.vue"
const SECTION = "../../../src/pages/conversations/components/ConversationFolderSection.vue"
const SHEET = "../../../src/pages/conversations/components/CreateConversationSheet.vue"

/**
 * 分组的「初始几行 + 查看更多」与文件夹头「＋」的语义。
 *
 * 两条都栽过同一个坑：**规则放错了层**。
 *
 * 1. 「24 小时窗口 + 保底 3 条」曾写在快照里（`slice(0, N)`），于是快照本身就是列表的
 *    全部数据 —— 分组里最多 3 条，「查看更多」永远不渲染，用户以为历史会话丢了。
 *    现在快照携带全量会话，裁到几行是展示层的事（`ConversationFolderSection` 的
 *    `visibleCount`）。
 * 2. 文件夹头的「＋」曾打开「添加项目」的目录浏览器 —— 用户点的是「在这个文件夹里
 *    新建」，得到的却是另一个连接级操作。现在它直接开创建弹层并预选该文件夹。
 */
describe("conversation group visibility & folder create", () => {
  // ——— 展示层：初始行数与「查看更多」 ———

  it("folds every row past the initial count behind the more entry", () => {
    const cards = Array.from({ length: 10 }, (_, index) => ({ id: index }))

    expect(resolveGroupVisibleCards(cards, CONVERSATION_GROUP_INITIAL_ROWS)).toHaveLength(
      CONVERSATION_GROUP_INITIAL_ROWS
    )
    // 初始只放前 3 行，且必须是最前的 3 行（快照已按活跃时间排好，不能重洗）。
    expect(resolveGroupVisibleCards(cards, CONVERSATION_GROUP_INITIAL_ROWS).map((c) => c.id)).toEqual([
      0, 1, 2,
    ])
    expect(resolveGroupHiddenCount(10, CONVERSATION_GROUP_INITIAL_ROWS)).toBe(7)
    expect(buildGroupMoreLabel(7)).toBe("查看更多（7）")
  })

  it("expands by a fixed step instead of dumping everything at once", () => {
    // 一次全展开会把跑了几百轮的文件夹拉成几万像素，用户既找不到刚才那一行，
    // 也失去「还有多少」的量感。每次只多 3 行，入口上的数字继续显示剩余量。
    const cards = Array.from({ length: 10 }, (_, index) => ({ id: index }))
    const afterFirstExpand = CONVERSATION_GROUP_INITIAL_ROWS + CONVERSATION_GROUP_STEP_ROWS

    expect(resolveGroupVisibleCards(cards, afterFirstExpand)).toHaveLength(6)
    expect(resolveGroupHiddenCount(10, afterFirstExpand)).toBe(4)
    expect(buildGroupMoreLabel(4)).toBe("查看更多（4）")
  })

  it("hides the more entry once nothing is left", () => {
    expect(resolveGroupHiddenCount(2, CONVERSATION_GROUP_INITIAL_ROWS)).toBe(0)
    expect(buildGroupMoreLabel(0)).toBe("")
  })

  it("renders the more entry from the hidden count, not a boolean", () => {
    // 布尔只能表达「折叠 / 全展开」两态，中间那几步没有位置放 —— 入口上必须带剩余数量。
    const section = read(SECTION)

    expect(section).toContain('v-if="hiddenCount > 0"')
    expect(section).toContain("conv-group__more")
    expect(section).toContain("{{ moreLabel }}")
    expect(section).toContain("visibleCount.value += CONVERSATION_GROUP_STEP_ROWS")
  })

  // ——— 快照不再裁数据：分组拿到的是全量 ———

  it("passes the snapshot's full card list into every folder group", () => {
    // 页面把 snapshot.cards 原样交给 buildConversationFolderGroups，中间不再 slice ——
    // 任何一层裁剪都会让「查看更多」无内容可展开。
    const page = read(PAGE)

    expect(page).toContain("cards: snapshot.cards")
    expect(page).toContain("buildConversationFolderGroups([group])")
    expect(page).not.toContain("slice(0, MIN_RECENT_ACTIVE_CARDS")
  })

  // ——— 文件夹头的「＋」：在这个文件夹里新建 ———

  it("wires the folder plus button to create-in-folder", () => {
    const page = read(PAGE)
    const section = read(SECTION)

    // 分组把 folderId 交出来，页面据此预选弹层的项目。
    expect(section).toContain("emit('create', folderId)")
    expect(page).toContain('@create="createConversationInFolder(folder)"')
    expect(page).toContain(':default-folder-id="createSheetDefaultFolderId"')
  })

  it("preselects the folder the user clicked, and only that one", () => {
    const page = read(PAGE)
    const start = page.indexOf("function createConversationInFolder(folder: {")
    expect(start).toBeGreaterThan(-1)
    const end = page.indexOf("\n}", start)
    expect(end).toBeGreaterThan(start)
    const block = page.slice(start, end)

    expect(block).toContain("createSheetDefaultConnectionKey.value = folder.connectionKey")
    expect(block).toContain(
      "createSheetDefaultFolderId.value = folder.folderId > 0 ? folder.folderId : 0"
    )
    expect(block).toContain("showCreateDialog.value = true")
  })

  it("leaves the topbar plus button without a preselected folder", () => {
    // 顶栏「＋」是「新建一个，建在哪儿待定」—— 不能残留上一次文件夹头带入的预选。
    const page = read(PAGE)
    const start = page.indexOf("function createConversation() {")
    expect(start).toBeGreaterThan(-1)
    const end = page.indexOf("\n}", start)
    expect(end).toBeGreaterThan(start)
    const block = page.slice(start, end)

    expect(block).toContain("createSheetDefaultFolderId.value = 0")
  })

  it("preselects the default folder inside the sheet, matching the picker's naming", () => {
    const sheet = read(SHEET)

    expect(sheet).toContain("defaultFolderId?: number")
    expect(sheet).toContain("applyDefaultFolderSelection()")
    // 名称解析必须与项目 Picker 的列一致（`p.name || p.path || "未命名项目"`）——
    // 两处各写一份，预选后表单上显示的名字就会和 Picker 里的对不上。
    const start = sheet.indexOf("function applyDefaultFolderSelection() {")
    expect(start).toBeGreaterThan(-1)
    const end = sheet.indexOf("\n}", start)
    expect(end).toBeGreaterThan(start)
    const block = sheet.slice(start, end)

    expect(block).toContain('project.name || project.path || "未命名项目"')
    // 找不到（文件夹被删 / 项目列表还没刷新）就留空让用户自己选，绝不乱选一个。
    expect(block).toContain("selectedProjectId.value = 0")
  })
})
