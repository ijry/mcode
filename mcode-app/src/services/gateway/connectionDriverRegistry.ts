import { codegDirectDriver } from "@/agents/codeg/driver"
import { dshDirectDriver } from "@/agents/dsh/driver"
import { codegGatewayDriver } from "@/agents/codeg/gatewayDriver"
import { desktopDirectDriver } from "@/agents/mcode-desktop/directDriver"
import { desktopGatewayDriver } from "@/agents/mcode-desktop/gatewayDriver"
import { opencodeDirectDriver } from "@/agents/opencode/driver"
import { opencodeGatewayDriver } from "@/agents/opencode/gatewayDriver"
import type { ConnectionRecordV2 } from "@/services/connectionSchema"
import type { ConnectionDriver } from "@/agents/shared/driverTypes"

export {
  codegDirectDriver,
  codegGatewayDriver,
  dshDirectDriver,
  desktopDirectDriver,
  desktopGatewayDriver,
  opencodeDirectDriver,
  opencodeGatewayDriver,
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
  if (connection.routeMode === "gateway" && connection.targetAgent === "opencode") {
    return opencodeGatewayDriver
  }
  if (connection.routeMode === "direct" && connection.targetAgent === "mcode-desktop") {
    return desktopDirectDriver
  }
  if (connection.routeMode === "gateway" && connection.targetAgent === "mcode-desktop") {
    return desktopGatewayDriver
  }
  if (connection.routeMode === "gateway" && connection.targetAgent === "codeg") {
    return codegGatewayDriver
  }
  // DSH 只有直连一种形态：桥自己就是宿主上的一个监听，隧道也只是把那个端口搬到
  // 公网。走 relay 的形态需要桥反向拨号，那是另一件事（见架构笔记）。
  if (connection.targetAgent === "dsh") {
    return dshDirectDriver
  }
  return codegDirectDriver
}
