<template>
  <view class="container">
    <view class="header">
      <text class="title">TTS基础示例</text>
    </view>

    <view class="section">
      <text class="section-title">1. 简单朗读</text>
      <button @click="simpleSpeak" type="primary">朗读"你好世界"</button>
    </view>

    <view class="section">
      <text class="section-title">2. 带回调的朗读</text>
      <button @click="speakWithCallbacks" type="primary">朗读并显示状态</button>
      <text class="status">{{ status }}</text>
    </view>

    <view class="section">
      <text class="section-title">3. 自定义参数朗读</text>
      <button @click="speakWithOptions" type="primary">快速高音朗读</button>
    </view>

    <view class="section">
      <text class="section-title">4. 控制朗读</text>
      <view class="button-group">
        <button @click="startSpeak">开始</button>
        <button @click="pauseSpeak">暂停</button>
        <button @click="resumeSpeak">继续</button>
        <button @click="stopSpeak">停止</button>
      </view>
    </view>

    <view class="section">
      <text class="section-title">5. 检查状态</text>
      <button @click="checkStatus">检查TTS状态</button>
      <text class="status">{{ ttsStatus }}</text>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import TTS from '@/uni_modules/uts-plugin-tts'

const status = ref('就绪')
const ttsStatus = ref('')

// 1. 简单朗读
const simpleSpeak = () => {
  TTS.speak({
    text: '你好世界'
  })
}

// 2. 带回调的朗读
const speakWithCallbacks = () => {
  status.value = '准备中...'

  TTS.speak({
    text: '这是一个带回调的语音合成示例，你可以看到朗读的各个状态。'
  }, {
    onStart: () => {
      status.value = '正在朗读...'
    },
    onComplete: () => {
      status.value = '朗读完成'
    },
    onError: (error) => {
      status.value = '错误: ' + error
    },
    onProgress: (progress) => {
      status.value = `朗读中... ${(progress * 100).toFixed(0)}%`
    }
  })
}

// 3. 自定义参数朗读
const speakWithOptions = () => {
  TTS.speak({
    text: '这是一段快速高音的朗读',
    rate: 0.8,      // 较快语速
    pitch: 1.5,     // 较高音调
    volume: 1.0,    // 最大音量
    language: 'zh-CN'
  })
}

// 4. 控制朗读
const startSpeak = () => {
  TTS.speak({
    text: '这是一段可以控制的朗读内容。你可以暂停、继续或停止它。这段文字比较长，方便测试暂停和继续功能。'
  })
}

const pauseSpeak = () => {
  TTS.pause()
}

const resumeSpeak = () => {
  TTS.resume()
}

const stopSpeak = () => {
  TTS.stop()
}

// 5. 检查状态
const checkStatus = () => {
  const available = TTS.isAvailable()
  const speaking = TTS.isSpeaking()

  ttsStatus.value = `TTS可用: ${available ? '是' : '否'}\n正在朗读: ${speaking ? '是' : '否'}`
}
</script>

<style scoped>
.container {
  padding: 20px;
}

.header {
  margin-bottom: 30px;
  text-align: center;
}

.title {
  font-size: 24px;
  font-weight: bold;
}

.section {
  margin-bottom: 30px;
  padding: 15px;
  background: #f8f8f8;
  border-radius: 8px;
}

.section-title {
  display: block;
  font-size: 16px;
  font-weight: bold;
  margin-bottom: 10px;
}

.status {
  display: block;
  margin-top: 10px;
  padding: 10px;
  background: #fff;
  border-radius: 4px;
  color: #666;
}

.button-group {
  display: flex;
  gap: 10px;
  flex-wrap: wrap;
}

.button-group button {
  flex: 1;
  min-width: 70px;
}

button {
  margin-top: 10px;
}
</style>
