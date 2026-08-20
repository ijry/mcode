/**
 * 「本地缓存最新页消息」开关（实验性，**默认关闭**）。
 *
 * 语义是**完全不用本地缓存**，不是「只是不写」：关闭时轮次既不写进 SQLite，也不从
 * SQLite 水合。两侧必须一起关 —— 只关写入的话，之前开启期间留下的旧行仍会被
 * `reloadLocalTurns` 合并回时间线，而那些行可能已经很旧，`mergeTailIntoTurns`
 * 找不到接缝就把它们**接在当前轮次后面**，用户看到的是一段错位的历史复活。
 *
 * 代价（已确认接受）：冷启动没有可先渲染的本地内容，必须等远端返回。
 *
 * 只管**轮次**（`conversation_turns` / `conversation_parts`）。会话摘要
 * （`conversations` 表，列表页标题/状态/未读）不受这个开关影响 —— 关掉它会让会话列表
 * 在离线时整个空白，那是比「详情页要等网络」严重得多的退化，也不是这个开关的语义。
 */
export const LOCAL_TURN_CACHE_ENABLED_KEY = "mcode_local_turn_cache_enabled"

function normalizeEnabled(value: unknown) {
  // 严格 `=== true`：历史上存过字符串 "true"/"yes" 的键会被当成关闭，宁可退回默认值
  // 也不要把一个来历不明的真值解释成开启。
  return value === true
}

export function readLocalTurnCacheEnabled() {
  const enabled = normalizeEnabled(uni.getStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY))
  // 回写归一化后的值：让存储里永远是布尔量，后续读取不再依赖 normalize 的宽容度。
  uni.setStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY, enabled)
  return enabled
}

export function writeLocalTurnCacheEnabled(enabled: boolean) {
  const normalized = enabled === true
  uni.setStorageSync(LOCAL_TURN_CACHE_ENABLED_KEY, normalized)
  return normalized
}
