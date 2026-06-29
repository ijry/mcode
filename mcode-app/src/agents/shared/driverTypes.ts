import type { CodegGateway, GatewayMode, RelaySessionInfo } from "@/services/gateway/types"
import { DirectGateway } from "@/services/gateway/directGateway"
import { RelayGateway } from "@/services/gateway/relayGateway"
import { getDirectToken } from "@/services/gateway/directTokenStore"
import {
  normalizeConnectionBaseUrl,
  normalizeRelaySessionInfo,
  type ConnectionRecordV2,
  type ConnectionTargetAgent,
  type ConnectionTargetProfile,
} from "@/services/connectionSchema"
import { buildRemoteInstanceKey } from "@/services/realtime/instance-key"
import { registerRemoteInstanceDescriptor } from "@/services/realtime/remoteInstanceRegistry"
import { assertPairTargetAgentMatchesSelection } from "@/services/connectionPairValidation"

export type ConnectionDriverId =
  | "codeg-direct"
  | "codeg-gateway"
  | "opencode-direct"
  | "opencode-gateway"
  | "desktop-direct"
  | "desktop-gateway"

export interface PairResultMetadata {
  targetId?: string
  targetAgent?: ConnectionTargetAgent
  displayName?: string
  capabilities?: string[]
  protocolVersion?: string
}

export type ConnectionRuntimeContext = ConnectionRecordV2

export interface DriverResolvedConnectionContext {
  connection: ConnectionRuntimeContext
  gateway: CodegGateway
  instanceKey: string
}

export interface ConnectionDriver {
  id: ConnectionDriverId
  connect(connection: ConnectionRecordV2): Promise<DriverResolvedConnectionContext>
}

export function createDirectConnectionDriver(id: ConnectionDriverId): ConnectionDriver {
  return {
    id,
    async connect(connection) {
      const directBaseUrl = normalizeConnectionBaseUrl(connection.directBaseUrl || "")
      const token = pickString(connection.directToken, getDirectToken(directBaseUrl))
      if (!token) {
        throw new Error(`${connection.name} 缺少直连令牌`)
      }

      const gateway = withRegisteredDescriptor(new DirectGateway(directBaseUrl))
      await gateway.pair({ directBaseUrl, token })
      const descriptor = gateway.getRemoteInstanceDescriptor()

      return {
        connection: toConnectionRuntimeContext({
          ...connection,
          directBaseUrl,
          directToken: token,
        }),
        gateway,
        instanceKey:
          descriptor.instanceKey ||
          buildRemoteInstanceKey({
            mode: "direct",
            baseUrl: directBaseUrl,
            principal: descriptor.principal || `direct:${token.slice(0, 16) || "anonymous"}`,
          }),
      }
    },
  }
}

export function createGatewayConnectionDriver(id: ConnectionDriverId): ConnectionDriver {
  return {
    id,
    async connect(connection) {
      const gatewayBaseUrl = normalizeConnectionBaseUrl(connection.gatewayBaseUrl || "")
      if (!gatewayBaseUrl) {
        throw new Error(`${connection.name} 缺少网关地址`)
      }

      let gatewaySession = normalizeRelaySessionInfo(connection.gatewaySession)
      if (!gatewaySession?.accessToken) {
        if (!connection.pairCode || !connection.pairSecret) {
          throw new Error(`${connection.name} 缺少网关配对信息`)
        }

        const pairGateway = withRegisteredDescriptor(
          new RelayGateway(gatewayBaseUrl, { accessToken: "" })
        )
        const session = await pairGateway.pair({
          relayUrl: gatewayBaseUrl,
          code: connection.pairCode,
          secret: connection.pairSecret,
        })
        if (!session?.accessToken) {
          throw new Error(`${connection.name} 网关会话无效`)
        }
        assertPairTargetAgentMatchesSelection(session, connection.targetAgent)
        gatewaySession = session
      }

      if (gatewaySession?.targetAgent) {
        assertPairTargetAgentMatchesSelection(gatewaySession, connection.targetAgent)
      }
      const targetProfile = buildTargetProfileFromSession(connection, gatewaySession)
      const targetAgent = targetProfile?.targetAgent || connection.targetAgent
      const gateway = withRegisteredDescriptor(new RelayGateway(gatewayBaseUrl, gatewaySession))
      const descriptor = gateway.getRemoteInstanceDescriptor()

      return {
        connection: toConnectionRuntimeContext({
          ...connection,
          targetAgent,
          gatewayBaseUrl,
          gatewaySession,
          ...(targetProfile ? { targetProfile } : {}),
        }),
        gateway,
        instanceKey:
          descriptor.instanceKey ||
          buildRemoteInstanceKey({
            mode: "relay",
            baseUrl: gatewayBaseUrl,
            principal: gatewaySession.targetId || gatewaySession.refreshToken || "relay:anonymous",
          }),
      }
    },
  }
}

export function toConnectionRuntimeContext(record: ConnectionRecordV2): ConnectionRuntimeContext {
  return { ...record }
}

function withRegisteredDescriptor(gateway: CodegGateway): CodegGateway {
  const getRemoteInstanceDescriptor = gateway.getRemoteInstanceDescriptor.bind(gateway)
  gateway.getRemoteInstanceDescriptor = () => {
    const descriptor = getRemoteInstanceDescriptor()
    registerRemoteInstanceDescriptor(descriptor)
    return descriptor
  }
  return gateway
}

function buildTargetProfileFromSession(
  connection: ConnectionRecordV2,
  session: RelaySessionInfo
): ConnectionTargetProfile | null {
  const targetAgent = normalizeTargetAgent(session.targetAgent) || connection.targetAgent
  const capabilities = Array.isArray(session.capabilities)
    ? Array.from(new Set(session.capabilities.map((item) => pickString(item)).filter(Boolean)))
    : []

  const hasMetadata = Boolean(
    session.targetId ||
      session.displayName ||
      capabilities.length ||
      session.protocolVersion ||
      session.targetAgent
  )
  if (!hasMetadata && !connection.targetProfile) return null

  return {
    targetAgent,
    ...(pickString(session.targetId, connection.targetProfile?.targetId) ? {
      targetId: pickString(session.targetId, connection.targetProfile?.targetId),
    } : {}),
    ...(pickString(session.displayName, connection.targetProfile?.displayName) ? {
      displayName: pickString(session.displayName, connection.targetProfile?.displayName),
    } : {}),
    ...(capabilities.length ? { capabilities } : connection.targetProfile?.capabilities?.length ? {
      capabilities: connection.targetProfile.capabilities,
    } : {}),
    ...(pickString(session.protocolVersion, connection.targetProfile?.protocolVersion) ? {
      protocolVersion: pickString(session.protocolVersion, connection.targetProfile?.protocolVersion),
    } : {}),
  }
}

function normalizeTargetAgent(value: unknown): ConnectionTargetAgent | null {
  if (value === "codeg" || value === "opencode" || value === "mcode-desktop") {
    return value
  }
  return null
}

function pickString(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim()
    }
  }
  return ""
}
