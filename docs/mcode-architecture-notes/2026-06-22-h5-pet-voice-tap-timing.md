# H5 宠物语音点击时机修复

## 背景

H5 宠物语音使用浏览器 Web Speech API。浏览器通常要求语音播放由用户手势直接触发。宠物悬浮球此前为了区分单击和双击，会在单击后等待 `PET_SINGLE_TAP_DELAY_MS` 再触发互动发声；这个延迟会让 H5 发声脱离原始点击调用栈，导致气泡正常显示但没有声音。

Android/iOS App 端使用原生 TTS，不受浏览器用户手势限制，仍需要保留单击延迟来识别双击强互动。

## 行为变更

- H5：单击 `touchend` 后立即触发宠物互动、气泡、点击音效和 TTS，不再等待双击窗口。
- 非 H5：保持原有 `PET_SINGLE_TAP_DELAY_MS` 延迟，第二次点击在 `PET_DOUBLE_TAP_WINDOW_MS` 内仍触发双击强互动。
- 语音开关、气泡开关、宠物状态和经验逻辑不变。

## 数据流

1. `PetFloat.vue` 收到悬浮宠物 `touchend`。
2. 通过 uni-app 条件编译判断是否为 H5。
3. H5 调用 `triggerSingleInteraction()`，同步进入 `petInteract()` 和 `speakPetText()`。
4. 非 H5 继续设置单击定时器，并在双击窗口内允许 `triggerDoubleInteraction()` 取消单击定时器。

## 兼容与原生复刻

Native iOS/Android 客户端应保留双击识别延迟，因为原生 TTS 可以在异步触发后正常播放。Web/H5 客户端应优先保证语音播放在用户手势调用链内完成；如需恢复 H5 双击，可采用不同手势入口，不应重新引入单击发声延迟。
