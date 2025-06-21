module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],
  transform: {
    '^.+\\.ts$': 'ts-jest',
  },
  // Handle ES modules in zkPassport dependencies
  transformIgnorePatterns: [
    'node_modules/(?!(@zkpassport|@obsidion|@noble)/)'
  ],
  extensionsToTreatAsEsm: ['.ts'],
  globals: {
    'ts-jest': {
      useESM: true
    }
  },
  // Mock zkPassport SDK for tests to avoid complex dependency issues
  moduleNameMapper: {
    '^@zkpassport/sdk$': '<rootDir>/src/tests/__mocks__/@zkpassport/sdk.js'
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
};