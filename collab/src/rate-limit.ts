/**
 * Bộ đếm cửa sổ cố định theo khoá (IP) trong RAM — đủ cho việc chặn dò/flood ở tầng nâng cấp WebSocket.
 * Nhiều instance: mỗi instance tự đếm (nginx băm theo `doc` nên một IP thường rơi vào vài instance) — chấp nhận sai số.
 */
export class WindowCounter {
  private readonly windows = new Map<string, { count: number; resetAt: number }>();

  constructor(
    private readonly windowMs: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** Tăng 1 và trả số lần trong cửa sổ hiện tại. */
  hit(key: string): number {
    const now = this.now();
    const w = this.windows.get(key);
    if (!w || w.resetAt <= now) {
      this.windows.set(key, { count: 1, resetAt: now + this.windowMs });
      return 1;
    }
    w.count += 1;
    return w.count;
  }

  count(key: string): number {
    const w = this.windows.get(key);
    return w && w.resetAt > this.now() ? w.count : 0;
  }

  /** Dọn mục hết hạn (gọi định kỳ). */
  sweep(): void {
    const now = this.now();
    for (const [k, w] of this.windows) if (w.resetAt <= now) this.windows.delete(k);
  }
}

/** Token bucket cho một kết nối: `rate` message/giây, cho burst = `rate`. Trả `false` khi hết token. */
export function takeToken(bucket: { tokens: number; updatedAt: number }, rate: number, now: number): boolean {
  const elapsed = Math.max(0, now - bucket.updatedAt) / 1000;
  bucket.tokens = Math.min(rate, bucket.tokens + elapsed * rate);
  bucket.updatedAt = now;
  if (bucket.tokens < 1) return false;
  bucket.tokens -= 1;
  return true;
}
