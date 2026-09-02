import { toErrorMessage } from "@/services/gateway/error"

/**
 * forge 复活守卫的拒绝信息解析。
 *
 * 由服务端 `work_task_service.rs` 的 `duplicate_active_source_error` 抛出，包在一个
 * 普通校验错误里（这个守卫没有自己的 error code），所以匹配靠下面这个标记而不是
 * 结构化字段。两条回到活动集的路都会触发它：`retry`（failed → queued）与
 * `requeue`（canceled → todo）。
 *
 * 为什么值得专门解析：**这是唯一一个「有出路」的拒绝** —— 服务端接受
 * `allowDuplicateSource` 豁免。不识别它的话，一个失败的 forge 任务就是死路：
 * 只要替身任务还活着，这张卡片的每一次重启都会被拒，而 toast 里的原始标记
 * 用户什么也做不了。
 */

const MARKER = "duplicate_active_source:"

/** 已经占着这个工作项的**另一个**任务。 */
export interface DuplicateActiveSource {
  /** 服务端改了措辞、正则没匹配上时为 null。 */
  id: number | null
  title: string | null
}

/**
 * 贪婪捕获标题 + 锚定后缀 —— issue 标题本身可能以 `)` 结尾，惰性匹配会停在
 * 第一个右括号上把标题截断。
 */
const PATTERN = /duplicate_active_source: task #(\d+) \(([\s\S]*)\) is already active/

/**
 * 识别守卫的拒绝。其它任何失败返回 `null` —— 那些仍旧只是一条 toast，
 * 因为没有可决定的事。
 */
export function duplicateActiveSource(error: unknown): DuplicateActiveSource | null {
  const text = toErrorMessage(error)
  if (!text.includes(MARKER)) return null
  const match = PATTERN.exec(text)
  // 标记才是契约，id 与标题是装饰。措辞漂移过的详情串仍然要拿到豁免入口，
  // 所以解析失败退化成「无名的重复」而不是「不是重复」。
  if (!match) return { id: null, title: null }
  const id = Number.parseInt(match[1], 10)
  const title = (match[2] || "").trim()
  return {
    id: Number.isFinite(id) ? id : null,
    title: title || null,
  }
}

/**
 * 警告里怎么称呼那个任务。解析降级时用 `anonymous` 兜住 —— 没有 `#id` 可指的时候
 * 句子仍然要读得通。
 */
export function duplicateActiveSourceLabel(
  duplicate: DuplicateActiveSource,
  anonymous = "另一个任务"
): string {
  if (duplicate.id == null) return anonymous
  return duplicate.title ? `#${duplicate.id}（${duplicate.title}）` : `#${duplicate.id}`
}
