/** @type {import('jest').Config} */
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  testMatch: ['<rootDir>/__tests__/**/*.test.ts?(x)'],
  transformIgnorePatterns: [
    'node_modules/(?!(?:@react-native|react-native|react-native-svg)/)',
  ],
  collectCoverageFrom: ['src/**/*.{ts,tsx}', 'cli/**/*.ts'],
};
