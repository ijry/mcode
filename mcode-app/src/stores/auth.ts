import { defineStore } from "pinia"

import { createGateway } from "@/services/gateway"
import { getDirectToken, setDirectToken } from "@/services/gateway/directTokenStore"
import type { GatewayMode, RelaySessionInfo } from "@/services/gateway"
import { registerRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"

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
      setDirectToken(directBaseUrl, token)
    },
    clearAuth() {
      this.mode = "relay"
      this.relayUrl = ""
      this.directBaseUrl = ""
      this.relaySession = null
    },
    gateway() {
      return createGateway({
        mode: this.mode,
        relayUrl: this.relayUrl,
        directBaseUrl: this.directBaseUrl,
        session: this.relaySession,
      })
    },
    currentRemoteInstance() {
      const gateway = this.gateway()
      const descriptor = gateway.getRemoteInstanceDescriptor()
      registerRemoteInstanceDescriptor(descriptor)
      if (descriptor.instanceKey) return descriptor

      const baseUrl = this.mode === "direct" ? this.directBaseUrl : this.relayUrl
      const principal =
        this.mode === "relay"
          ? this.relaySession?.targetId || this.relaySession?.refreshToken || "relay:anonymous"
          : getDirectToken(baseUrl).slice(0, 16) || "direct:anonymous"

      return {
        ...descriptor,
        baseUrl,
        principal,
        instanceKey: buildRemoteInstanceKey({
          mode: this.mode,
          baseUrl,
          principal,
        }),
      }
    },
  },
  persist: {
    storage: {
      getItem: (key: string) => uni.getStorageSync(key),
      setItem: (key: string, value: string) => uni.setStorageSync(key, value),
    },
  },
})
