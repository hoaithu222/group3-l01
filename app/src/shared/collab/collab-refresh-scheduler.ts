import { refreshDelayMs } from './collab-token';
import type { CollabGrant } from './collab-token.types';
import type { CollabTokenProvider } from './collab-token-provider';

/** Thử lại khi xin token lỗi (mạng/BE): 5 s → 10 s → 20 s → 30 s (trần). */
const RETRY_DELAYS_MS = [5_000, 10_000, 20_000, 30_000] as const;

export interface CollabRefreshSchedulerOptions {
  now?: () => number;
  /** Hết cách làm mới (token hiện tại đã hết hạn mà vẫn không xin được) — báo để hiện trạng thái, KHÔNG ném. */
  onGiveUp?: (error: unknown) => void;
  /** Có token mới — nơi gọi gửi `setToken` cho WebView. */
  onGrant: (grant: CollabGrant) => void;
  provider: CollabTokenProvider;
}

/**
 * Hẹn giờ xin token mới TRƯỚC hạn 60 s (CW-D5: "không rớt phiên khi token hết hạn giữa chừng"). Hàm `token` của provider trong WebView
 * luôn trả bản mới nhất do `setToken` đưa vào, nên chỉ cần token mới tới trước lúc socket nối lại.
 *
 * Lớp thuần (không React) để test bằng đồng hồ giả. `start(grant)` đặt lại hẹn theo hạn của `grant`; `nudge()` gọi khi app trở lại
 * nền trước — bộ hẹn giờ bị hệ điều hành đóng băng lúc ở nền nên hạn có thể đã trôi qua.
 */
export class CollabRefreshScheduler {
  private timer: ReturnType<typeof setTimeout> | null = null;
  private grant: CollabGrant | null = null;
  private stopped = false;
  private readonly now: () => number;

  constructor(private readonly options: CollabRefreshSchedulerOptions) {
    this.now = options.now ?? Date.now;
  }

  start(grant: CollabGrant): void {
    this.stopped = false;
    this.grant = grant;
    this.arm(refreshDelayMs(grant.expiresAt, this.now()), 0);
  }

  /** Trở lại nền trước: hạn đã sát/trôi qua thì làm mới NGAY thay vì chờ hẹn cũ. */
  nudge(): void {
    if (this.stopped || !this.grant) return;
    this.arm(refreshDelayMs(this.grant.expiresAt, this.now()), 0);
  }

  stop(): void {
    this.stopped = true;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }

  private arm(delayMs: number, attempt: number): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = setTimeout(() => void this.run(attempt), delayMs);
  }

  private async run(attempt: number): Promise<void> {
    this.timer = null;
    if (this.stopped) return;
    try {
      const grant = await this.options.provider.refresh();
      if (this.stopped) return;
      this.grant = grant;
      this.options.onGrant(grant);
      this.arm(refreshDelayMs(grant.expiresAt, this.now()), 0);
    } catch (error) {
      if (this.stopped) return;
      const expired = !this.grant || this.grant.expiresAt <= this.now();
      // Token cũ đã hết hạn và nhiều lượt liền không xin được: báo (mỗi lượt) để màn hình hiện trạng thái; vẫn thử tiếp ở nhịp chậm.
      if (expired && attempt >= RETRY_DELAYS_MS.length - 1) this.options.onGiveUp?.(error);
      const delay = RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] ?? 30_000;
      this.arm(delay, attempt + 1);
    }
  }
}
