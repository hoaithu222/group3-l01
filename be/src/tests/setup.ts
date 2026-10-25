/**
 * Jest Global Setup — chạy trước tất cả test files.
 *
 * - Suppress console.log trong test (tránh noise)
 * - Mock env variables cho test
 * - Setup test database / Redis nếu cần
 */

// Suppress winston logs trong test
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

// Mock Redis
jest.mock("../../src/infrastructure/redis", () => ({
  redis: {
    connect: jest.fn(),
    disconnect: jest.fn(),
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    ping: jest.fn().mockResolvedValue(true),
  },
}));

// Set test env
process.env.NODE_ENV = "test";
process.env.JWT_SECRET = "test-jwt-secret-key-for-testing-only";
process.env.JWT_REFRESH_SECRET = "test-jwt-refresh-secret-key-for-testing";
