# up-tts 示例

本目录提供 `up-tts` 的两个可直接复用示例：

- `basic.vue`
  演示基础朗读、回调、暂停/继续/停止以及状态检测。
- `multilang.vue`
  演示多语言文本、语音列表过滤和语音切换。

## 导入方式

当前仓库内示例使用：

```ts
import { speak, stop, pause, resume, isSpeaking, isAvailable } from '@/uni_modules/up-tts'
```

如果你是将插件单独拷贝到其他 uni-app 项目中，推荐同时提供一个同名桥接文件：

```ts
// src/uni_modules/up-tts.ts
export * from '@uni_modules/up-tts'
```

并在 `tsconfig.json` / `vite.config.*` 中将 `@uni_modules/up-tts` 指向 `uni_modules/up-tts`。

## 使用方法

1. 将示例页面复制到项目业务目录，例如 `src/pages/tts/`.
2. 确保项目中存在 `src/uni_modules/up-tts.ts` 这个桥接入口。
3. 在 `pages.json` 中注册页面后运行。

```json
{
  "pages": [
    {
      "path": "pages/tts/basic",
      "style": {
        "navigationBarTitleText": "TTS基础示例"
      }
    },
    {
      "path": "pages/tts/multilang",
      "style": {
        "navigationBarTitleText": "TTS多语言示例"
      }
    }
  ]
}
```
