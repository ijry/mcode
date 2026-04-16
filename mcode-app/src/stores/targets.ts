import { defineStore } from "pinia"

import type { TargetProfile } from "@/services/gateway"

export const useTargetsStore = defineStore("targets", {
  state: () => ({
    targets: [] as TargetProfile[],
    activeTargetId: "",
  }),
  getters: {
    activeTarget(state): TargetProfile | undefined {
      return state.targets.find((item) => item.id === state.activeTargetId)
    },
  },
  actions: {
    setTargets(targets: TargetProfile[]) {
      this.targets = targets
      if (!this.activeTargetId && targets.length > 0) {
        this.activeTargetId = targets[0].id
      }
    },
    setActiveTarget(targetId: string) {
      this.activeTargetId = targetId
    },
    upsertTarget(target: TargetProfile) {
      const index = this.targets.findIndex((item) => item.id === target.id)
      if (index >= 0) {
        this.targets[index] = target
      } else {
        this.targets.push(target)
      }
    },
  },
})
