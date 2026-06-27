import { defineStore } from "pinia"
import {
  configureGateway,
  connectGatewayUpstream,
  generateDesktopPairOffer,
  getDesktopHealth,
  OFFICIAL_GATEWAY_BASE_URL,
  refreshCliStatus as refreshCliStatusCommand,
  saveLocalService,
  type CliPendingInteraction,
  type CliRuntimeSession,
  type CliRuntimeStatus,
  type DesktopHealthSnapshot,
  type DiagnosticEntry,
  type GatewayProvider,
  type PairOffer,
  type UpstreamStatus,
} from "../lib/runtimeApi"
import {
  buildLocalServiceConfig,
  describeServiceBind,
  type LocalServiceConfig,
} from "../lib/localServices"

function createDefaultService(): LocalServiceConfig {
  return buildLocalServiceConfig({ name: "Code", host: "127.0.0.1", port: 1080 })
}

function buildStatusMessage(error?: string | null): string {
  return error?.trim() ? error.trim() : ""
}

export const useDesktopRuntimeStore = defineStore("desktopRuntime", {
  state: () => ({
    relayStatus: "offline" as UpstreamStatus,
    upstreamError: "",
    targetId: "",
    activeTargetAgent: "mcode-desktop" as const,
    displayName: "MCode Desktop",
    version: "",
    gatewayProvider: "official" as GatewayProvider,
    gatewayBaseUrl: OFFICIAL_GATEWAY_BASE_URL,
    capabilities: ["desktop.tunnel.available"] as string[],
    cliRuntimes: [] as CliRuntimeStatus[],
    cliSessions: [] as CliRuntimeSession[],
    cliPendingInteractions: [] as CliPendingInteraction[],
    pairCode: "",
    pairSecret: "",
    qrPayload: "",
    tunnelBind: "127.0.0.1:1080",
    localService: createDefaultService(),
    diagnostics: [] as DiagnosticEntry[],
    upstreamReconnectAttempt: 0,
    upstreamNextRetryDelayMs: null as number | null,
    lastAckEventId: null as number | null,
    recoveryStorageMode: "memory",
    queuedOutboundEventCount: 0,
    oldestQueuedLocalEventId: null as number | null,
    lastAckLocalEventId: null as number | null,
    lastRelayEventId: null as number | null,
    replaySupported: false,
    interruptedSessionCount: 0,
    stalePendingInteractionCount: 0,
    activeControllerId: "",
    shutdownRequested: false,
    lastMessage: "",
  }),
  actions: {
    applyHealthSnapshot(health: DesktopHealthSnapshot) {
      this.relayStatus = health.upstreamStatus
      this.upstreamError = buildStatusMessage(health.upstreamError)
      this.targetId = health.targetId
      this.activeTargetAgent = health.targetAgent
      this.displayName = health.displayName
      this.version = health.version
      this.capabilities = health.capabilities
      this.cliRuntimes = health.cliRuntimes || []
      this.cliSessions = health.cliSessions || []
      this.cliPendingInteractions = health.cliPendingInteractions || []
      if (health.gatewayProvider) {
        this.gatewayProvider = health.gatewayProvider
      }
      if (health.gatewayBaseUrl) {
        this.gatewayBaseUrl = health.gatewayBaseUrl
      }
      if (health.pairOffer) {
        this.pairCode = health.pairOffer.code
        this.pairSecret = health.pairOffer.secret
        this.qrPayload = health.pairOffer.qrPayload
      }
      if (health.localServices.length > 0) {
        this.localService = health.localServices[0]
        this.tunnelBind = describeServiceBind(this.localService)
      }
      this.diagnostics = health.diagnostics || []
      this.upstreamReconnectAttempt = health.upstreamReconnectAttempt || 0
      this.upstreamNextRetryDelayMs = health.upstreamNextRetryDelayMs ?? null
      this.recoveryStorageMode = health.recoveryStorageMode || "memory"
      this.queuedOutboundEventCount = health.queuedOutboundEventCount || 0
      this.oldestQueuedLocalEventId = health.oldestQueuedLocalEventId ?? null
      this.lastAckLocalEventId = health.lastAckLocalEventId ?? null
      this.lastRelayEventId = health.lastRelayEventId ?? health.lastAckEventId ?? null
      this.replaySupported = Boolean(health.replaySupported)
      this.interruptedSessionCount = health.interruptedSessionCount || 0
      this.stalePendingInteractionCount = health.stalePendingInteractionCount || 0
      this.lastAckEventId = this.lastRelayEventId
      this.activeControllerId = health.activeControllerId || ""
      this.shutdownRequested = Boolean(health.shutdownRequested)
    },
    async refreshHealth() {
      try {
        this.applyHealthSnapshot(await getDesktopHealth())
      } catch (error) {
        this.relayStatus = "error"
        this.upstreamError = error instanceof Error ? error.message : String(error)
      }
    },
    async refreshCliStatus() {
      try {
        const health = await refreshCliStatusCommand()
        this.applyHealthSnapshot(health)
        return health
      } catch (error) {
        this.upstreamError = error instanceof Error ? error.message : String(error)
        throw error
      }
    },
    async setGatewayProvider(provider: GatewayProvider) {
      this.gatewayProvider = provider
      if (provider === "official" && !this.gatewayBaseUrl.trim()) {
        this.gatewayBaseUrl = OFFICIAL_GATEWAY_BASE_URL
      }
    },
    async configureGatewayConnection() {
      this.relayStatus = "connecting"
      this.upstreamError = ""
      const health = await configureGateway({
        provider: this.gatewayProvider,
        baseUrl: this.gatewayBaseUrl || OFFICIAL_GATEWAY_BASE_URL,
      })
      this.applyHealthSnapshot(health)
      return health
    },
    async connectGateway() {
      this.relayStatus = "connecting"
      this.upstreamError = ""
      await this.configureGatewayConnection()
      if (!this.pairCode) {
        await this.createPairOffer()
      }
      const health = await connectGatewayUpstream()
      this.applyHealthSnapshot(health)
      return health
    },
    async createPairOffer() {
      const offer: PairOffer = await generateDesktopPairOffer({
        name: this.displayName,
        provider: this.gatewayProvider,
        baseUrl: this.gatewayBaseUrl || undefined,
      })
      this.pairCode = offer.code
      this.pairSecret = offer.secret
      this.qrPayload = offer.qrPayload
      return offer
    },
    async saveService(config: LocalServiceConfig) {
      const saved = await saveLocalService(config)
      this.localService = saved
      this.tunnelBind = describeServiceBind(saved)
      await this.refreshHealth()
      return saved
    },
  },
})
