/**
 * Redis giả có TRẠNG THÁI cho test tích hợp auth (Mongo thật + Redis giả): mô phỏng đúng ngữ nghĩa của wrapper
 * `infrastructure/redis` mà auth dùng — `set` (chuỗi trần hoặc object → JSON), `get`/`getdel` (JSON.parse giá trị đọc ra),
 * `incr`/`expire`/`del`/`exists`, TTL theo `Date.now()`, và `getClient()?.isReady`.
 *
 * Dùng: `jest.mock("<...>/infrastructure/redis", () => ({ redis: createRedisMockShape() }))` rồi
 * `installRedisFake(redis)` trong `beforeEach` (`resetMocks: true` xoá implementation trước MỖI test).
 */
interface Entry {
  value: string;
  expiresAt: number | null;
}

const store = new Map<string, Entry>();
let ready = true;

function live(key: string): Entry | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
    store.delete(key);
    return undefined;
  }
  return entry;
}

function parse(raw: string): unknown {
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return raw;
  }
}

/** Hình dạng `redis` để dùng trong factory của `jest.mock` (mọi hàm là `jest.fn()`). */
export function createRedisMockShape(): Record<string, jest.Mock> {
  const names = ["get", "set", "del", "getdel", "incr", "incrBy", "expire", "exists", "setNx", "getClient", "ping", "connect", "disconnect"];
  return Object.fromEntries(names.map((n) => [n, jest.fn()]));
}

export function installRedisFake(redis: unknown): void {
  const r = redis as Record<string, jest.Mock>;
  r.getClient.mockImplementation(() => (ready ? { isReady: true } : null));
  r.get.mockImplementation(async (key: string) => {
    if (!ready) return null;
    const entry = live(key);
    return entry ? parse(entry.value) : null;
  });
  r.set.mockImplementation(async (key: string, value: unknown, ttl?: number) => {
    if (!ready) return;
    store.set(key, {
      value: typeof value === "string" ? value : JSON.stringify(value),
      expiresAt: ttl ? Date.now() + ttl * 1000 : null,
    });
  });
  r.getdel.mockImplementation(async (key: string) => {
    if (!ready) return null;
    const entry = live(key);
    store.delete(key);
    return entry ? parse(entry.value) : null;
  });
  r.del.mockImplementation(async (key: string) => {
    store.delete(key);
  });
  r.incr.mockImplementation(async (key: string) => {
    if (!ready) return null;
    const next = Number(live(key)?.value ?? 0) + 1;
    const prev = live(key);
    store.set(key, { value: String(next), expiresAt: prev?.expiresAt ?? null });
    return next;
  });
  r.expire.mockImplementation(async (key: string, ttl: number) => {
    const entry = live(key);
    if (entry) entry.expiresAt = Date.now() + ttl * 1000;
  });
  r.exists.mockImplementation(async (key: string) => live(key) !== undefined);
  r.setNx.mockImplementation(async (key: string, value: string, ttl: number) => {
    if (live(key)) return false;
    store.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return true;
  });
  r.ping.mockResolvedValue(true);
  r.connect.mockResolvedValue(undefined);
  r.disconnect.mockResolvedValue(undefined);
}

/** Xoá toàn bộ dữ liệu giả và đưa Redis về trạng thái "sẵn sàng". */
export function resetRedisFake(): void {
  store.clear();
  ready = true;
}

/** Mô phỏng Redis mất kết nối (`getClient()` trả `null`, mọi đọc trả `null`, mọi ghi bị bỏ). */
export function setRedisFakeReady(value: boolean): void {
  ready = value;
}

/** Danh sách khoá đang sống — để assert (vd khoá KHÔNG chứa email/token thô). */
export function redisFakeKeys(): string[] {
  return [...store.keys()].filter((k) => live(k) !== undefined);
}

export function redisFakeGet(key: string): unknown {
  const entry = live(key);
  return entry ? parse(entry.value) : null;
}
