import { readStoredConnections } from "@/services/connectionContext"

export function getConversationOverviewConnections() {
  return readStoredConnections()
}

export function hasConversationOverviewConnections() {
  return getConversationOverviewConnections().length > 0
}
