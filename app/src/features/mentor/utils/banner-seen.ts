/**
 * "Đã đóng banner cố vấn của đợt này chưa" — theo (người dùng, đợt cố vấn), TRONG BỘ NHỚ của phiên app.
 *
 * ⚠️ Không lưu bền (AsyncStorage/Zustand persist): dữ liệu lưu bền phải khai vào sổ dọn dữ liệu người dùng
 * `src/shell/session/user-scoped-stores.constants.ts` (thuộc vỏ app, ngoài phạm vi p6-03) — cùng lý do `career/utils/unlock-seen.ts`. Đánh đổi:
 * mở lại app thì banner hiện thêm một lần nữa (vô hại: chỉ là lời nhắc phạm vi quyền). Khoá có `userId` nên đổi tài khoản trên cùng máy không lẫn.
 */
const dismissed = new Set<string>();

const keyOf = (userId: string, engagementId: string): string => `${userId}:${engagementId}`;

export function isBannerDismissed(userId: string, engagementId: string): boolean {
  return dismissed.has(keyOf(userId, engagementId));
}

export function dismissBanner(userId: string, engagementId: string): void {
  dismissed.add(keyOf(userId, engagementId));
}

/** Chỉ cho test. */
export function resetBannerSeen(): void {
  dismissed.clear();
}
