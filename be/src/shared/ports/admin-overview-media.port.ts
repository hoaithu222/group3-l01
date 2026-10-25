/**
 * Cổng KPI gọi & họp cho dashboard admin (p2-07 be.md §5.7) — đặt ở `shared/ports/` (giống `channel-voice-activity.port`) để
 * `modules/admin-overview` ghép khối `media` vào `GET /admin/overview` mà KHÔNG import `modules/admin-media-ops` (luật 3 tầng,
 * `.claude/rules/architecture.md`). `admin-media-ops` đăng ký provider lúc boot (import routes); chưa đăng ký (test không nạp module) →
 * `getAdminOverviewMediaProvider()` trả `null` và dashboard bỏ trường `media`.
 *
 * Chỉ SỐ LIỆU tổng hợp — không id/tên người dùng, không nội dung cuộc gọi/họp.
 */
export interface AdminOverviewMedia {
  /** Cuộc họp đang diễn ra (`Meeting.status = LIVE`, chưa xoá). */
  liveMeetings: number;
  /** Cuộc gọi bắt đầu từ 00:00 hôm nay theo múi giờ `Asia/Ho_Chi_Minh`. */
  callsToday: number;
  /** Tổng phút của cuộc gọi ĐÃ kết thúc trong 7 ngày gần nhất (floor Σ `durationSec` / 60). */
  callMinutes7d: number;
  /** Tổng dung lượng bản ghi hình READY chưa xoá (byte). */
  recordingStorageBytes: number;
  /** Số bản ghi hình FAILED trong 24 giờ gần nhất. */
  egressFailed24h: number;
}

export interface AdminOverviewMediaProvider {
  get(): Promise<AdminOverviewMedia>;
}

let provider: AdminOverviewMediaProvider | null = null;

/** Gọi lúc boot của module sở hữu số liệu (`admin-media-ops`); đăng ký lại sẽ GHI ĐÈ. */
export function registerAdminOverviewMediaProvider(impl: AdminOverviewMediaProvider): void {
  provider = impl;
}

export function getAdminOverviewMediaProvider(): AdminOverviewMediaProvider | null {
  return provider;
}

/** Chỉ dùng trong test để cô lập giữa các case. */
export function clearAdminOverviewMediaProvider(): void {
  provider = null;
}
