import { LIMITS } from "./limits";

/**
 * Chính sách KHÁCH (p3-04) — hàm THUẦN dùng chung `modules/members` (mời/duyệt), `modules/workspaces` (trả `guestPolicy` trong
 * chi tiết nhóm, `PATCH …/settings`, admin `access-summary`). Đặt ở `core/` vì hai module không import chéo nhau.
 */

/** Số liệu nền tảng của khách ở thời điểm gọi (`LIMITS.guest` ⊕ override `SystemConfig limits.guest`). */
export interface GuestConfig {
  enabledByDefault: boolean;
  defaultDays: number;
  maxDays: number;
  maxPerWorkspace: number;
  designatedChannelsMax: number;
  expiringNoticeHours: number;
}

export const DEFAULT_GUEST_CONFIG: GuestConfig = {
  enabledByDefault: LIMITS.guest.enabledByDefault,
  defaultDays: LIMITS.guest.defaultDays,
  maxDays: LIMITS.guest.maxDays,
  maxPerWorkspace: LIMITS.guest.maxPerWorkspace,
  designatedChannelsMax: LIMITS.guest.designatedChannelsMax,
  expiringNoticeHours: LIMITS.guest.expiringNoticeHours,
};

/** `Workspace.guestPolicy` (JSON) đã chuẩn hoá — nhóm chưa thiết lập → mặc định nền tảng. */
export interface GuestPolicy {
  enabled: boolean;
  maxGuests: number;
  maxDays: number;
  memberCanInvite: boolean;
}

function asNumber(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * `Workspace.guestPolicy` (JSON, có thể `null`/thiếu trường) → `GuestPolicy` đầy đủ. `maxDays`/`maxGuests` luôn bị chặn bởi
 * trần nền tảng (admin có thể hạ trần sau khi nhóm đã lưu).
 */
export function resolveGuestPolicy(raw: unknown, config: GuestConfig): GuestPolicy {
  const source = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    enabled: typeof source.enabled === "boolean" ? source.enabled : config.enabledByDefault,
    maxGuests: Math.min(asNumber(source.maxGuests, config.maxPerWorkspace), config.maxPerWorkspace),
    maxDays: Math.min(asNumber(source.maxDays, config.maxDays), config.maxDays),
    memberCanInvite: typeof source.memberCanInvite === "boolean" ? source.memberCanInvite : false,
  };
}
