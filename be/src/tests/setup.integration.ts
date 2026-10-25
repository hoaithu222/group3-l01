/**
 * Jest setup cho project "integration" — khác `setup.ts` (unit) ở chỗ KHÔNG
 * mock Redis: test integration cần Redis thật (container CI hoặc
 * `docker compose -f docker-compose.dev.yml up -d`) để kiểm hành vi thật của
 * `scopeLimiter`/`idempotencyKey`/blacklist token, không phải hành vi giả lập.
 */
jest.mock("../../src/infrastructure/logger", () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
  createContextLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  })),
}));

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-for-testing";
