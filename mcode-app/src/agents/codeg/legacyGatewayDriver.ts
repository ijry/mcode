import { createGatewayConnectionDriver } from "@/agents/shared/driverTypes"

export const codegGatewayDriver = createGatewayConnectionDriver("codeg-gateway")
export const legacyGatewayDriver = createGatewayConnectionDriver("codeg-gateway-legacy")
