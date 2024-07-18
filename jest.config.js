module.exports = {
    preset: 'ts-jest',
    testEnvironment: 'node',
    testMatch: ['**/__tests__/**/*.test.ts'],
    moduleNameMapper: {
      '^@/(.*)$': '<rootDir>/src/$1'
    },
    testTimeout: 20000,
    collectCoverage: true,
    coverageDirectory: 'coverage',
    coverageReporters: ['text', 'lcov'],
    coveragePathIgnorePatterns: [
      "/node_modules/",
      "/dist/",
      "/src/server.js" 
    ],
    transform: {
      "^.+\\.(ts|tsx)$": "ts-jest",
    },
  };
  