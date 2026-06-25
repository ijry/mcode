import { defineStore } from "pinia"

export type DesktopRelayStatus = "offline" | "connecting" | "online"
export type DesktopGatewayProvider = "official" | "custom"

export const useDesktopRuntimeStore = defineStore("desktopRuntime", {
  state: () => ({
    relayStatus: "offline" as DesktopRelayStatus,
    activeTargetAgent: "mcode-desktop" as const,
    displayName: "MCode Desktop",
    gatewayProvider: "official" as DesktopGatewayProvider,
    gatewayBaseUrl: "",
    capabilities: ["desktop.tunnel.available"] as string[],
    pairCode: "",
    pairSecret: "",
    tunnelBind: "127.0.0.1:1080",
  }),
})
