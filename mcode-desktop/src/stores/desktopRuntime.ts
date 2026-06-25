import { defineStore } from "pinia"
import {
  configureGateway,
  connectGatewayUpstream,
  generateDesktopPairOffer,
  getDesktopHealth,
  OFFICIAL_GATEWAY_BASE_URL,
  saveLocalService,
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
    pairCode: "",
    pairSecret: "",
    qrPayload: "",
    tunnelBind: "127.0.0.1:1080",
    localService: createDefaultService(),
    diagnostics: [] as DiagnosticEntry[],
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
    },
    async refreshHealth() {
      try {
        this.applyHealthSnapshot(await getDesktopHealth())
      } catch (error) {
        this.relayStatus = "error"
        this.upstreamError = error instanceof Error ? error.message : String(error)
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
