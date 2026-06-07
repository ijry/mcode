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
    '^@/\\.\\./uni_modules/uts-plugin-tts$': '<rootDir>/tests/mocks/uts-plugin-tts.cjs',
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFilesAfterEnv: ['<rootDir>/tests/setup/petTestSetup.cjs'],
}
