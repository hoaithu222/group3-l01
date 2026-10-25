import type { Config } from "jest";

const moduleNameMapper = {
  "^@core/(.*)$": "<rootDir>/src/core/$1",
  "^@infrastructure/(.*)$": "<rootDir>/src/infrastructure/$1",
  "^@modules/(.*)$": "<rootDir>/src/modules/$1",
  "^@shared/(.*)$": "<rootDir>/src/shared/$1",
};

const transform: NonNullable<Config["transform"]> = {
  "^.+\\.tsx?$": [
    "ts-jest",
    {
      tsconfig: {
        strict: true,
      },
    },
  ],
};

const config: Config = {
  // `TEST_DB=memory` (mặc định CI, xem .github/workflows/ci.yml) → khởi
  // MongoMemoryReplSet 1 lần cho toàn bộ suite, ghi đè DATABASE_URL. Không
  // set → giữ nguyên DATABASE_URL hiện có (đa số test dùng repo in-memory/mock).
  globalSetup: "<rootDir>/src/tests/global-setup.ts",
  globalTeardown: "<rootDir>/src/tests/global-teardown.ts",
  passWithNoTests: true,
  projects: [
    {
      displayName: "unit",
      preset: "ts-jest",
      testEnvironment: "node",
      rootDir: ".",
      // `scripts/` thêm ở p0-05 cho `scripts/tests/migrate-asset-links.test.ts`
      // (script migration không thuộc `src/`, nhưng test của nó vẫn cần chạy
      // qua `npm test`) — mọi test khác vẫn nằm dưới `src/` như trước.
      roots: ["<rootDir>/src", "<rootDir>/scripts"],
      testMatch: ["**/__tests__/**/*.ts", "**/*.test.ts", "**/*.spec.ts"],
      testPathIgnorePatterns: ["/node_modules/", "/tests/integration/"],
      transform,
      setupFilesAfterEnv: ["<rootDir>/src/tests/setup.ts"],
      moduleNameMapper,
      clearMocks: true,
      resetMocks: true,
      restoreMocks: true,
    },
    {
      displayName: "integration",
      preset: "ts-jest",
      testEnvironment: "node",
      rootDir: ".",
      roots: ["<rootDir>/src"],
      testMatch: ["<rootDir>/src/**/tests/integration/**/*.test.ts"],
      transform,
      // KHÔNG mock Redis (khác "unit") — integration cần hành vi Redis thật.
      setupFilesAfterEnv: ["<rootDir>/src/tests/setup.integration.ts"],
      moduleNameMapper,
      clearMocks: true,
      resetMocks: true,
      restoreMocks: true,
    },
  ],
  collectCoverageFrom: [
    "src/**/*.ts",
    "!src/**/*.d.ts",
    "!src/server.ts",
    "!src/worker.ts",
    "!src/**/__tests__/**",
    "!src/**/tests/**",
  ],
  coverageDirectory: "coverage",
  coverageReporters: ["text", "lcov", "html"],
  clearMocks: true,
  resetMocks: true,
  restoreMocks: true,
};

export default config;
