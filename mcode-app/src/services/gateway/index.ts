import { RelayGateway } from "./relayGateway"
import { DirectGateway } from "./directGateway"
import type { CodegGateway, GatewayMode, PairParams, RelaySessionInfo } from "./types"

export function createGateway(params: {
  mode: GatewayMode
  relayUrl?: string
  directBaseUrl?: string
  session?: RelaySessionInfo | null
}): CodegGateway {
  if (params.mode === "direct") {
    return new DirectGateway(params.directBaseUrl ?? "")
  }
  return new RelayGateway(params.relayUrl ?? "", params.session ?? { accessToken: "" })
}

export type { CodegGateway, GatewayMode, PairParams, RelaySessionInfo, TargetProfile } from "./types"
