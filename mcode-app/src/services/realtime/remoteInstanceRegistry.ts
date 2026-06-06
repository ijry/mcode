import type { RemoteInstanceDescriptor } from "./types"

const registry = new Map<string, RemoteInstanceDescriptor>()

export function registerRemoteInstanceDescriptor(descriptor: RemoteInstanceDescriptor) {
  if (!descriptor.instanceKey) return
  registry.set(descriptor.instanceKey, { ...descriptor })
}

export function getRegisteredRemoteInstanceDescriptor(instanceKey: string) {
  return registry.get(instanceKey) ?? null
}

export function clearRemoteInstanceDescriptorRegistry() {
  registry.clear()
}
