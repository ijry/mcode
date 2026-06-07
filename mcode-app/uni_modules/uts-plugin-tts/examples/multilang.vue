<template>
  <view class="container">
    <view class="header">
      <text class="title">多语言TTS示例</text>
    </view>

    <view class="section">
      <text class="section-title">选择语言</text>
      <radio-group @change="onLanguageChange">
        <label v-for="lang in languages" :key="lang.code">
          <radio :value="lang.code" :checked="selectedLanguage === lang.code" />
          {{ lang.name }}
        </label>
      </radio-group>
    </view>

    <view class="section">
      <text class="section-title">示例文本</text>
      <textarea
        v-model="currentText"
        class="textarea"
        :placeholder="'输入' + getCurrentLanguageName() + '文本'"
      />
    </view>

    <view class="section">
      <button @click="speak" type="primary">朗读</button>
      <button @click="stop">停止</button>
    </view>

    <view class="section">
      <text class="section-title">快速测试</text>
      <view class="quick-buttons">
        <button @click="speakChinese">中文示例</button>
        <button @click="speakEnglish">英文示例</button>
        <button @click="speakJapanese">日文示例</button>
        <button @click="speakKorean">韩文示例</button>
        <button @click="speakFrench">法文示例</button>
        <button @click="speakGerman">德文示例</button>
      </view>
    </view>

    <view class="section">
      <text class="section-title">状态</text>
      <text class="status">{{ status }}</text>
    </view>

    <view class="section">
      <text class="section-title">可用语音</text>
      <scroll-view class="voices-list" scroll-y>
        <view
          v-for="voice in filteredVoices"
          :key="voice.identifier"
          class="voice-item"
          @click="selectVoice(voice)"
        >
          <text class="voice-name">{{ voice.name }}</text>
          <text class="voice-lang">{{ voice.language }}</text>
          <text class="voice-quality">{{ voice.quality }}</text>
        </view>
      </scroll-view>
    </view>
  </view>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import TTS from '@/uni_modules/uts-plugin-tts'

const languages = [
  { code: 'zh-CN', name: '简体中文', sample: '你好，这是一个中文语音合成测试。' },
  { code: 'zh-TW', name: '繁體中文', sample: '你好，這是一個中文語音合成測試。' },
  { code: 'en-US', name: 'English (US)', sample: 'Hello, this is an English text-to-speech test.' },
  { code: 'en-GB', name: 'English (UK)', sample: 'Hello, this is a British English text-to-speech test.' },
  { code: 'ja-JP', name: '日本語', sample: 'こんにちは、これは日本語の音声合成テストです。' },
  { code: 'ko-KR', name: '한국어', sample: '안녕하세요, 이것은 한국어 음성 합성 테스트입니다.' },
  { code: 'fr-FR', name: 'Français', sample: 'Bonjour, ceci est un test de synthèse vocale en français.' },
  { code: 'de-DE', name: 'Deutsch', sample: 'Hallo, dies ist ein deutscher Text-zu-Sprache-Test.' },
  { code: 'es-ES', name: 'Español', sample: 'Hola, esta es una prueba de síntesis de voz en español.' },
  { code: 'it-IT', name: 'Italiano', sample: 'Ciao, questo è un test di sintesi vocale in italiano.' }
]

const selectedLanguage = ref('zh-CN')
const currentText = ref('你好，这是一个中文语音合成测试。')
const status = ref('就绪')
const allVoices = ref([])

onMounted(() => {
  // 获取所有可用语音
  allVoices.value = TTS.getVoices()
})

const filteredVoices = computed(() => {
  // 过滤当前语言的语音
  return allVoices.value.filter(voice =>
    voice.language.startsWith(selectedLanguage.value.split('-')[0])
  )
})

const getCurrentLanguageName = () => {
  const lang = languages.find(l => l.code === selectedLanguage.value)
  return lang ? lang.name : ''
}

const onLanguageChange = (e) => {
  selectedLanguage.value = e.detail.value
  const lang = languages.find(l => l.code === e.detail.value)
  if (lang) {
    currentText.value = lang.sample
  }
}

const speak = () => {
  TTS.speak({
    text: currentText.value,
    language: selectedLanguage.value,
    rate: 0.5,
    pitch: 1.0,
    volume: 1.0
  }, {
    onStart: () => {
      status.value = `正在朗读 (${getCurrentLanguageName()})...`
    },
    onComplete: () => {
      status.value = '朗读完成'
    },
    onError: (error) => {
      status.value = '错误: ' + error
    }
  })
}

const stop = () => {
  TTS.stop()
  status.value = '已停止'
}

const speakChinese = () => {
  selectedLanguage.value = 'zh-CN'
  currentText.value = '你好，这是一个中文语音合成测试。'
  speak()
}

const speakEnglish = () => {
  selectedLanguage.value = 'en-US'
  currentText.value = 'Hello, this is an English text-to-speech test.'
  speak()
}

const speakJapanese = () => {
  selectedLanguage.value = 'ja-JP'
  currentText.value = 'こんにちは、これは日本語の音声合成テストです。'
  speak()
}

const speakKorean = () => {
  selectedLanguage.value = 'ko-KR'
  currentText.value = '안녕하세요, 이것은 한국어 음성 합성 테스트입니다.'
  speak()
}

const speakFrench = () => {
  selectedLanguage.value = 'fr-FR'
  currentText.value = 'Bonjour, ceci est un test de synthèse vocale en français.'
  speak()
}

const speakGerman = () => {
  selectedLanguage.value = 'de-DE'
  currentText.value = 'Hallo, dies ist ein deutscher Text-zu-Sprache-Test.'
  speak()
}

const selectVoice = (voice) => {
  TTS.setVoice(voice.identifier)
  uni.showToast({
    title: '已选择: ' + voice.name,
    icon: 'none'
  })
}
</script>

<style scoped>
.container {
  padding: 20px;
}

.header {
  margin-bottom: 20px;
  text-align: center;
}

.title {
  font-size: 24px;
  font-weight: bold;
}

.section {
  margin-bottom: 20px;
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

.textarea {
  width: 100%;
  height: 100px;
  padding: 10px;
  border: 1px solid #ddd;
  border-radius: 4px;
  background: #fff;
}

label {
  display: block;
  margin: 8px 0;
  padding: 8px;
  background: #fff;
  border-radius: 4px;
}

.quick-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.status {
  display: block;
  padding: 10px;
  background: #fff;
  border-radius: 4px;
  color: #666;
}

.voices-list {
  max-height: 300px;
  background: #fff;
  border-radius: 4px;
}

.voice-item {
  padding: 12px;
  border-bottom: 1px solid #eee;
}

.voice-item:active {
  background: #f0f0f0;
}

.voice-name {
  display: block;
  font-weight: bold;
  margin-bottom: 4px;
}

.voice-lang {
  display: inline-block;
  margin-right: 10px;
  color: #666;
  font-size: 14px;
}

.voice-quality {
  display: inline-block;
  padding: 2px 8px;
  background: #e0e0e0;
  border-radius: 3px;
  font-size: 12px;
  color: #666;
}

button {
  margin-top: 10px;
}
</style>
