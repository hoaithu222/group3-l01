/**
 * Hook "user còn là OWNER workspace có thành viên khác không" — chạy trước
 * khi cho tự yêu cầu xoá tài khoản (be.md p0-01 §5.4 bước 3, ma trận quyền §6:
 * "OWNER workspace phải chuyển quyền trước — kiểm ở Phase 1 qua resolver").
 *
 * Registry rỗng ở Phase 0 (module workspace chưa tồn tại) → `assertCanDeleteAccount`
 * luôn cho qua. Phase 1 (`p1-01`) đăng ký 1 guard lúc import routes (side-effect,
 * giống `registerScopeResolver`/`registerRoomGuard`) — không cần sửa lại
 * `UserService.requestDeletion` khi đó.
 */
export type OwnershipGuard = (userId: string) => Promise<void>;

const guards: OwnershipGuard[] = [];

/** Đăng ký 1 guard — ném lỗi (`OwnershipBlocksDeletionError`, USER_010) nếu chặn. */
export function registerOwnershipGuard(guard: OwnershipGuard): void {
  guards.push(guard);
}

/** Chạy tuần tự mọi guard đã đăng ký; guard đầu tiên ném lỗi sẽ dừng luôn. */
export async function assertCanDeleteAccount(userId: string): Promise<void> {
  for (const guard of guards) {
    await guard(userId);
  }
}

/** Test-only — xoá guard đã đăng ký giữa các test suite (tránh rò rỉ state). */
export function __resetOwnershipGuardsForTests(): void {
  guards.length = 0;
}
