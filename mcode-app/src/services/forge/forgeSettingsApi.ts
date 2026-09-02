import type { CodegGateway } from "@/services/gateway"
import type { ForgePanelSettings, ForgeScenarioId, ForgeSettingsStore } from "@/types/forge"
import { FORGE_PROMPT_CAP } from "@/types/forge"

/**
 * 仓库面板设置（`forge_settings_*`）的唯一封装层。
 *
 * ## 作用域语义（两处不同名，是这个文件最容易出错的地方）
 *
 * 线上全局行是 **`folderId: null`**；而 UI 的作用域选择器持有的「全部项目」哨兵值是
 * **`0`**（与任务设置弹层同一套词汇）。`0 → null` 的转换必须**在这一层做且只做一次**
 * —— 忘了会把全局设置写到一个不存在的 folder 0 上，表现是「保存成功但下次打开什么都
 * 没变」。
 *
 * `settings: null` 是「**删掉**这个项目自己那行，让它回去跟随全局」，不是「清空设置」。
 * 全局行本身不能删（服务端会以 422 拒绝）—— 它后面没有东西可以回退。
 *
 * ## 覆盖是整份替换
 *
 * 一个文件夹保存了自己的设置就**完全脱离**全局行，不是逐字段合并。这条规则是从任务
 * 设置照抄过来的：两个弹层在同一个面板上隔一次点击，学过「这个文件夹现在有自己的设置」
 * 的用户不该在另一个里遇到不同的算法。
 *
 * 命名：响应与请求 DTO **都是 snake_case**（这是直接进存储的同一个 blob，不是围绕它
 * 建的请求 DTO），只有外层 param 是 camelCase（`folderId` / `settings`）。
 */

/** 保留的 `scenario_prompts` 键，对每个场景都拼上。 */
export const FORGE_PROMPT_ALL_KEY = "all"

/** 设置弹层里要显示的 5 个提示词槽位（顺序即显示顺序）。 */
export const FORGE_PROMPT_SLOTS: Array<{ key: string; label: string; hint: string }> = [
  {
    key: FORGE_PROMPT_ALL_KEY,
    label: "所有场景",
    hint: "从这个面板创建的每个任务都会拼上这段。",
  },
  { key: "fix", label: "直接修复 / 实现", hint: "只在这个场景下拼上。" },
  { key: "plan_first", label: "先出方案", hint: "只在这个场景下拼上。" },
  { key: "review_fix", label: "评审并修复", hint: "只在这个场景下拼上。" },
  { key: "review_only", label: "只评审", hint: "只在这个场景下拼上。" },
]

/* ===== 读 ===== */

/**
 * 所有作用域一次给全。
 *
 * 弹层需要全部（它显示一个作用域的同时要说明那个作用域是否在跟随全局），而页面反正
 * 也要全局行来解析当前屏幕上的文件夹 —— 一个值，一次读。
 */
export async function fetchForgeSettings(gateway: CodegGateway): Promise<ForgeSettingsStore> {
  const raw = await gateway.call<unknown>("forge_settings_get", {})
  return normalizeForgeSettingsStore(raw)
}

/* ===== 写 ===== */

/**
 * 保存一个作用域，拿回存储后的全部作用域。
 *
 * `folderId` 传 UI 的哨兵值（`0` = 全局），转换在这里做。`settings` 传 `null` 表示
 * 删掉这个文件夹自己那行。
 */
export async function saveForgeSettings(
  gateway: CodegGateway,
  folderId: number,
  settings: ForgePanelSettings | null
): Promise<ForgeSettingsStore> {
  const raw = await gateway.call<unknown>("forge_settings_set", {
    // **唯一**一处 `0 → null` 的转换（见文件头）。
    folderId: folderId > 0 ? folderId : null,
    settings: settings ? serializeSettings(settings) : null,
  })
  return normalizeForgeSettingsStore(raw)
}

/* ===== 作用域解析 ===== */

/**
 * 对一个文件夹**生效**的设置：它自己那份整份替换，否则全局行。
 *
 * **绝不逐字段混合** —— 见文件头。
 */
export function effectiveForgeSettings(
  store: ForgeSettingsStore | null,
  folderId: number
): ForgePanelSettings {
  if (!store) return defaultForgePanelSettings()
  // JSON 没有整数键，folder id 到了 TS 是字符串。
  const own = folderId > 0 ? store.folders[String(folderId)] : undefined
  return own || store.global
}

/**
 * 一个文件夹**自己**那份，`null` = 它在跟随全局。
 *
 * 弹层靠这个区分两者：一个显示着全局值却写着「自定义」的表单会让用户以为他已经脱离了
 * 全局，而实际上还没有。
 */
export function ownForgeSettings(
  store: ForgeSettingsStore | null,
  folderId: number
): ForgePanelSettings | null {
  if (!store || folderId <= 0) return null
  return store.folders[String(folderId)] || null
}

/** 内置默认（与 Rust `ForgePanelSettings::default` 一致，注意 `writeback_default` 是 true）。 */
export function defaultForgePanelSettings(): ForgePanelSettings {
  return {
    default_issue_scenario: null,
    default_pr_scenario: null,
    writeback_default: true,
    scenario_prompts: {},
  }
}

/* ===== 校验 ===== */

/**
 * 提示词长度校验。返回第一个超限的槽位说明，`null` = 都合法。
 *
 * 服务端保存时会以错误拒绝（**不静默截断** —— 用户敲进去的字不该无声消失），所以这里
 * 在**打字时**就撞到上限，而不是让他写完 4000 字之后被告知。
 */
export function validateForgePrompts(prompts: Record<string, string>): string | null {
  for (const slot of FORGE_PROMPT_SLOTS) {
    const text = String(prompts[slot.key] || "")
    if (text.length > FORGE_PROMPT_CAP) {
      return `「${slot.label}」的提示词超过 ${FORGE_PROMPT_CAP} 字，请缩短。`
    }
  }
  return null
}

/* ===== 归一化 ===== */

export function normalizeForgeSettingsStore(input: unknown): ForgeSettingsStore {
  const raw = normalizeRecord(input)
  const folders: Record<string, ForgePanelSettings> = {}
  const rawFolders = normalizeRecord(raw?.folders)
  if (rawFolders) {
    Object.entries(rawFolders).forEach(([key, value]) => {
      const settings = normalizeForgePanelSettings(value)
      // 只保留能解析成正整数的键：一个坏掉的键在 UI 上是一个点不开的「项目 #NaN」。
      const folderId = Number(key)
      if (Number.isFinite(folderId) && folderId > 0) {
        folders[String(Math.trunc(folderId))] = settings
      }
    })
  }
  return { global: normalizeForgePanelSettings(raw?.global), folders }
}

/**
 * 一个作用域的设置。
 *
 * **缺失字段一律补内置默认**（与 Rust `Default` 一致），因为设置弹层是受控表单：
 * `undefined` 会让 up-switch 与输入框变成非受控的。
 *
 * `writeback_default` 的内置默认是 **true**，所以缺省**不能**读成 false ——
 * 只有显式 `false` 才是关。
 */
export function normalizeForgePanelSettings(input: unknown): ForgePanelSettings {
  const raw = normalizeRecord(input)
  return {
    default_issue_scenario: normalizeScenario(
      raw?.default_issue_scenario ?? raw?.defaultIssueScenario
    ),
    default_pr_scenario: normalizeScenario(raw?.default_pr_scenario ?? raw?.defaultPrScenario),
    writeback_default:
      (raw?.writeback_default ?? raw?.writebackDefault) === undefined
        ? true
        : Boolean(raw?.writeback_default ?? raw?.writebackDefault),
    scenario_prompts: normalizeStringMap(raw?.scenario_prompts ?? raw?.scenarioPrompts),
  }
}

/**
 * 写回时的形状。
 *
 * 空白提示词**整个键删掉**而不是写一个 `""`：与服务端 `normalized()` 一致 ——
 * 一个清空过的输入框不该在存储里留下一条空记录，那会让下一个读者以为它被配置过。
 */
function serializeSettings(settings: ForgePanelSettings): Record<string, unknown> {
  const prompts: Record<string, string> = {}
  Object.entries(settings.scenario_prompts || {}).forEach(([key, value]) => {
    const text = String(value || "").trim()
    if (text) prompts[key] = text
  })
  return {
    default_issue_scenario: settings.default_issue_scenario,
    default_pr_scenario: settings.default_pr_scenario,
    writeback_default: Boolean(settings.writeback_default),
    scenario_prompts: prompts,
  }
}

/**
 * 场景名。
 *
 * 走白名单：一个不认识的值（未来版本的场景、手改的存储）当成「没配置」而不是原样透传
 * —— 透传会让弹层预选一个它自己都不提供的选项，于是打开时什么都没选上。
 */
function normalizeScenario(value: unknown): ForgeScenarioId | null {
  const scenario = typeof value === "string" ? value.trim() : ""
  return scenario === "fix" ||
    scenario === "plan_first" ||
    scenario === "review_fix" ||
    scenario === "review_only"
    ? scenario
    : null
}

function normalizeRecord(input: unknown): Record<string, any> | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null
  return input as Record<string, any>
}

function normalizeStringMap(input: unknown): Record<string, string> {
  const record = normalizeRecord(input)
  if (!record) return {}
  const next: Record<string, string> = {}
  Object.entries(record).forEach(([key, value]) => {
    // **未知键保留**（与服务端一致）：一个未来版本的场景不该在这一端被静默丢掉，
    // 否则用户在新版本配的提示词会在旧版本保存一次之后消失。
    if (typeof value === "string") next[key] = value
  })
  return next
}
