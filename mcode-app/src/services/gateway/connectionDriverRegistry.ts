import { codegDirectDriver } from "@/agents/codeg/driver"
import { legacyGatewayDriver } from "@/agents/codeg/legacyGatewayDriver"
import { desktopDirectDriver } from "@/agents/mcode-desktop/directDriver"
import { desktopGatewayDriver } from "@/agents/mcode-desktop/gatewayDriver"
import { opencodeDirectDriver } from "@/agents/opencode/driver"
import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import type { ConnectionDriver } from "@/agents/shared/driverTypes"

export {
  codegDirectDriver,
  desktopDirectDriver,
  desktopGatewayDriver,
  legacyGatewayDriver,
  opencodeDirectDriver,
}
export type {
  ConnectionDriver,
  ConnectionDriverId,
  PairResultMetadata,
} from "@/agents/shared/driverTypes"

export function resolveConnectionDriver(connection: ConnectionRecordV2): ConnectionDriver {
  if (connection.routeMode === "direct" && connection.targetAgent === "opencode") {
    return opencodeDirectDriver
  }
  if (connection.routeMode === "direct" && connection.targetAgent === "mcode-desktop") {
    return desktopDirectDriver
  }
  if (connection.routeMode === "gateway" && connection.targetAgent === "mcode-desktop") {
    return desktopGatewayDriver
  }
  if (connection.routeMode === "gateway") {
    return legacyGatewayDriver
  }
  return codegDirectDriver
}
