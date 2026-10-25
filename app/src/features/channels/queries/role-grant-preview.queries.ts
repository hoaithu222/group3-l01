import { useQueries } from '@tanstack/react-query';

import { grantsService, type RoleRef } from '../api';

/** Vai trò NÀO được phủ bởi từng role grant (README p3-04 §2): ADMIN = OWNER+ADMIN; MEMBER = OWNER+ADMIN+MEMBER. */
const ROLES_COVERED: Record<RoleRef, ('OWNER' | 'ADMIN' | 'MEMBER')[]> = {
  ADMIN: ['OWNER', 'ADMIN'],
  MEMBER: ['OWNER', 'ADMIN', 'MEMBER'],
};

export interface RoleGrantPreview {
  isLoading: boolean;
  /** `undefined` khi chưa đếm được (đang tải hoặc lỗi) — nơi gọi bỏ con số, không bịa. */
  total: number | undefined;
}

/**
 * "Khoảng N người sẽ xem được toàn bộ lịch sử kênh" (app.md p3-04 §3) — cộng số thành viên
 * của các vai trò được phủ. Chỉ đếm khi `enabled` (đang mở hộp thoại xác nhận), không tốn
 * request cho mọi lần vào màn Thành viên.
 *
 * "Khoảng" vì số này là ảnh chụp lúc mở hộp thoại; người mới vào/đổi vai trò sau đó vẫn
 * được tính theo vai trò (đó chính là ý nghĩa của cấp theo vai trò). Khoá query đặt
 * `wsId` ở vị trí thứ hai để `matchesScope` dọn theo workspace khi mất quyền.
 */
export function useRoleGrantPreview(wsId: string, roleRef: RoleRef | null): RoleGrantPreview {
  const roles = roleRef ? ROLES_COVERED[roleRef] : [];

  return useQueries({
    queries: roles.map((role) => ({
      queryKey: ['channels', wsId, 'role-count', role] as const,
      queryFn: () => grantsService.countRoleMembers(wsId, role),
      staleTime: 60_000,
    })),
    combine: (results) => ({
      isLoading: results.some((result) => result.isLoading),
      total:
        results.length > 0 && results.every((result) => result.data !== undefined)
          ? results.reduce((sum, result) => sum + (result.data ?? 0), 0)
          : undefined,
    }),
  });
}
