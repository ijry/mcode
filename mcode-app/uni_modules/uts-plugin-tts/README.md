# UTS TTS 语音合成插件

跨平台TTS（Text-to-Speech）语音合成插件，支持iOS、Android和鸿蒙系统。基于各平台原生TTS API开发，提供统一的调用接口，完全本地化，无需联网。

## 功能特性

- ✅ 支持iOS、Android、HarmonyOS、Web五端
- ✅ 文本转语音朗读
- ✅ 可调节语速、音调、音量
- ✅ 支持多语言
- ✅ 暂停/继续/停止控制
- ✅ 朗读进度回调
- ✅ 获取可用语音列表
- ✅ 自定义语音选择
- ✅ 完全本地化，无需联网

## 平台支持

| 平台 | 支持版本 | 底层实现 | 离线支持 |
|------|---------|---------|---------|
| iOS | iOS 9.0+ | AVSpeechSynthesizer | ✅ |
| Android | Android 5.0+ (API 21+) | TextToSpeech | ✅ |
| HarmonyOS | HarmonyOS 3.0+ (API 9+) | @ohos.ai.textToSpeech | ✅ |
| Web | 现代浏览器 | Web Speech API | ✅ |

## 安装

### 方式一：HBuilderX导入
1. 下载本插件
2. 在HBuilderX中，右键点击项目的`uni_modules`目录
3. 选择"导入插件"，选择下载的插件包

### 方式二：手动安装
将本插件复制到项目的`uni_modules/uts-plugin-tts`目录下

## 快速开始

### 基础用法

```typescript
import { speak, stop } from '@/uni_modules/uts-plugin-tts'

// 简单朗读
speak({
  text: '你好，这是一个TTS测试'
})

// 带参数的朗读
speak({
  text: 'Hello, this is a TTS test',
  rate: 0.6,        // 语速
  pitch: 1.2,       // 音调
  volume: 0.8,      // 音量
  language: 'en-US' // 语言
}, {
  onStart: () => {
    console.log('开始朗读')
  },
  onComplete: () => {
    console.log('朗读完成')
  },
  onError: (error) => {
    console.error('朗读错误:', error)
  },
  onProgress: (progress) => {
    console.log('朗读进度:', progress)
  }
})

// 停止朗读
stop()
```

### 完整示例

```vue
<template>
  <view class="container">
    <textarea 
      v-model="text" 
      placeholder="请输入要朗读的文本"
      class="textarea"
    />
    
    <view class="controls">
      <text>语速: {{ rate.toFixed(2) }}</text>
      <slider 
        :value="rate * 100" 
        @change="onRateChange"
        :min="0"
        :max="100"
      />
    </view>
    
    <view class="controls">
      <text>音调: {{ pitch.toFixed(2) }}</text>
      <slider 
        :value="pitch * 50" 
        @change="onPitchChange"
        :min="0"
        :max="100"
      />
    </view>
    
    <view class="controls">
      <text>音量: {{ volume.toFixed(2) }}</text>
      <slider 
        :value="volume * 100" 
        @change="onVolumeChange"
        :min="0"
        :max="100"
      />
    </view>
    
    <view class="buttons">
      <button @click="handleSpeak" type="primary">朗读</button>
      <button @click="handlePause">暂停</button>
      <button @click="handleResume">继续</button>
      <button @click="handleStop">停止</button>
    </view>
    
    <view class="status">
      <text>状态: {{ status }}</text>
      <text>进度: {{ (progress * 100).toFixed(0) }}%</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import { speak, stop, pause, resume, isSpeaking, getVoices, isAvailable } from '@/uni_modules/uts-plugin-tts'
import type { TTSOptions } from '@/uni_modules/uts-plugin-tts'

const text = ref('你好，这是一个语音合成测试。')
const rate = ref(0.5)
const pitch = ref(1.0)
const volume = ref(1.0)
const status = ref('就绪')
const progress = ref(0)

const handleSpeak = () => {
  const options: TTSOptions = {
    text: text.value,
    rate: rate.value,
    pitch: pitch.value,
    volume: volume.value,
    language: 'zh-CN'
  }

  speak(options, {
    onStart: () => {
      status.value = '朗读中'
      progress.value = 0
    },
    onComplete: () => {
      status.value = '完成'
      progress.value = 1
    },
    onError: (error) => {
      status.value = '错误: ' + error
    },
    onProgress: (p) => {
      progress.value = p
    }
  })
}

const handlePause = () => {
  pause()
  status.value = '已暂停'
}

const handleResume = () => {
  resume()
  status.value = '朗读中'
}

const handleStop = () => {
  stop()
  status.value = '已停止'
  progress.value = 0
}

const onRateChange = (e: any) => {
  rate.value = e.detail.value / 100
}

const onPitchChange = (e: any) => {
  pitch.value = e.detail.value / 50
}

const onVolumeChange = (e: any) => {
  volume.value = e.detail.value / 100
}
</script>

<style scoped>
.container {
  padding: 20px;
}

.textarea {
  width: 100%;
  height: 150px;
  border: 1px solid #ddd;
  padding: 10px;
  margin-bottom: 20px;
}

.controls {
  margin-bottom: 15px;
}

.buttons {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
}

.buttons button {
  flex: 1;
}

.status {
  padding: 10px;
  background: #f5f5f5;
}
</style>
```

## API文档

### speak(options, callbacks?)

朗读文本

**参数:**

- `options: TTSOptions` - 朗读选项
  - `text: string` - 要朗读的文本（必填）
  - `rate?: number` - 语速，范围0.0-1.0，默认0.5
  - `pitch?: number` - 音调，范围0.0-2.0，默认1.0
  - `volume?: number` - 音量，范围0.0-1.0，默认1.0
  - `language?: string` - 语言代码，如'zh-CN'、'en-US'，默认系统语言

- `callbacks?: TTSCallbacks` - 回调函数（可选）
  - `onStart?: () => void` - 开始朗读时触发
  - `onComplete?: () => void` - 朗读完成时触发
  - `onError?: (error: string) => void` - 发生错误时触发
  - `onProgress?: (progress: number) => void` - 朗读进度更新时触发（0.0-1.0）

**示例:**

```typescript
import { speak } from '@/uni_modules/uts-plugin-tts'

speak({
  text: '你好世界',
  rate: 0.6,
  pitch: 1.2,
  volume: 0.8,
  language: 'zh-CN'
}, {
  onStart: () => console.log('开始'),
  onComplete: () => console.log('完成'),
  onError: (err) => console.error(err),
  onProgress: (p) => console.log('进度:', p)
})
```

### stop()

停止朗读

```typescript
import { stop } from '@/uni_modules/uts-plugin-tts'

stop()
```

### pause()

暂停朗读

**注意:** Android和HarmonyOS不支持真正的暂停，会直接停止

```typescript
import { pause } from '@/uni_modules/uts-plugin-tts'

pause()
```

### resume()

继续朗读

**注意:** Android和HarmonyOS不支持继续，需要重新调用speak

```typescript
import { resume } from '@/uni_modules/uts-plugin-tts'

resume()
```

### isSpeaking()

检查是否正在朗读

**返回:** `boolean`

```typescript
import { isSpeaking } from '@/uni_modules/uts-plugin-tts'

if (isSpeaking()) {
  console.log('正在朗读')
}
```

### getVoices()

获取可用的语音列表

**返回:** `TTSVoice[]`

```typescript
import { getVoices } from '@/uni_modules/uts-plugin-tts'

const voices = getVoices()
voices.forEach(voice => {
  console.log(`${voice.name} (${voice.language}) - ${voice.quality}`)
})
```

### setVoice(identifier)

设置要使用的语音

**参数:** `identifier: string` - 语音标识符（从getVoices()获取）

```typescript
import { getVoices, setVoice } from '@/uni_modules/uts-plugin-tts'

const voices = getVoices()
if (voices.length > 0) {
  setVoice(voices[0].identifier)
}
```

### isAvailable()

检查TTS是否可用

**返回:** `boolean`

```typescript
import { isAvailable } from '@/uni_modules/uts-plugin-tts'

if (!isAvailable()) {
  console.error('TTS不可用')
}
```

## 类型定义

```typescript
export type TTSOptions = {
  text: string
  rate?: number
  pitch?: number
  volume?: number
  language?: string
}

export type TTSCallbacks = {
  onStart?: () => void
  onComplete?: () => void
  onError?: (error: string) => void
  onProgress?: (progress: number) => void
}

export type TTSVoice = {
  identifier: string
  name: string
  language: string
  quality: string
}
```

## 语言代码参考

| 语言 | 代码 |
|------|------|
| 简体中文 | zh-CN |
| 繁体中文（台湾） | zh-TW |
| 繁体中文（香港） | zh-HK |
| 英语（美国） | en-US |
| 英语（英国） | en-GB |
| 日语 | ja-JP |
| 韩语 | ko-KR |
| 法语 | fr-FR |
| 德语 | de-DE |
| 西班牙语 | es-ES |

## 平台差异说明

### iOS
- ✅ 完整支持所有功能
- ✅ 支持暂停/继续
- ✅ 支持朗读进度回调
- ✅ 丰富的语音选择
- ✅ 完全离线

### Android
- ✅ 支持基本功能
- ⚠️ 不支持真正的暂停/继续（会停止朗读）
- ✅ 支持朗读进度回调（API 23+）
- ✅ 语音选择取决于系统安装的TTS引擎
- ✅ 完全离线

### HarmonyOS
- ✅ 支持基本功能
- ⚠️ 不支持暂停/继续
- ⚠️ 进度回调支持有限
- ✅ 支持在线和离线语音
- ⚠️ 在线模式需要网络

### Web
- ✅ 支持基本功能
- ✅ 支持暂停/继续
- ✅ 支持进度回调
- ✅ 语音取决于浏览器和系统
- ✅ 完全离线

## 注意事项

1. **首次使用**: 某些Android设备可能需要下载TTS引擎数据
2. **权限**: 无需特殊权限
3. **网络**: 除HarmonyOS在线模式外，其他平台均可完全离线使用
4. **语音质量**: 不同平台和设备的语音质量可能有差异
5. **并发**: 同时只能有一个朗读任务，新任务会停止旧任务

## 常见问题

### Q: Android设备没有声音？
A: 检查设备是否安装了TTS引擎，可以在系统设置中下载Google TTS或其他TTS引擎。

### Q: 如何实现连续朗读多段文本？
A: 在`onComplete`回调中调用下一段文本的`speak`方法。

```typescript
const texts = ['第一段', '第二段', '第三段']
let index = 0

const speakNext = () => {
  if (index < texts.length) {
    speak({
      text: texts[index++]
    }, {
      onComplete: speakNext
    })
  }
}

speakNext()
```

### Q: 如何实现中英文混读？
A: 将文本分段，分别设置不同的语言：

```typescript
speak({ text: '你好', language: 'zh-CN' }, {
  onComplete: () => {
    speak({ text: 'Hello', language: 'en-US' })
  }
})
```

### Q: 暂停后无法继续？
A: Android和HarmonyOS不支持真正的暂停/继续，需要保存当前位置并重新朗读剩余文本。

## 示例代码

完整示例代码请查看 `examples` 目录：
- `basic.vue` - 基础功能示例
- `multilang.vue` - 多语言示例
- `continuous.vue` - 连续朗读示例

## 更新日志

查看 [changelog.md](./changelog.md)

## 许可证

MIT License

## 相关链接

- [uni-app官方文档](https://uniapp.dcloud.net.cn/)
- [UTS插件开发文档](https://uniapp.dcloud.net.cn/plugin/uts-plugin.html)
- [iOS AVSpeechSynthesizer文档](https://developer.apple.com/documentation/avfoundation/avspeechsynthesizer)
- [Android TextToSpeech文档](https://developer.android.com/reference/android/speech/tts/TextToSpeech)
- [HarmonyOS TTS文档](https://developer.harmonyos.com/cn/docs/documentation/doc-references-V3/js-apis-ai-texttospeech-0000001478341313-V3)
