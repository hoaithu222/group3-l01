import { useCallback, useMemo } from 'react';

/**
 * `myPermissions` là mảng action BACKEND trả trong DTO chi tiết
 * (`buildMyPermissions()`, be.md §2.3 tương ứng) — UI ẩn/hiện nút theo mảng
 * này, ⛔ KHÔNG tự suy từ `role` (app.md §4 của p0-02: "Client không tự suy
 * vai trò"). Vai trò có thể đủ ĐIỀU KIỆN nhưng vẫn thiếu quyền cụ thể (custom
 * role, Phase 2 — p7-01), nên chỉ mảng action mới là nguồn đúng.
 *
 * ```tsx
 * const canAddMember = usePermission(detail.myPermissions, 'conversation.member.add');
 * ```
 */
export function usePermission(
  myPermissions: readonly string[] | undefined,
  action: string,
): boolean {
  return useMemo(() => !!myPermissions?.includes(action), [myPermissions, action]);
}

/**
 * Biến thể trả về HÀM kiểm tra — tiện khi 1 màn hình cần hỏi nhiều action
 * (thay vì gọi `usePermission` lặp lại nhiều lần với cùng `myPermissions`).
 *
 * ```tsx
 * const can = useCan(detail.myPermissions);
 * {can('conversation.dissolve') && <DissolveButton />}
 * ```
 */
export function useCan(myPermissions: readonly string[] | undefined): (action: string) => boolean {
  return useCallback((action: string) => !!myPermissions?.includes(action), [myPermissions]);
}
