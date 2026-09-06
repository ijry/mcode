/**
 * DSH 桥宣称的能力键 → 连接卡片上的中文标签。
 *
 * 与 `agents/mcode-desktop/capabilities.ts` 同一套路，也同一个理由：只把认识的
 * key 映射成标签，不认识的丢掉。桥以后多宣称一个能力，旧版本 App 不会显示一个
 * 看不懂的英文串，也不会因此报错。
 *
 * @module agents/dsh/capabilities
 */
import { DSH_CAPABILITY } from "./protocol"

const LABELS: Record<string, string> = {
  [DSH_CAPABILITY.sessions]: "会话",
  [DSH_CAPABILITY.events]: "实时流",
  [DSH_CAPABILITY.answers]: "审批与提问",
  [DSH_CAPABILITY.workspaces]: "项目",
  [DSH_CAPABILITY.models]: "模型切换",
  [DSH_CAPABILITY.images]: "发图片",
}

/** 认识的能力标签，去重后保持声明顺序。 */
export function getDshCapabilityLabels(capabilities: string[] = []): string[] {
  const labels = capabilities.map((value) => LABELS[value]).filter((label): label is string => Boolean(label))
  return Array.from(new Set(labels))
}

/** 桥是否宣称了某个能力。缺失一律按「没有」处理，不按「大概有」。 */
export function dshSupports(capabilities: string[] | undefined, capability: string): boolean {
  return Array.isArray(capabilities) && capabilities.includes(capability)
}
