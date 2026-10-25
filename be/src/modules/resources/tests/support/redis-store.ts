/**
 * Redis GIẢ có trạng thái cho test tích hợp của `resources` (get/set/incr/hash/expire) — mỗi file test vẫn tự
 * `jest.mock("…/infrastructure/redis")` (Jest hoist `jest.mock` nên không gọi hộ từ file khác được) rồi nối bằng
 * `wireRedisMocks`. Cùng ngữ nghĩa với `redis.client.ts`: `get` trả JSON đã parse, không có Redis → `null`.
 */
export function makeRedisStore() {
  const strings = new Map<string, unknown>();
  const hashes = new Map<string, Record<string, string>>();
  return {
    strings,
    hashes,
    clear(): void {
      strings.clear();
      hashes.clear();
    },
  };
}

export type RedisStore = ReturnType<typeof makeRedisStore>;

export function wireRedisMocks(redis: Record<string, jest.Mock>, store: RedisStore): void {
  redis.get.mockImplementation((key: string) => Promise.resolve(store.strings.has(key) ? store.strings.get(key) : null));
  redis.set.mockImplementation((key: string, value: unknown) => {
    store.strings.set(key, typeof value === "string" ? value : JSON.parse(JSON.stringify(value)));
    return Promise.resolve();
  });
  redis.del.mockImplementation((key: string) => {
    store.strings.delete(key);
    return Promise.resolve();
  });
  redis.getdel.mockImplementation((key: string) => {
    const v = store.strings.has(key) ? store.strings.get(key) : null;
    store.strings.delete(key);
    return Promise.resolve(v);
  });
  redis.incr.mockImplementation((key: string) => {
    const next = ((store.strings.get(key) as number | undefined) ?? 0) + 1;
    store.strings.set(key, next);
    return Promise.resolve(next);
  });
  redis.expire.mockResolvedValue(undefined);
  redis.exists.mockImplementation((key: string) => Promise.resolve(store.strings.has(key)));
  redis.setNx.mockImplementation((key: string) => {
    if (store.strings.has(key)) return Promise.resolve(false);
    store.strings.set(key, "1");
    return Promise.resolve(true);
  });
  redis.hset.mockImplementation((key: string, field: string, value: string) => {
    const h = store.hashes.get(key) ?? {};
    h[field] = value;
    store.hashes.set(key, h);
    return Promise.resolve();
  });
  redis.hgetall.mockImplementation((key: string) => Promise.resolve({ ...(store.hashes.get(key) ?? {}) }));
  redis.hdel.mockImplementation((key: string, field: string) => {
    const h = store.hashes.get(key);
    if (h) delete h[field];
    return Promise.resolve();
  });
  redis.scanKeys.mockResolvedValue([]);
  redis.ping.mockResolvedValue(true);
  redis.getClient.mockReturnValue(null);
}
