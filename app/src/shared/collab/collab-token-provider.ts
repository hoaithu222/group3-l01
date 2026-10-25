import { isGrantFresh } from './collab-token';
import type { CollabGrant, CollabGrantFetcher } from './collab-token.types';

/**
 * Nguồn mã kết nối cộng tác của MỘT phiên mở tài liệu. Vòng đời do màn hình giữ (một provider mỗi lần mở), ⛔ không toàn cục: token
 * gắn với tài liệu + người dùng, để chung là rò sang phiên khác.
 *
 *  · `refresh()` LUÔN xin mới — dùng mỗi khi WebView nối/nối lại (`ready` → `init`) và khi bridge báo `requestToken`. Token cũ giữ lại
 *    có thể đã hết hạn lúc nối lại (nền, mất mạng lâu) và server chỉ kiểm token lúc THIẾT LẬP kết nối (README §3.6).
 *  · Single-flight: nhiều nơi cùng đòi (hẹn giờ làm mới + `requestToken` trùng lúc) chỉ tốn MỘT lượt gọi BE — BE giới hạn 30 lần/phút.
 *  · `ensure()` dùng lại bản còn hạn (≥ 60 s) — cho chỗ chỉ cần token hợp lệ, không cần "mới tinh".
 *
 * ⛔ Không ghi log token; lỗi của `fetchGrant` ném nguyên ra cho nơi gọi (403/404 = mất quyền, khác lỗi mạng — nơi gọi phân biệt).
 */
export class CollabTokenProvider {
  private grant: CollabGrant | null = null;
  private inflight: Promise<CollabGrant> | null = null;
  /** Tăng mỗi lần `clear()` — kết quả của lượt gọi bắt đầu TRƯỚC đó không được ghi lại vào bộ nhớ. */
  private epoch = 0;

  constructor(
    private readonly fetchGrant: CollabGrantFetcher,
    private readonly now: () => number = Date.now,
  ) {}

  /** Bản mới nhất đang giữ (có thể sắp/đã hết hạn — xem `isGrantFresh`). */
  get current(): CollabGrant | null {
    return this.grant;
  }

  refresh(): Promise<CollabGrant> {
    if (this.inflight) return this.inflight;
    const epoch = this.epoch;
    const request = this.fetchGrant().then((grant) => {
      if (epoch === this.epoch) this.grant = grant;
      return grant;
    });
    this.inflight = request;
    // Gỡ cờ "đang bay" ở nhánh RIÊNG (cả khi bị từ chối) — nhánh này tự nuốt lỗi nên không sinh unhandled rejection;
    // lỗi vẫn đến nơi gọi qua `request`.
    const release = () => {
      if (this.inflight === request) this.inflight = null;
    };
    request.then(release, release);
    return request;
  }

  ensure(): Promise<CollabGrant> {
    return this.grant && isGrantFresh(this.grant, this.now())
      ? Promise.resolve(this.grant)
      : this.refresh();
  }

  /** Quên token đang giữ (rời màn hình). */
  clear(): void {
    this.grant = null;
    this.epoch += 1;
  }
}
