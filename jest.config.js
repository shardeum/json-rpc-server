module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testTimeout: 5000000, // the more node involve in testing, the higher the timeout requires
  verbose: true,
  roots: ['<rootDir>/test/unit'],
  testMatch: ['**/test/unit/**/*.test.ts'],
  transform: {
    '^.+\\.(ts|tsx)$': 'ts-jest',
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  collectCoverageFrom: ['src/**/*.{ts,js}'],
}
