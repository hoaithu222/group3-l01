import { createHash } from "crypto";

interface Entry {
  value: number;
  expiresAt: number;
}

function sha1(text: string): string {
  return createHash("sha1").update(text).digest("hex");
}

/**
 * Giả lập tối thiểu lệnh Redis mà `rate-limit-redis` (RedisStore) gửi qua
 * `sendCommand` — CHỈ 2 việc nó thực sự cần: `SCRIPT LOAD` (trả SHA1 thật của
 * script) và `EVALSHA` (chạy lại đúng logic 2 script increment/get bằng JS
 * thay vì 1 Lua interpreter thật). Dùng cho unit test rate limiter khi không
 * có Redis thật — hành vi cửa sổ cố định (fixed window) giống thật 100%.
 */
export function createFakeRedisSendCommand() {
  const store = new Map<string, Entry>();
  const scripts = new Map<string, "increment" | "get">();

  function pttl(key: string): number {
    const entry = store.get(key);
    if (!entry) return -2;
    const remain = entry.expiresAt - Date.now();
    if (remain <= 0) {
      store.delete(key);
      return -2;
    }
    return remain;
  }

  async function sendCommand(...args: string[]): Promise<unknown> {
    const [cmd, ...rest] = args;
    switch (cmd) {
      case "SCRIPT": {
        const script = rest[1] ?? "";
        const isIncrement = script.includes("INCR");
        const sha = sha1(script);
        scripts.set(sha, isIncrement ? "increment" : "get");
        return sha;
      }
      case "EVALSHA": {
        const [sha, , key, resetFlag, windowMsStr] = rest;
        const kind = scripts.get(sha ?? "");
        if (!kind || !key) throw new Error("NOSCRIPT");

        if (kind === "get") {
          const remain = pttl(key);
          const entry = store.get(key);
          return [entry ? entry.value : false, remain];
        }

        const windowMs = Number(windowMsStr);
        const resetOnChange = resetFlag === "1";
        const remain = pttl(key);
        if (remain <= 0) {
          store.set(key, { value: 1, expiresAt: Date.now() + windowMs });
          return [1, windowMs];
        }
        const entry = store.get(key)!;
        entry.value += 1;
        let timeToExpire = remain;
        if (resetOnChange) {
          entry.expiresAt = Date.now() + windowMs;
          timeToExpire = windowMs;
        }
        return [entry.value, timeToExpire];
      }
      // `RedisStore.decrement` (dùng bởi `skipSuccessfulRequests`) và `resetKey`.
      case "DECR": {
        const [key] = rest;
        const entry = key ? store.get(key) : undefined;
        if (!key || !entry || pttl(key) <= 0) return -1;
        entry.value -= 1;
        return entry.value;
      }
      case "DEL": {
        const [key] = rest;
        return key && store.delete(key) ? 1 : 0;
      }
      default:
        return null;
    }
  }

  /** Khoá đang sống trong "Redis" giả — để test kiểm tra tiền tố `REDIS_KEY_PREFIX` (SEC-07) và bộ đếm dùng chung. */
  sendCommand.keys = (): string[] => [...store.keys()].filter((k) => pttl(k) > 0);

  return sendCommand;
}
