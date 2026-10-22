import fs from "node:fs"
import path from "node:path"

function read(relativePath: string) {
  return fs.readFileSync(path.resolve(__dirname, relativePath), "utf8")
}

function extractBlock(source: string, startToken: string, endToken: string) {
  const start = source.indexOf(startToken)
  const end = source.indexOf(endToken, start)
  if (start < 0 || end < 0) {
    throw new Error(`Failed to extract block from ${startToken}`)
  }
  return source.slice(start, end)
}

const PAGE = "../../../src/pages/conversations/index.vue"
const SECTION =
  "../../../src/pages/conversations/components/ConversationFolderSection.vue"
const ROW = "../../../src/pages/conversations/components/ConversationListRow.vue"

describe("conversation row long-press action sheet contract", () => {
  it("emits a menu event from the row on long press", () => {
    const row = read(ROW)

    expect(row).toContain('@longpress="handleLongPress"')
    expect(row).toContain('(event: "menu"): void')
    expect(row).toContain('emit("menu")')
  })

  // 长按后手指抬起，部分端还会补发一次 click。不吞掉它就是「菜单弹了、会话也开了」。
  it("swallows the click that follows a long press", () => {
    const row = read(ROW)
    const block = extractBlock(row, "function handleClick() {", "\n}")

    expect(row).toContain("let longPressConsumedClick = false")
    expect(block).toContain("if (longPressConsumedClick) {")
    expect(block).toContain("longPressConsumedClick = false")
    expect(block).toContain("return")
    expect(block).toContain('emit("open")')
  })

  it("forwards the long press from the row up to the page", () => {
    const section = read(SECTION)
    const page = read(PAGE)

    expect(section).toContain('@menu="emit(\'menu\', card)"')
    expect(section).toContain('(event: "menu", card: any): void')
    // 卡片不带连接键，所以页面接的时候要把分组的连接上下文一起带上。
    expect(page).toContain('@menu="handleRowMenu(folder, $event)"')
  })

  it("opens the sheet only outside selection mode and only for real conversations", () => {
    const page = read(PAGE)
    const block = extractBlock(
      page,
      "function handleRowMenu(folder: { connectionKey: string }, card: DisplayLiveSessionCard) {",
      "\n}"
    )

    // 选择模式下手指在勾选，弹层会打断批量操作。
    expect(block).toContain("if (selectionMode.value) return")
    // 空标签（没有会话号）没有任何可操作对象。
    expect(block).toContain("if (Number(card?.conversationId || 0) <= 0) return")
    expect(block).toContain("rowActionSheetVisible.value = true")
  })

  it("binds the sheet to a state-derived action list", () => {
    const page = read(PAGE)

    expect(page).toContain("<up-action-sheet")
    expect(page).toContain(':actions="rowActionList"')
    expect(page).toContain(':show="rowActionSheetVisible"')
    expect(page).toContain('@select="handleRowActionSelect"')
    // 条目按目标会话的当前状态现算，不是固定表。
    expect(page).toContain(
      "status: rowActionTarget.value?.card?.displayStatus || rowActionTarget.value?.card?.status"
    )
    expect(page).toContain("isPinned: rowActionTarget.value?.card?.isPinned === true")
  })

  it("dispatches every menu entry to its own handler", () => {
    const page = read(PAGE)
    const block = extractBlock(page, "function handleRowActionSelect(event: any) {", "\n}")

    expect(block).toContain('case "rename":')
    expect(block).toContain('case "pin":')
    expect(block).toContain('case "unpin":')
    expect(block).toContain('case "archive":')
    expect(block).toContain('case "unarchive":')
    expect(block).toContain('case "delete":')
  })

  it("writes rename through update_conversation_title", () => {
    const page = read(PAGE)

    expect(page).toContain('gateway.call("update_conversation_title"')
    // 改名输入框要预填当前名字，空输入不该发请求。
    expect(page).toContain("if (!nextTitle || nextTitle === previousTitle) return")
    expect(page).toContain('title: "改名"')
    expect(page).toContain("editable: true")
  })

  // 置顶命令名收在一处常量里：服务端若不是这个名字，只改常量。
  it("writes pin through the single pinned command constant", () => {
    const page = read(PAGE)
    const block = extractBlock(
      page,
      "async function toggleRowConversationPinned(",
      "\n  } catch (error) {"
    )

    expect(block).toContain("gateway.call(CONVERSATION_PIN_COMMAND")
    expect(block).toContain("pinned,")
    expect(page).toContain('import {\n  CONVERSATION_ARCHIVED_STATUS,\n  CONVERSATION_PIN_COMMAND,')
  })

  // 会话没有归档字段，服务端的「完成」就是这个含义。
  it("writes archive through update_conversation_status", () => {
    const page = read(PAGE)
    const block = extractBlock(
      page,
      "async function toggleRowConversationArchived(",
      "\n  } catch (error) {"
    )

    expect(block).toContain('gateway.call("update_conversation_status"')
    expect(block).toContain(
      "status: archived ? CONVERSATION_ARCHIVED_STATUS : CONVERSATION_UNARCHIVED_STATUS"
    )
  })

  // 归档写的是 completed，而「隐藏已完成」默认开着 —— 归档完这条会话当场从列表消失，
  // 取消归档的入口（长按那一行）也一起没了。只弹「已归档」跟被删掉没区别，必须指路。
  it("tells the user where to find the conversation back after archiving", () => {
    const page = read(PAGE)
    const block = extractBlock(
      page,
      "async function toggleRowConversationArchived(",
      "\n  } catch (error) {"
    )

    // 提示必须看「隐藏已完成」的当前值，写死文案的话开关关着时也会指路，是噪音。
    expect(block).toContain("resolveArchiveSuccessToast(hideCompletedConversations.value)")
    // 指路的文案比「已归档」长，icon: "success" 那行放不下，用 none 并给足停留时间。
    expect(block).toContain('icon: "none"')
    expect(block).toContain("duration: 2500")
  })

  // 删除两道闸：菜单里不给入口（见 conversationRowActions.spec.ts 的映射用例），
  // 执行前再守一次 —— 菜单是按弹开那一刻的状态算的，弹出后会话可能已经开始跑。
  it("guards delete twice and asks for confirmation", () => {
    const page = read(PAGE)
    const block = extractBlock(
      page,
      "function requestDeleteRowConversation(target: {",
      "\n  uni.showModal({"
    )

    expect(block).toContain(
      "if (!canDeleteConversation(target.card.displayStatus || target.card.status)) {"
    )
    expect(page).toContain('uni.showToast({ title: "会话正在进行，无法删除", icon: "none" })')
    expect(page).toContain('title: "删除会话"')
    // 二次确认 = showModal + 只在 confirm 分支执行。
    expect(page).toContain("if (!result.confirm) return")
    expect(page).toContain("此操作不可恢复")
  })

  it("refreshes the list after every write", () => {
    const page = read(PAGE)
    const block = extractBlock(page, "async function refreshAfterRowAction() {", "\n}")

    expect(block).toContain("markConversationListDirty()")
    expect(block).toContain("await loadData()")
  })

  // 置顶只写字段、不改变排位的话，用户什么都看不到 —— 全局排序键是活跃时间。
  it("lifts pinned cards to the top inside their folder", () => {
    const presentation = read(
      "../../../src/pages/conversations/conversationListPresentation.ts"
    )

    expect(presentation).toContain("export function sortFolderCardsWithPinnedFirst")
    expect(presentation).toContain(
      "folder.cards = sortFolderCardsWithPinnedFirst(folder.cards)"
    )
    // 其余保持原顺序：用原下标 tiebreak，不重新洗牌。
    expect(presentation).toContain("return left.index - right.index")
  })

  it("carries the pinned flag from the snapshot into the list cards", () => {
    const snapshot = read(
      "../../../src/services/conversation/conversationOverviewSnapshot.ts"
    )
    const page = read(PAGE)

    /**
     * 置顶态**只能**经 `resolveConversationPinned` 读。
     *
     * 服务端字段是 `pinned_at` 时间戳（网关出来是 camelCase `pinnedAt`），不是布尔
     * `is_pinned`。任何一处直接写 `Boolean(conversation.is_pinned)` 都会让远程置顶
     * 读不回来 —— 手机上置顶完，下次拉远程摘要落本地又被抹平。
     */
    expect(snapshot).toContain("export function resolveConversationPinned(")
    expect(snapshot).toContain("pinned_at?: string | null")
    expect(snapshot).toContain("pinnedAt?: string | null")
    // 三处构造（打开中的标签 / 普通卡 / 落本地的 summary 映射）都必须走它。
    const uses = snapshot.split("isPinned: resolveConversationPinned(conversation)").length - 1
    expect(uses).toBe(3)
    expect(snapshot).not.toContain("isPinned: Boolean(conversation.is_pinned)")
    expect(snapshot).not.toContain("isPinned: Boolean(conversation?.is_pinned)")
    // 展示模型是 spread 原卡片，置顶标记不会被重建掉。
    expect(page).toContain("isPinned: boolean")
  })

  /**
   * 置顶必须**看得见**。
   *
   * 排位只是间接信号：一屏里只有一个分组、或者置顶的那条本来就在前面时，用户分不
   * 清「它排第一」是因为最近活跃还是因为自己置顶了 —— 想取消置顶时也不知道该长按
   * 哪一条。所以行上要有一枚图钉。
   */
  it("marks pinned rows with a pin icon", () => {
    const row = read(ROW)
    const section = read(SECTION)

    expect(row).toContain("pinned?: boolean")
    expect(row).toContain('v-if="pinned"')
    // 跨端图标：小程序不支持内联 SVG，必须走 uview 的图标字体。
    expect(row).toContain('name="pushpin-fill"')
    expect(row).toContain("conv-row__pin")
    // 图钉落在元信息行内，不在标题上 —— 标题是两行截断的，放图标会挤掉可读宽度。
    const meta = extractBlock(row, '<view class="conv-row__meta">', "</view>")
    expect(meta).toContain("conv-row__pin")
    // 分组把卡上的置顶态喂给行，行自己不猜。
    expect(section).toContain(':pinned="card.isPinned === true"')
  })
})
