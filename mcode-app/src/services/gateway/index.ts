import { RelayGateway } from "./relayGateway"
import { DirectGateway } from "./directGateway"
import type { CodegGateway, GatewayMode, PairParams, RelaySessionInfo } from "./types"
import { registerRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"

function withRegisteredDescriptor(gateway: CodegGateway): CodegGateway {
  const getRemoteInstanceDescriptor = gateway.getRemoteInstanceDescriptor.bind(gateway)
  gateway.getRemoteInstanceDescriptor = () => {
    const descriptor = getRemoteInstanceDescriptor()
    registerRemoteInstanceDescriptor(descriptor)
    return descriptor
  }
  return gateway
}

export function createGateway(params: {
  mode: GatewayMode
  relayUrl?: string
  directBaseUrl?: string
  session?: RelaySessionInfo | null
}): CodegGateway {
  if (params.mode === "direct") {
    return withRegisteredDescriptor(new DirectGateway(params.directBaseUrl ?? ""))
  }
  return withRegisteredDescriptor(
    new RelayGateway(params.relayUrl ?? "", params.session ?? { accessToken: "" })
  )
}

export { resolveConnectionDriver } from "./connectionDriverRegistry"
export type {
  ConnectionDriver,
  ConnectionDriverId,
  PairResultMetadata,
} from "./connectionDriverRegistry"
export type {
  CodegGateway,
  GatewayMode,
  PairParams,
  PairTargetMetadata,
  RelaySessionInfo,
  TargetProfile,
} from "./types"
