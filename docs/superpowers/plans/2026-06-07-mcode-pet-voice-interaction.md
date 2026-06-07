# MCode Pet Voice Interaction Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Upgrade the floating pet so single tap triggers voiced interaction, double tap triggers stronger feedback, the pet can read richer copy through `up-tts`, and pet management moves to the profile page.

**Architecture:** Keep the existing pet store, config, and engine, but add two focused services around speech and tap audio. Move UI-specific tap timing into a small pure helper so gesture timing stays testable, then let `PetFloat.vue` coordinate tap resolution, transient animation state, and action-sheet toggles while `PetPanel.vue` and the profile page own persistent management controls.

**Tech Stack:** Uni-app, Vue 3 SFC, TypeScript, Pinia, uview-plus, Jest 27 with `babel-jest`, vendored `up-tts` UTS plugin

---

## File Structure

**Create**

- `mcode-app/jest.config.cjs`
  Minimal Jest runner for pure TypeScript pet services and stores.
- `mcode-app/tests/setup/petTestSetup.cjs`
  Shared `uni` mocks, storage reset helpers, and audio-context test doubles.
- `mcode-app/tests/mocks/uts-plugin-tts.cjs`
  Deterministic fake `up-tts` module used by Jest.
- `mcode-app/tests/pet/petHarness.spec.ts`
  Smoke test proving alias resolution and Jest setup work.
- `mcode-app/tests/pet/petStore.spec.ts`
  Tests for `voiceEnabled` state and setter behavior.
- `mcode-app/tests/pet/petConfig.spec.ts`
  Tests for richer bubble copy and concrete message payload selection.
- `mcode-app/tests/pet/petVoice.spec.ts`
  Tests for `up-tts` speech wrapping and voice gating.
- `mcode-app/tests/pet/petAudio.spec.ts`
  Tests for click-sound playback wrapping.
- `mcode-app/tests/pet/petEngine.spec.ts`
  Tests for bubble/TTS synchronization during pet interactions.
- `mcode-app/tests/pet/petTapGesture.spec.ts`
  Tests for single-tap vs double-tap timing rules.
- `mcode-app/src/types/uts-plugin-tts.d.ts`
  Ambient module declaration for the vendored UTS plugin import path.
- `mcode-app/src/services/petVoice.ts`
  Thin wrapper over `up-tts` with availability guards, stop-before-speak behavior, and store-driven opt-in.
- `mcode-app/src/services/petAudio.ts`
  Single-purpose tap-sound playback wrapper over `uni.createInnerAudioContext`.
- `mcode-app/src/services/petTapGesture.ts`
  Pure tap-window constants and helper used by the floating pet.
- `mcode-app/uni_modules/uts-plugin-tts/**`
  Copied plugin contents from `D:\Repos\xyito\lingyun\up-tts`.
- `mcode-app/src/static/pets/pet-tap.wav`
  Short generated tap sound used by the floating pet.

**Modify**

- `mcode-app/package.json`
  Add a dedicated `test:unit` script.
- `mcode-app/src/types/pet.d.ts`
  Add persistent `voiceEnabled` state.
- `mcode-app/src/stores/pet.ts`
  Initialize and mutate the voice toggle.
- `mcode-app/src/services/petConfig.ts`
  Expand the copy library and return full bubble payloads.
- `mcode-app/src/services/petEngine.ts`
  Speak the same text shown in the bubble and expose a stronger double-tap interaction.
- `mcode-app/src/components/pet/PetSprite.vue`
  Add transient tap animation classes layered over base emotion state.
- `mcode-app/src/components/pet/PetFloat.vue`
  Replace “single tap opens panel” with “single tap interacts”, keep double tap, keep long-press menu, and add voice toggle.
- `mcode-app/src/components/pet/PetPanel.vue`
  Expose persistent voice and bubble controls in the management panel.
- `mcode-app/src/pages/profile/index.vue`
  Add the `宠物管理` entry and mount `PetPanel` there.

---

### Task 1: Add The Pet Test Harness And Vendor The `up-tts` Plugin

**Files:**
- Modify: `mcode-app/package.json`
- Create: `mcode-app/jest.config.cjs`
- Create: `mcode-app/tests/setup/petTestSetup.cjs`
- Create: `mcode-app/tests/mocks/uts-plugin-tts.cjs`
- Create: `mcode-app/tests/pet/petHarness.spec.ts`
- Create: `mcode-app/src/types/uts-plugin-tts.d.ts`
- Create: `mcode-app/uni_modules/uts-plugin-tts/**`

- [ ] **Step 1: Write the failing harness test**

Create `mcode-app/tests/pet/petHarness.spec.ts`:

```ts
import { pickBubbleText } from '@/services/petConfig'

describe('pet unit-test harness', () => {
  it('resolves src aliases inside jest', () => {
    expect(typeof pickBubbleText('pet_interact')).toBe('string')
  })
})
```

- [ ] **Step 2: Run the harness test and confirm it fails before the runner exists**

Run:

```bash
pnpm --dir mcode-app exec jest --config jest.config.cjs --runInBand tests/pet/petHarness.spec.ts
```

Expected:

```text
FAIL
Error: Can't find a root directory while resolving a config file path.
Provided path to resolve: jest.config.cjs
```

- [ ] **Step 3: Add the Jest runner, shared mocks, plugin declaration, and vendored `up-tts` copy**

Update `mcode-app/package.json` by adding this script:

```json
"test:unit": "jest --config jest.config.cjs --runInBand"
```

Create `mcode-app/jest.config.cjs`:

```js
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  clearMocks: true,
  transform: {
    '^.+\\.(t|j)sx?$': [
      'babel-jest',
      {
        presets: [
          ['@babel/preset-env', { targets: { node: '18' } }],
          ['@babel/preset-typescript', { allowDeclareFields: true }],
        ],
      },
    ],
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@/\\.\\./uni_modules/uts-plugin-tts$': '<rootDir>/tests/mocks/uts-plugin-tts.cjs',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/petTestSetup.cjs'],
}
```

Create `mcode-app/tests/setup/petTestSetup.cjs`:

```js
const storage = new Map()

global.__PET_TEST_STORAGE__ = storage

global.uni = {
  getStorageSync: jest.fn((key) => storage.get(key) ?? ''),
  setStorageSync: jest.fn((key, value) => storage.set(key, value)),
  removeStorageSync: jest.fn((key) => storage.delete(key)),
  clearStorageSync: jest.fn(() => storage.clear()),
  getWindowInfo: jest.fn(() => ({ windowWidth: 390, windowHeight: 844 })),
  request: jest.fn(),
  showToast: jest.fn(),
  createInnerAudioContext: jest.fn(() => ({
    src: '',
    autoplay: false,
    obeyMuteSwitch: false,
    play: jest.fn(),
    stop: jest.fn(),
    destroy: jest.fn(),
    onError: jest.fn(),
  })),
}

beforeEach(() => {
  storage.clear()
  global.uni.getStorageSync.mockClear()
  global.uni.setStorageSync.mockClear()
  global.uni.removeStorageSync.mockClear()
  global.uni.clearStorageSync.mockClear()
  global.uni.request.mockClear()
  global.uni.showToast.mockClear()
  global.uni.createInnerAudioContext.mockClear()
})
```

Create `mcode-app/tests/mocks/uts-plugin-tts.cjs`:

```js
let available = true
let speaking = false

const api = {
  speak: jest.fn((options, callbacks) => {
    speaking = true
    callbacks?.onStart?.()
    callbacks?.onComplete?.()
    speaking = false
  }),
  stop: jest.fn(() => {
    speaking = false
  }),
  pause: jest.fn(),
  resume: jest.fn(),
  isSpeaking: jest.fn(() => speaking),
  getVoices: jest.fn(() => []),
  setVoice: jest.fn(),
  isAvailable: jest.fn(() => available),
  __setAvailable(value) {
    available = value
  },
  __setSpeaking(value) {
    speaking = value
  },
  __reset() {
    available = true
    speaking = false
    api.speak.mockClear()
    api.stop.mockClear()
    api.pause.mockClear()
    api.resume.mockClear()
    api.isSpeaking.mockClear()
    api.getVoices.mockClear()
    api.setVoice.mockClear()
    api.isAvailable.mockClear()
  },
}

module.exports = api
```

Create `mcode-app/src/types/uts-plugin-tts.d.ts`:

```ts
declare module '*uni_modules/uts-plugin-tts' {
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

  export function speak(options: TTSOptions, callbacks?: TTSCallbacks): void
  export function stop(): void
  export function pause(): void
  export function resume(): void
  export function isSpeaking(): boolean
  export function getVoices(): Array<{
    identifier: string
    name: string
    language: string
    quality: string
  }>
  export function setVoice(identifier: string): void
  export function isAvailable(): boolean
}
```

Copy the plugin into the app:

```powershell
New-Item -ItemType Directory -Force -Path 'mcode-app\uni_modules\uts-plugin-tts' | Out-Null
Copy-Item -Path 'D:\Repos\xyito\lingyun\up-tts\*' -Destination 'mcode-app\uni_modules\uts-plugin-tts' -Recurse -Force
```

- [ ] **Step 4: Run the harness test again and confirm the runner is usable**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petHarness.spec.ts
```

Expected:

```text
PASS tests/pet/petHarness.spec.ts
1 passed, 1 total
```

- [ ] **Step 5: Commit the harness and vendored plugin**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- \
  mcode-app/package.json \
  mcode-app/jest.config.cjs \
  mcode-app/tests/setup/petTestSetup.cjs \
  mcode-app/tests/mocks/uts-plugin-tts.cjs \
  mcode-app/tests/pet/petHarness.spec.ts \
  mcode-app/src/types/uts-plugin-tts.d.ts \
  mcode-app/uni_modules/uts-plugin-tts
git -C D:/Repos/xyito/lingyun/mcode commit -m "test(pet): add unit harness and vendor tts plugin"
```

Expected:

```text
[branch-name abc1234] test(pet): add unit harness and vendor tts plugin
```

---

### Task 2: Add Persistent Voice State And Richer Bubble Copy

**Files:**
- Modify: `mcode-app/src/types/pet.d.ts`
- Modify: `mcode-app/src/stores/pet.ts`
- Modify: `mcode-app/src/services/petConfig.ts`
- Create: `mcode-app/tests/pet/petStore.spec.ts`
- Create: `mcode-app/tests/pet/petConfig.spec.ts`

- [ ] **Step 1: Write the failing store and copy tests**

Create `mcode-app/tests/pet/petStore.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { usePetStore } from '@/stores/pet'

describe('pet store voice settings', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  it('starts with voice enabled', () => {
    const store = usePetStore()
    expect(store.voiceEnabled).toBe(true)
  })

  it('can update the voice toggle explicitly', () => {
    const store = usePetStore()
    store.setVoiceEnabled(false)
    expect(store.voiceEnabled).toBe(false)
    store.setVoiceEnabled(true)
    expect(store.voiceEnabled).toBe(true)
  })
})
```

Create `mcode-app/tests/pet/petConfig.spec.ts`:

```ts
import { getBubbleTemplate, pickBubbleMessage } from '@/services/petConfig'

describe('pet bubble copy', () => {
  it('returns a full message payload for evening greetings', () => {
    const message = pickBubbleMessage('evening')
    const template = getBubbleTemplate('evening')

    expect(message).not.toBeNull()
    expect(template).not.toBeNull()
    expect(template?.texts).toContain(message?.text)
    expect(message?.duration).toBe(template?.duration)
  })

  it('keeps excited interaction copy separate from the normal tap copy', () => {
    const normal = getBubbleTemplate('pet_interact')
    const excited = getBubbleTemplate('pet_interact_excited')

    expect(normal?.texts).not.toEqual(excited?.texts)
  })
})
```

- [ ] **Step 2: Run the new tests and confirm the missing API fails**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petStore.spec.ts tests/pet/petConfig.spec.ts
```

Expected:

```text
FAIL tests/pet/petStore.spec.ts
TypeError: store.setVoiceEnabled is not a function

FAIL tests/pet/petConfig.spec.ts
TypeError: (0 , _petConfig.pickBubbleMessage) is not a function
```

- [ ] **Step 3: Add the voice flag, setter, richer templates, and full-message selector**

Update `mcode-app/src/types/pet.d.ts` by inserting the new field into `PetState`:

```ts
export interface PetState {
  initialized: boolean
  species: SpeciesId
  name: string
  level: number
  exp: number
  totalExp: number
  skinId: string
  accessories: Record<AccessorySlot, string | null>
  unlockedSkins: string[]
  unlockedAccessories: string[]
  unlockedAchievements: string[]
  dailyExp: DailyExp
  signIn: SignInState
  createdAt: string
  position: PetPosition
  bubbleMuted: boolean
  voiceEnabled: boolean
  hidden: boolean
  stats: {
    totalConversations: number
    totalTurns: number
    totalToolCalls: number
    totalTokens: number
    totalTodosCompleted: number
    agentConversations: Record<string, number>
  }
}
```

Update `mcode-app/src/stores/pet.ts`:

```ts
function defaultState(): PetState {
  return {
    initialized: false,
    species: 'fox',
    name: '',
    level: 1,
    exp: 0,
    totalExp: 0,
    skinId: 'default',
    accessories: { head: null, body: null, effect: null },
    unlockedSkins: ['default'],
    unlockedAccessories: [],
    unlockedAchievements: [],
    dailyExp: { user: 0, agent: 0, task: 0, date: todayStr() },
    signIn: { lastDate: '', streak: 0 },
    createdAt: '',
    position: { x: -1, y: -1 },
    bubbleMuted: false,
    voiceEnabled: true,
    hidden: false,
    stats: {
      totalConversations: 0,
      totalTurns: 0,
      totalToolCalls: 0,
      totalTokens: 0,
      totalTodosCompleted: 0,
      agentConversations: {},
    },
  }
}

export const usePetStore = defineStore('pet', {
  state: (): PetState => defaultState(),
  actions: {
    setVoiceEnabled(enabled: boolean) {
      this.voiceEnabled = enabled
    },
    toggleMute() {
      this.bubbleMuted = !this.bubbleMuted
    },
    toggleHidden() {
      this.hidden = !this.hidden
    },
  },
  persist: {
    storage: {
      getItem: (key: string) => uni.getStorageSync(key),
      setItem: (key: string, value: string) => uni.setStorageSync(key, value),
    },
  },
})
```

Update `mcode-app/src/services/petConfig.ts`:

```ts
import type {
  SpeciesDef,
  SkinDef,
  AccessoryDef,
  AchievementDef,
  SpeciesId,
  BubbleMessage,
} from '@/types/pet'

export const BUBBLE_TEMPLATES: BubbleTemplate[] = [
  { trigger: 'turn_complete', texts: ['这次做得不错。', '收工一个，继续下一个。', '这一轮很稳。'], duration: 3000 },
  { trigger: 'waiting_permission_long', texts: ['主人快来看看。', '这里还等你点一下。', '我先帮你盯着，快来确认。'], duration: 5000, flash: true },
  { trigger: 'error', texts: ['呜，刚刚出错了。', '这里有点不对劲。', '先别急，我们再看一眼。'], duration: 4000 },
  { trigger: 'morning', texts: ['早上好，今天也把事情做漂亮点。', '该开工啦，我已经醒了。', '新的一天，先把第一件事做完。'], duration: 3200 },
  { trigger: 'afternoon', texts: ['下午别走神，先把这一段收尾。', '再坚持一下，快做完了。', '我陪你把下午这段顶过去。'], duration: 3200 },
  { trigger: 'evening', texts: ['已经很晚了，该休息啦。', '今天先到这里吧，别太拼。', '收一收尾，早点睡。'], duration: 3400 },
  { trigger: 'level_up', texts: ['我变强了。', '升级啦，这波不亏。', '又长本事了。'], duration: 4000 },
  { trigger: 'pet_interact', texts: ['别调皮啦，快工作吧。', '先专心一会儿，我陪你。', '摸一下就行啦，继续写代码。', '我在这儿，别分心。'], duration: 2400 },
  { trigger: 'pet_interact_excited', texts: ['好嘛好嘛，我陪你冲一把。', '今天状态不错，继续推。', '这下精神了，开干。'], duration: 2600 },
]

export function pickBubbleText(trigger: string): string | null {
  return pickBubbleMessage(trigger)?.text ?? null
}

export function pickBubbleMessage(trigger: string): BubbleMessage | null {
  const template = getBubbleTemplate(trigger)
  if (!template) return null

  const text = template.texts[Math.floor(Math.random() * template.texts.length)]
  return {
    text,
    duration: template.duration,
    flash: template.flash,
  }
}

export function getBubbleTemplate(trigger: string): BubbleTemplate | null {
  return BUBBLE_TEMPLATES.find(t => t.trigger === trigger) ?? null
}
```

- [ ] **Step 4: Run the store and copy tests again**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petStore.spec.ts tests/pet/petConfig.spec.ts
```

Expected:

```text
PASS tests/pet/petStore.spec.ts
PASS tests/pet/petConfig.spec.ts
4 passed, 4 total
```

- [ ] **Step 5: Commit the state and copy changes**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- \
  mcode-app/src/types/pet.d.ts \
  mcode-app/src/stores/pet.ts \
  mcode-app/src/services/petConfig.ts \
  mcode-app/tests/pet/petStore.spec.ts \
  mcode-app/tests/pet/petConfig.spec.ts
git -C D:/Repos/xyito/lingyun/mcode commit -m "feat(pet): add voice setting and richer copy"
```

Expected:

```text
[branch-name def5678] feat(pet): add voice setting and richer copy
```

---

### Task 3: Add The Pet Voice Service, Tap Audio Wrapper, And Tap Sound Asset

**Files:**
- Create: `mcode-app/src/services/petVoice.ts`
- Create: `mcode-app/src/services/petAudio.ts`
- Create: `mcode-app/src/static/pets/pet-tap.wav`
- Create: `mcode-app/tests/pet/petVoice.spec.ts`
- Create: `mcode-app/tests/pet/petAudio.spec.ts`

- [ ] **Step 1: Write the failing speech and tap-audio tests**

Create `mcode-app/tests/pet/petVoice.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'
import { usePetStore } from '@/stores/pet'
import * as ttsModule from '@/../uni_modules/uts-plugin-tts'
import { isPetSpeechAvailable, speakPetText, stopPetSpeech } from '@/services/petVoice'

type TtsMock = typeof ttsModule & {
  __reset: () => void
  __setAvailable: (value: boolean) => void
  __setSpeaking: (value: boolean) => void
}

const tts = ttsModule as TtsMock

describe('pet voice service', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    tts.__reset()
  })

  it('skips speech when voice is disabled', () => {
    const store = usePetStore()
    store.setVoiceEnabled(false)

    expect(speakPetText('别调皮啦，快工作吧。')).toBe(false)
    expect(tts.speak).not.toHaveBeenCalled()
  })

  it('stops the current utterance before speaking a new line', () => {
    tts.__setSpeaking(true)

    expect(speakPetText('这次做得不错。')).toBe(true)
    expect(tts.stop).toHaveBeenCalledTimes(1)
    expect(tts.speak).toHaveBeenCalledWith(
      expect.objectContaining({ text: '这次做得不错。', language: 'zh-CN' }),
      expect.objectContaining({ onError: expect.any(Function) }),
    )
  })

  it('reports availability from the wrapped plugin', () => {
    tts.__setAvailable(false)
    expect(isPetSpeechAvailable()).toBe(false)
  })

  it('can stop pet speech without throwing', () => {
    stopPetSpeech()
    expect(tts.stop).toHaveBeenCalledTimes(1)
  })
})
```

Create `mcode-app/tests/pet/petAudio.spec.ts`:

```ts
import { playPetTapSound, resetPetAudioForTests } from '@/services/petAudio'

describe('pet tap audio', () => {
  afterEach(() => {
    resetPetAudioForTests()
  })

  it('creates one audio context and plays the packaged tap sound', () => {
    expect(playPetTapSound()).toBe(true)

    const createInnerAudioContext = (global as any).uni.createInnerAudioContext as jest.Mock
    expect(createInnerAudioContext).toHaveBeenCalledTimes(1)

    const ctx = createInnerAudioContext.mock.results[0].value
    expect(ctx.src).toBe('/static/pets/pet-tap.wav')
    expect(ctx.play).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: Run the new tests and confirm the missing services fail**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petVoice.spec.ts tests/pet/petAudio.spec.ts
```

Expected:

```text
FAIL tests/pet/petVoice.spec.ts
Cannot find module '@/services/petVoice'

FAIL tests/pet/petAudio.spec.ts
Cannot find module '@/services/petAudio'
```

- [ ] **Step 3: Generate the tap sound asset and add the two services**

Generate `mcode-app/src/static/pets/pet-tap.wav`:

```powershell
@'
const fs = require("fs");
const path = require("path");

const sampleRate = 16000;
const durationMs = 80;
const sampleCount = Math.floor(sampleRate * durationMs / 1000);
const dataSize = sampleCount * 2;
const buffer = Buffer.alloc(44 + dataSize);

let offset = 0;
const writeString = (value) => { buffer.write(value, offset); offset += value.length; };
const writeUInt32 = (value) => { buffer.writeUInt32LE(value, offset); offset += 4; };
const writeUInt16 = (value) => { buffer.writeUInt16LE(value, offset); offset += 2; };

writeString("RIFF");
writeUInt32(36 + dataSize);
writeString("WAVE");
writeString("fmt ");
writeUInt32(16);
writeUInt16(1);
writeUInt16(1);
writeUInt32(sampleRate);
writeUInt32(sampleRate * 2);
writeUInt16(2);
writeUInt16(16);
writeString("data");
writeUInt32(dataSize);

for (let i = 0; i < sampleCount; i++) {
  const t = i / sampleRate;
  const envelope = 1 - i / sampleCount;
  const sample = Math.round(Math.sin(2 * Math.PI * 880 * t) * 0.18 * envelope * 32767);
  buffer.writeInt16LE(sample, 44 + i * 2);
}

const outFile = path.join("mcode-app", "src", "static", "pets", "pet-tap.wav");
fs.writeFileSync(outFile, buffer);
console.log(outFile);
'@ | node
```

Create `mcode-app/src/services/petVoice.ts`:

```ts
import { isAvailable, isSpeaking, speak, stop } from '@/../uni_modules/uts-plugin-tts'
import { usePetStore } from '@/stores/pet'

const DEFAULT_OPTIONS = {
  rate: 0.52,
  pitch: 1.08,
  volume: 0.95,
  language: 'zh-CN',
}

function safeIsAvailable(): boolean {
  try {
    return typeof isAvailable === 'function' && isAvailable()
  } catch (error) {
    console.warn('[petVoice] availability check failed', error)
    return false
  }
}

function safeIsSpeaking(): boolean {
  try {
    return typeof isSpeaking === 'function' && isSpeaking()
  } catch (error) {
    console.warn('[petVoice] speaking check failed', error)
    return false
  }
}

export function isPetSpeechAvailable(): boolean {
  return safeIsAvailable()
}

export function stopPetSpeech(): void {
  try {
    stop()
  } catch (error) {
    console.warn('[petVoice] stop failed', error)
  }
}

export function speakPetText(text: string): boolean {
  const petStore = usePetStore()
  const trimmed = text.trim()

  if (!trimmed || !petStore.voiceEnabled || !safeIsAvailable()) {
    return false
  }

  try {
    if (safeIsSpeaking()) {
      stop()
    }

    speak(
      {
        text: trimmed,
        ...DEFAULT_OPTIONS,
      },
      {
        onError: (error) => {
          console.warn('[petVoice] speak failed', error)
        },
      },
    )
    return true
  } catch (error) {
    console.warn('[petVoice] unexpected speak error', error)
    return false
  }
}
```

Create `mcode-app/src/services/petAudio.ts`:

```ts
const PET_TAP_AUDIO_SRC = '/static/pets/pet-tap.wav'

let tapAudioContext: UniApp.InnerAudioContext | null = null

function getTapAudioContext(): UniApp.InnerAudioContext | null {
  if (tapAudioContext) {
    return tapAudioContext
  }

  if (typeof uni === 'undefined' || typeof uni.createInnerAudioContext !== 'function') {
    return null
  }

  const context = uni.createInnerAudioContext()
  context.autoplay = false
  context.obeyMuteSwitch = false
  context.src = PET_TAP_AUDIO_SRC
  context.onError((error) => {
    console.warn('[petAudio] tap sound failed', error)
  })

  tapAudioContext = context
  return tapAudioContext
}

export function playPetTapSound(): boolean {
  const context = getTapAudioContext()
  if (!context) return false

  try {
    context.stop()
    context.src = PET_TAP_AUDIO_SRC
    context.play()
    return true
  } catch (error) {
    console.warn('[petAudio] play failed', error)
    return false
  }
}

export function resetPetAudioForTests(): void {
  if (!tapAudioContext) return

  tapAudioContext.destroy?.()
  tapAudioContext = null
}
```

- [ ] **Step 4: Run the speech and audio tests again**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petVoice.spec.ts tests/pet/petAudio.spec.ts
```

Expected:

```text
PASS tests/pet/petVoice.spec.ts
PASS tests/pet/petAudio.spec.ts
5 passed, 5 total
```

- [ ] **Step 5: Commit the voice and tap-audio services**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- \
  mcode-app/src/services/petVoice.ts \
  mcode-app/src/services/petAudio.ts \
  mcode-app/src/static/pets/pet-tap.wav \
  mcode-app/tests/pet/petVoice.spec.ts \
  mcode-app/tests/pet/petAudio.spec.ts
git -C D:/Repos/xyito/lingyun/mcode commit -m "feat(pet): add tts and tap audio services"
```

Expected:

```text
[branch-name ghi9012] feat(pet): add tts and tap audio services
```

---

### Task 4: Refactor The Pet Engine So Bubble Text And Speech Stay In Sync

**Files:**
- Modify: `mcode-app/src/services/petEngine.ts`
- Create: `mcode-app/tests/pet/petEngine.spec.ts`

- [ ] **Step 1: Write the failing interaction-engine tests**

Create `mcode-app/tests/pet/petEngine.spec.ts`:

```ts
import { createPinia, setActivePinia } from 'pinia'

const runtimeStore = {
  sessions: new Map(),
}

const speakPetText = jest.fn(() => true)

jest.mock('@/stores/conversationRuntime', () => ({
  useConversationRuntimeStore: () => runtimeStore,
}))

jest.mock('@/services/petVoice', () => ({
  speakPetText,
}))

import { usePetStore } from '@/stores/pet'
import { petInteract, usePetEngine } from '@/services/petEngine'

describe('pet engine interaction speech', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    speakPetText.mockClear()

    const { currentBubble, currentEmotion } = usePetEngine()
    currentBubble.value = null
    currentEmotion.value = 'idle'
  })

  it('speaks the exact line shown in the bubble for a normal interaction', () => {
    const store = usePetStore()
    store.initialized = true

    petInteract()

    const { currentBubble } = usePetEngine()
    expect(currentBubble.value?.text).toBeTruthy()
    expect(speakPetText).toHaveBeenCalledWith(currentBubble.value?.text)
  })

  it('skips speech when the user disabled voice', () => {
    const store = usePetStore()
    store.setVoiceEnabled(false)

    petInteract()

    expect(speakPetText).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: Run the engine tests and confirm the current implementation does not meet the contract**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petEngine.spec.ts
```

Expected:

```text
FAIL tests/pet/petEngine.spec.ts
Expected number of calls: 1
Received number of calls: 0
```

- [ ] **Step 3: Upgrade the engine to use full bubble payloads and add the stronger double-tap interaction**

Update `mcode-app/src/services/petEngine.ts`:

```ts
import { watch, ref } from 'vue'
import type { EmotionState, BubbleMessage } from '@/types/pet'
import { useConversationRuntimeStore } from '@/stores/conversationRuntime'
import { usePetStore } from '@/stores/pet'
import { pickBubbleMessage } from '@/services/petConfig'
import { speakPetText } from '@/services/petVoice'

const currentEmotion = ref<EmotionState>('idle')
const currentBubble = ref<BubbleMessage | null>(null)

function showBubble(trigger: string) {
  const petStore = usePetStore()
  const message = pickBubbleMessage(trigger)
  if (!message) return null

  if (bubbleTimer) clearTimeout(bubbleTimer)

  currentBubble.value = petStore.bubbleMuted ? null : message

  if (currentBubble.value) {
    bubbleTimer = setTimeout(() => {
      currentBubble.value = null
      bubbleTimer = null
    }, message.duration)
  } else {
    bubbleTimer = null
  }

  speakPetText(message.text)
  return message
}

export function petInteract() {
  const petStore = usePetStore()
  const result = petStore.addExp('user', 2)
  showBubble('pet_interact')

  const previousEmotion = currentEmotion.value
  currentEmotion.value = 'happy'
  setTimeout(() => {
    currentEmotion.value = previousEmotion === 'happy' ? computeEmotion() : previousEmotion
  }, 2000)

  return result
}

export function petInteractExcited() {
  const petStore = usePetStore()
  const result = petStore.addExp('user', 3)
  showBubble('pet_interact_excited')

  const previousEmotion = currentEmotion.value
  currentEmotion.value = 'excited'
  setTimeout(() => {
    currentEmotion.value = previousEmotion === 'excited' ? computeEmotion() : previousEmotion
  }, 2400)

  return result
}
```

Keep the existing status-watch behavior, `showGreeting()`, `showLevelUpCelebration()`, idle timers, and `destroyPetEngine()` cleanup intact, but route all bubble-producing paths through the new `showBubble()` implementation so greetings, level-up, error, and permission reminders reuse the same text payload shape.

- [ ] **Step 4: Run the engine test plus the earlier pet tests**

Run:

```bash
pnpm --dir mcode-app run test:unit -- \
  tests/pet/petConfig.spec.ts \
  tests/pet/petStore.spec.ts \
  tests/pet/petVoice.spec.ts \
  tests/pet/petAudio.spec.ts \
  tests/pet/petEngine.spec.ts
```

Expected:

```text
PASS tests/pet/petConfig.spec.ts
PASS tests/pet/petStore.spec.ts
PASS tests/pet/petVoice.spec.ts
PASS tests/pet/petAudio.spec.ts
PASS tests/pet/petEngine.spec.ts
```

- [ ] **Step 5: Commit the engine refactor**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- \
  mcode-app/src/services/petEngine.ts \
  mcode-app/tests/pet/petEngine.spec.ts
git -C D:/Repos/xyito/lingyun/mcode commit -m "feat(pet): sync bubble copy with speech"
```

Expected:

```text
[branch-name jkl3456] feat(pet): sync bubble copy with speech
```

---

### Task 5: Replace Tap-To-Panel With Voiced Interaction And Move Management To The Profile Page

**Files:**
- Create: `mcode-app/src/services/petTapGesture.ts`
- Create: `mcode-app/tests/pet/petTapGesture.spec.ts`
- Modify: `mcode-app/src/components/pet/PetSprite.vue`
- Modify: `mcode-app/src/components/pet/PetFloat.vue`
- Modify: `mcode-app/src/components/pet/PetPanel.vue`
- Modify: `mcode-app/src/pages/profile/index.vue`

- [ ] **Step 1: Write the failing tap-gesture helper test**

Create `mcode-app/tests/pet/petTapGesture.spec.ts`:

```ts
import { PET_DOUBLE_TAP_WINDOW_MS, shouldTreatAsDoubleTap } from '@/services/petTapGesture'

describe('pet tap gesture helper', () => {
  it('detects double taps inside the configured window', () => {
    expect(shouldTreatAsDoubleTap(1000, 1000 + PET_DOUBLE_TAP_WINDOW_MS - 10)).toBe(true)
  })

  it('treats delayed taps as separate interactions', () => {
    expect(shouldTreatAsDoubleTap(1000, 1000 + PET_DOUBLE_TAP_WINDOW_MS + 10)).toBe(false)
  })
})
```

- [ ] **Step 2: Run the tap-gesture test and confirm the helper is missing**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petTapGesture.spec.ts
```

Expected:

```text
FAIL tests/pet/petTapGesture.spec.ts
Cannot find module '@/services/petTapGesture'
```

- [ ] **Step 3: Add the pure tap helper and update the pet UI files**

Create `mcode-app/src/services/petTapGesture.ts`:

```ts
export const PET_DOUBLE_TAP_WINDOW_MS = 260
export const PET_SINGLE_TAP_DELAY_MS = 220
export const PET_TAP_INTERACTION_DURATION_MS = 320
export const PET_EXCITED_INTERACTION_DURATION_MS = 460

export function shouldTreatAsDoubleTap(lastTapAt: number, nextTapAt: number, windowMs = PET_DOUBLE_TAP_WINDOW_MS): boolean {
  return lastTapAt > 0 && nextTapAt - lastTapAt <= windowMs
}
```

Update `mcode-app/src/components/pet/PetSprite.vue`:

```vue
<template>
  <view
    class="pet-sprite"
    :class="[
      `pet-sprite--${emotion}`,
      `pet-sprite--${size}`,
      interaction === 'none' ? '' : `pet-sprite--interaction-${interaction}`,
    ]"
    :style="spriteStyle"
  >
    <image
      :src="spriteSrc"
      mode="aspectFit"
      class="pet-sprite__base"
    />
  </view>
</template>

<script setup lang="ts">
import { computed, onMounted, shallowRef } from 'vue'
import type { EmotionState, SpeciesId } from '@/types/pet'

const props = withDefaults(defineProps<{
  species: SpeciesId
  emotion: EmotionState
  skinId?: string
  size?: 'small' | 'normal' | 'large'
  interaction?: 'none' | 'tap' | 'excited'
}>(), {
  skinId: 'default',
  size: 'normal',
  interaction: 'none',
})
</script>

<style lang="scss" scoped>
.pet-sprite {
  &--interaction-tap {
    animation: pet-tap-pop 0.28s ease-out;
  }

  &--interaction-excited {
    animation: pet-tap-burst 0.42s ease-out;
  }
}

@keyframes pet-tap-pop {
  0% { transform: scale(1); }
  40% { transform: scale(1.12) translateY(-4rpx); }
  100% { transform: scale(1); }
}

@keyframes pet-tap-burst {
  0% { transform: scale(1) rotate(0deg); }
  35% { transform: scale(1.18) rotate(-8deg) translateY(-8rpx); }
  70% { transform: scale(1.08) rotate(8deg); }
  100% { transform: scale(1) rotate(0deg); }
}
</style>
```

Update `mcode-app/src/components/pet/PetFloat.vue`:

```vue
<template>
  <view
    v-if="petStore.initialized && !petStore.hidden"
    class="pet-float"
    :style="floatStyle"
    @touchstart.stop="onTouchStart"
    @touchmove.stop.prevent="onTouchMove"
    @touchend.stop="onTouchEnd"
  >
    <PetBubble :message="currentBubble" />
    <PetSprite
      :species="petStore.species"
      :emotion="currentEmotion"
      :skin-id="petStore.skinId"
      :interaction="interactionState"
      size="small"
    />
  </view>
```

```ts
import { playPetTapSound } from '@/services/petAudio'
import {
  PET_DOUBLE_TAP_WINDOW_MS,
  PET_SINGLE_TAP_DELAY_MS,
  PET_TAP_INTERACTION_DURATION_MS,
  PET_EXCITED_INTERACTION_DURATION_MS,
  shouldTreatAsDoubleTap,
} from '@/services/petTapGesture'
import { initPetEngine, petInteract, petInteractExcited, showLevelUpCelebration } from '@/services/petEngine'

const interactionState = ref<'none' | 'tap' | 'excited'>('none')
let singleTapTimer: ReturnType<typeof setTimeout> | null = null
let lastTapTime = 0
let longPressTriggered = false

function applyInteractionState(nextState: 'tap' | 'excited', duration: number) {
  interactionState.value = nextState
  setTimeout(() => {
    if (interactionState.value === nextState) {
      interactionState.value = 'none'
    }
  }, duration)
}

function triggerSingleInteraction() {
  applyInteractionState('tap', PET_TAP_INTERACTION_DURATION_MS)
  playPetTapSound()
  const result = petInteract()
  if (result.leveledUp) {
    showLevelUpCelebration()
  }
}

function triggerDoubleInteraction() {
  applyInteractionState('excited', PET_EXCITED_INTERACTION_DURATION_MS)
  playPetTapSound()
  const result = petInteractExcited()
  if (result.leveledUp) {
    showLevelUpCelebration()
  }
}

function onTouchStart(e: TouchEvent) {
  const touch = e.touches[0]
  touchStartX = touch.clientX - posX.value
  touchStartY = touch.clientY - posY.value
  touchStartTime = Date.now()
  hasMoved = false
  longPressTriggered = false

  longPressTimer = setTimeout(() => {
    if (!hasMoved) {
      longPressTriggered = true
      showActionSheet.value = true
    }
    longPressTimer = null
  }, 500)
}

function onTouchEnd() {
  if (longPressTimer) {
    clearTimeout(longPressTimer)
    longPressTimer = null
  }

  if (hasMoved) {
    const midX = screenWidth / 2
    posX.value = posX.value < midX ? 8 : screenWidth - BALL_SIZE - 8
    petStore.setPosition(posX.value, posY.value)
    return
  }

  if (longPressTriggered) {
    return
  }

  const now = Date.now()

  if (singleTapTimer && shouldTreatAsDoubleTap(lastTapTime, now, PET_DOUBLE_TAP_WINDOW_MS)) {
    clearTimeout(singleTapTimer)
    singleTapTimer = null
    lastTapTime = 0
    triggerDoubleInteraction()
    return
  }

  lastTapTime = now
  singleTapTimer = setTimeout(() => {
    triggerSingleInteraction()
    singleTapTimer = null
    lastTapTime = 0
  }, PET_SINGLE_TAP_DELAY_MS)
}

const actionSheetActions = computed(() => [
  { name: petStore.hidden ? '显示宠物' : '隐藏宠物' },
  { name: petStore.bubbleMuted ? '开启气泡' : '静音气泡' },
  { name: petStore.voiceEnabled ? '关闭语音' : '开启语音' },
])

function onActionSelect(action: { name: string }) {
  showActionSheet.value = false

  if (action.name === '隐藏宠物' || action.name === '显示宠物') {
    petStore.toggleHidden()
    return
  }

  if (action.name === '静音气泡' || action.name === '开启气泡') {
    petStore.toggleMute()
    return
  }

  if (action.name === '关闭语音' || action.name === '开启语音') {
    petStore.setVoiceEnabled(!petStore.voiceEnabled)
  }
}
```

Update `mcode-app/src/components/pet/PetPanel.vue` by adding two management rows inside the status tab:

```vue
<view class="tab-status__row" @click="petStore.setVoiceEnabled(!petStore.voiceEnabled)">
  <text class="tab-status__label">宠物语音</text>
  <text class="tab-status__value">{{ petStore.voiceEnabled ? '已开启' : '已关闭' }}</text>
</view>
<view class="tab-status__row" @click="petStore.toggleMute()">
  <text class="tab-status__label">气泡提醒</text>
  <text class="tab-status__value">{{ petStore.bubbleMuted ? '已关闭' : '已开启' }}</text>
</view>
```

Update `mcode-app/src/pages/profile/index.vue`:

```vue
<template>
  <view class="page" :style="[upThemeVars, upThemePageStyle]">
    <view class="section" :style="upThemeCardStyle">
      <view class="section-title">宠物陪伴</view>
      <view class="menu-list" :style="upThemeCardStyle">
        <view class="menu-item" @click="openPetManager">
          <view class="menu-left">
            <u-icon name="heart" size="22" color="#ff6b6b"></u-icon>
            <text class="menu-text">宠物管理</text>
          </view>
          <u-icon name="arrow-right" :color="upThemeVar('--up-light-color', '#c0c4cc')" size="18"></u-icon>
        </view>
      </view>
    </view>

    <PetPanel
      v-model:show="showPetPanel"
      :emotion="currentEmotion"
    />
  </view>
</template>
```

```ts
import { computed, ref, onMounted } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { usePetStore } from '@/stores/pet'
import { usePetEngine } from '@/services/petEngine'
import PetPanel from '@/components/pet/PetPanel.vue'

const petStore = usePetStore()
const showPetPanel = ref(false)
const { currentEmotion } = usePetEngine()

function openPetManager() {
  if (!petStore.initialized) {
    uni.showToast({
      title: '请先选择宠物伙伴',
      icon: 'none',
    })
    return
  }

  showPetPanel.value = true
}
```

- [ ] **Step 4: Run the tap helper test, type-check the app, and do the manual smoke pass**

Run:

```bash
pnpm --dir mcode-app run test:unit -- tests/pet/petTapGesture.spec.ts
pnpm --dir mcode-app exec vue-tsc --noEmit
pnpm --dir mcode-app run dev:h5
```

Expected:

```text
PASS tests/pet/petTapGesture.spec.ts
vue-tsc exits with code 0
The H5 dev server starts on the configured port
```

Manual smoke checklist in the running app:

```text
1. Single tap on the floating pet shows a new line, plays the tap sound, and triggers the small pop animation.
2. Double tap on the floating pet speaks a stronger line and uses the bigger burst animation.
3. Long press still opens the action sheet.
4. The action sheet can toggle bubble visibility and pet voice independently.
5. The profile page shows a `宠物管理` row that opens `PetPanel`.
6. The `PetPanel` status tab can toggle `宠物语音` and `气泡提醒`.
7. Single tap no longer opens `PetPanel` from the floating pet.
```

- [ ] **Step 5: Commit the UI interaction and profile-entry changes**

Run:

```bash
git -C D:/Repos/xyito/lingyun/mcode add -- \
  mcode-app/src/services/petTapGesture.ts \
  mcode-app/tests/pet/petTapGesture.spec.ts \
  mcode-app/src/components/pet/PetSprite.vue \
  mcode-app/src/components/pet/PetFloat.vue \
  mcode-app/src/components/pet/PetPanel.vue \
  mcode-app/src/pages/profile/index.vue
git -C D:/Repos/xyito/lingyun/mcode commit -m "feat(pet): add voiced tap interactions and profile manager"
```

Expected:

```text
[branch-name mno7890] feat(pet): add voiced tap interactions and profile manager
```

---

## Self-Review

**Spec coverage**

- `up-tts` real-time speech: Task 1 vendors the plugin, Task 3 wraps it, Task 4 calls it from the engine.
- More spoken copy: Task 2 expands templates and returns a full chosen message payload.
- Tap animation and click sound: Task 3 adds the sound asset/service, Task 5 adds transient sprite animations and wires them into tap handling.
- Single tap prioritizes interaction: Task 5 removes tap-to-panel behavior from `PetFloat.vue`.
- Double tap stronger interaction: Task 4 adds `petInteractExcited()`, Task 5 uses it.
- Long-press menu remains: Task 5 preserves the long-press flow and adds a voice toggle.
- Profile page management entry: Task 5 adds `宠物管理` and mounts `PetPanel` there.
- Fallback behavior: Task 3 handles unavailable speech/audio, Task 4 relies on the wrappers without surfacing user-facing errors.

**Placeholder scan**

- No `TODO`, `TBD`, or “implement later” text remains.
- Every create/modify step includes concrete file content or exact commands.
- Every verification step includes exact commands and expected output.

**Type consistency**

- Persistent store flag is always named `voiceEnabled`.
- Voice setter is always named `setVoiceEnabled`.
- Rich bubble selection helper is always named `pickBubbleMessage`.
- Speech wrapper is always named `speakPetText`.
- Tap sound wrapper is always named `playPetTapSound`.
- Double-tap engine action is always named `petInteractExcited`.
- Tap timing helper is always named `shouldTreatAsDoubleTap`.
