import { backoffDelayMs } from './close-policy';

/**
 * Hai đồng hồ của bộ điều khiển kết nối: hẹn nối lại sau backoff mũ, và hạn chờ đồng bộ LẦN ĐẦU. Tách riêng để `ConnectionController` chỉ giữ
 * chính sách; `clear()` phải gọi khi dừng/huỷ — hẹn giờ sống sót sau khi màn hình đóng là nối lại một phiên đã bỏ.
 */
export class LinkTimers {
  attempts = 0;
  private backoff: ReturnType<typeof setTimeout> | undefined;
  private initial: ReturnType<typeof setTimeout> | undefined;

  /** Hẹn `run` sau backoff (2 s → 30 s). Đã có hẹn thì không hẹn thêm — trả `false`. */
  scheduleBackoff(run: () => void, random?: () => number): boolean {
    if (this.backoff) return false;
    this.backoff = setTimeout(
      () => {
        this.backoff = undefined;
        run();
      },
      backoffDelayMs(++this.attempts, random),
    );
    return true;
  }

  armInitial(ms: number, fire: () => void): void {
    clearTimeout(this.initial);
    this.initial = setTimeout(fire, ms);
  }

  clearInitial(): void {
    clearTimeout(this.initial);
    this.initial = undefined;
  }

  clear(): void {
    clearTimeout(this.backoff);
    this.backoff = undefined;
    this.clearInitial();
  }
}
