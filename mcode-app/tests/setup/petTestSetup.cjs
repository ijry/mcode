const storage = new Map()

global.__PET_TEST_STORAGE__ = storage

global.uni = {
  getStorageSync: jest.fn((key) => storage.get(key) ?? ''),
  setStorageSync: jest.fn((key, value) => storage.set(key, value)),
  removeStorageSync: jest.fn((key) => storage.delete(key)),
  clearStorageSync: jest.fn(() => storage.clear()),
  getWindowInfo: jest.fn(() => ({ windowWidth: 390, windowHeight: 844 })),
  request: jest.fn(),
  uploadFile: jest.fn(),
  chooseImage: jest.fn(),
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
  global.uni.uploadFile.mockClear()
  global.uni.chooseImage.mockClear()
  global.uni.showToast.mockClear()
  global.uni.createInnerAudioContext.mockClear()
})
