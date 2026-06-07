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
