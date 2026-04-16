import { defineStore } from "pinia"

import { createGateway } from "@/services/gateway"
import type { GatewayMode, RelaySessionInfo } from "@/services/gateway"

export const useAuthStore = defineStore("auth", {
  state: () => ({
    mode: "relay" as GatewayMode,
    relayUrl: "",
    directBaseUrl: "",
    relaySession: null as RelaySessionInfo | null,
  }),
  actions: {
    setRelayMode(relayUrl: string, session: RelaySessionInfo) {
      this.mode = "relay"
      this.relayUrl = relayUrl
      this.relaySession = session
    },
    setDirectMode(directBaseUrl: string, token: string) {
      this.mode = "direct"
      this.directBaseUrl = directBaseUrl
      uni.setStorageSync("mcode_direct_token", token)
    },
    gateway() {
      return createGateway({
        mode: this.mode,
        relayUrl: this.relayUrl,
        directBaseUrl: this.directBaseUrl,
        session: this.relaySession,
      })
    },
  },
})
