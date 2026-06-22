import { resolveXycloudBaseUrl } from "@/services/xycloudAuth"

declare const plus: {
  runtime?: {
    openURL?: (url: string) => void
    openWeb?: (url: string) => void
  }
} | undefined

export type ExternalLinkDecision = "trusted-site" | "confirm-external" | "unsupported"
export type ExternalLinkOpenResult = "opened" | "cancelled" | "unsupported"

export interface ExternalLinkClassification {
  decision: ExternalLinkDecision
  href: string
  hostname: string
}

interface ExternalLinkGuardOptions {
  siteBaseUrl?: string
  trustedHosts?: string[]
  confirmExternalOpen?: (classification: ExternalLinkClassification) => Promise<boolean>
  openUrl?: (href: string) => boolean | Promise<boolean>
}

export function normalizeHttpUrl(input: unknown): string {
  const raw = String(input || "").trim()
  if (!raw) return ""
  try {
    const url = new URL(raw)
    const protocol = url.protocol.toLowerCase()
    if (protocol !== "http:" && protocol !== "https:") return ""
    return url.toString()
  } catch {
    return ""
  }
}

export function classifyExternalUrl(
  input: unknown,
  options: Pick<ExternalLinkGuardOptions, "siteBaseUrl" | "trustedHosts"> = {},
): ExternalLinkClassification | null {
  const href = normalizeHttpUrl(input)
  if (!href) return null

  const url = new URL(href)
  const hostname = normalizeHost(url.hostname)
  const trustedHosts = collectTrustedHosts(options.siteBaseUrl, options.trustedHosts)

  return {
    decision: trustedHosts.has(hostname) ? "trusted-site" : "confirm-external",
    href,
    hostname,
  }
}

export async function openGuardedExternalUrl(
  input: unknown,
  options: ExternalLinkGuardOptions = {},
): Promise<ExternalLinkOpenResult> {
  const classification = classifyExternalUrl(input, options)
  if (!classification) return "unsupported"

  if (classification.decision === "confirm-external") {
    const confirmed = await (options.confirmExternalOpen || confirmExternalOpen)(classification)
    if (!confirmed) return "cancelled"
  }

  return (await (options.openUrl || openExternalUrlDirect)(classification.href)) ? "opened" : "unsupported"
}

export async function confirmExternalOpen(classification: ExternalLinkClassification): Promise<boolean> {
  return new Promise((resolve) => {
    uni.showModal({
      title: "即将离开本站",
      content: `将打开外部链接 ${classification.hostname}，请确认继续。`,
      confirmText: "继续打开",
      cancelText: "取消",
      success: (result) => resolve(Boolean(result.confirm)),
      fail: () => resolve(false),
    })
  })
}

export function openExternalUrlDirect(href: string): boolean {
  const normalizedHref = normalizeHttpUrl(href)
  if (!normalizedHref) return false

  const runtime = plus?.runtime
  if (runtime?.openWeb) {
    try {
      runtime.openWeb(normalizedHref)
      return true
    } catch {
      // Fallback to openURL below.
    }
  }
  if (runtime?.openURL) {
    try {
      runtime.openURL(normalizedHref)
      return true
    } catch {
      // Fall through to the browser runtime.
    }
  }

  const browserWindow = typeof window === "object" ? window : null
  if (browserWindow?.open) {
    browserWindow.open(normalizedHref, "_blank", "noopener,noreferrer")
    return true
  }

  uni.showToast({
    title: "当前平台暂不支持打开外链",
    icon: "none",
  })
  return false
}

function collectTrustedHosts(siteBaseUrl?: string, trustedHosts?: string[]): Set<string> {
  const hosts = new Set<string>()
  const siteHost = extractHostname(siteBaseUrl || resolveXycloudBaseUrl())
  if (siteHost) hosts.add(siteHost)

  for (const trustedHost of trustedHosts || []) {
    const normalized = normalizeHost(trustedHost)
    if (normalized) hosts.add(normalized)
  }

  return hosts
}

function extractHostname(input: string): string {
  try {
    return normalizeHost(new URL(String(input || "").trim()).hostname)
  } catch {
    return ""
  }
}

function normalizeHost(input: unknown): string {
  return String(input || "").trim().toLowerCase()
}
