/**
 * Redis giả bằng Map trong bộ nhớ — đủ ngữ nghĩa GET/SET/DEL/INCR/EXPIRE cho
 * test `core/permission` (không cần Redis thật). Dùng cùng pattern
 * `core/utils/tests/nonce.test.ts`: `jest.mock` khai `jest.fn()` KHÔNG
 * implementation trong factory (an toàn hoist), rồi gọi `installFakeRedis()`
 * trong `beforeEach` để gắn lại implementation — `resetMocks: true`
 * (jest.config.ts) xoá implementation trước MỖI test.
 */

export interface FakeRedisMock {
  get: jest.Mock;
  set: jest.Mock;
  del: jest.Mock;
  incr: jest.Mock;
  expire: jest.Mock;
  setNx: jest.Mock;
  exists: jest.Mock;
  hset: jest.Mock;
  hgetall: jest.Mock;
  hdel: jest.Mock;
  scanKeys: jest.Mock;
}

/** Dùng trong factory của `jest.mock("...../infrastructure/redis", () => createFakeRedisModule())`. */
export function createFakeRedisModule(): { redis: FakeRedisMock } {
  return {
    redis: {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      incr: jest.fn(),
      expire: jest.fn(),
      setNx: jest.fn(),
      exists: jest.fn(),
      hset: jest.fn(),
      hgetall: jest.fn(),
      hdel: jest.fn(),
      scanKeys: jest.fn(),
    },
  };
}

/**
 * Gắn implementation dựa trên Map — gọi trong `beforeEach`. Trả `store` để
 * test tự kiểm tra/prime dữ liệu. HASH (p0-03 — presence lease, connection
 * registry) lưu dưới dạng `Map<string, string>` lồng trong `store` (giá trị
 * tại key hash là chính nó 1 `Map`, không phải string) — khác GET/SET thường.
 */
export function installFakeRedis(redis: FakeRedisMock): Map<string, unknown> {
  const store = new Map<string, unknown>();

  function hashAt(key: string): Map<string, string> {
    let h = store.get(key) as Map<string, string> | undefined;
    if (!h) {
      h = new Map<string, string>();
      store.set(key, h);
    }
    return h;
  }

  redis.get.mockImplementation((key: string) => Promise.resolve(store.has(key) ? store.get(key) : null));
  redis.set.mockImplementation((key: string, value: unknown) => {
    store.set(key, value);
    return Promise.resolve();
  });
  redis.del.mockImplementation((key: string) => {
    store.delete(key);
    return Promise.resolve();
  });
  redis.incr.mockImplementation((key: string) => {
    const next = (Number(store.get(key)) || 0) + 1;
    store.set(key, next);
    return Promise.resolve(next);
  });
  redis.expire.mockImplementation(() => Promise.resolve());
  redis.setNx.mockImplementation((key: string, value: unknown) => {
    if (store.has(key)) return Promise.resolve(false);
    store.set(key, value);
    return Promise.resolve(true);
  });
  redis.exists.mockImplementation((key: string) => Promise.resolve(store.has(key)));
  redis.hset.mockImplementation((key: string, field: string, value: string) => {
    hashAt(key).set(field, value);
    return Promise.resolve();
  });
  redis.hgetall.mockImplementation((key: string) => {
    const h = store.get(key) as Map<string, string> | undefined;
    return Promise.resolve(h ? Object.fromEntries(h) : {});
  });
  redis.hdel.mockImplementation((key: string, field: string) => {
    (store.get(key) as Map<string, string> | undefined)?.delete(field);
    return Promise.resolve();
  });
  redis.scanKeys.mockImplementation((pattern: string) => {
    const prefix = pattern.endsWith("*") ? pattern.slice(0, -1) : pattern;
    return Promise.resolve([...store.keys()].filter((k) => k.startsWith(prefix)));
  });

  return store;
}
