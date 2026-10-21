/**
 * 「请求打开选宠弹窗」的信道。
 *
 * 宠物改成默认关闭之后，选宠弹窗**不再**在启动时自动弹出（那会在用户完全没
 * 表达意愿的情况下挡住首屏）。入口收敛到「我的 → 宠物管理」：那边发现宠物还没
 * 初始化时，用这里发一个信号，`PetFloat.vue` 收到后自己把弹窗打开。
 *
 * 之所以不用 store 里的字段：Pinia 的 persist 会把状态整份落盘，一个纯粹的
 * 「请求」标记被持久化之后，下次冷启还会把弹窗再弹一次。模块级监听器天然是
 * 进程内的、用完即弃。
 */
type PetSetupListener = () => void

const listeners = new Set<PetSetupListener>()

export function requestPetSetup() {
  listeners.forEach((listener) => {
    try {
      listener()
    } catch (error) {
      console.warn("pet setup listener failed", error)
    }
  })
}

export function onPetSetupRequest(listener: PetSetupListener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
