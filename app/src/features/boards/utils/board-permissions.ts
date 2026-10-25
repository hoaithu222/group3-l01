import type { WorkspaceBoardAccess } from '../api/boards.types';

/**
 * Quyền của tôi trên một bảng, đọc từ `BoardDetail.myPermissions` (mảng khoá
 * BE trả — be.md §4). Ma trận quyền: README §6.
 *
 * Khoá THẬT của BE (`be/src/core/permission/actions.ts`, D-28): `workspace.board.read`
 * · `.create` · `.edit`, `workspace.task.create` · `.update` · `.status` (kéo thẻ/đổi cột)
 * · `.delete` · `.comment`. README §6 gọi chúng là `BOARD_EDIT`, `TASK_UPDATE_STATUS`…
 * nên `canonical()` bỏ tiền tố `workspace.` và đọc được CẢ hai cách viết — đổi cú
 * pháp phía BE không làm app mất quyền im lặng.
 * ⛔ KHÔNG suy quyền từ vai trò trong nhóm — BE mới là nơi quyết định.
 */
export interface BoardPermissions {
  /** Sửa tên/cột/nhãn xoá, lưu trữ (OWNER/ADMIN — `BOARD_EDIT`). */
  canEdit: boolean;
  /** Tạo thẻ (`TASK_CREATE`). */
  canCreateTask: boolean;
  /** Kéo thẻ/đổi cột (`TASK_UPDATE_STATUS`). */
  canMoveTask: boolean;
  /** Xoá thẻ của người khác (`TASK_DELETE`). */
  canDeleteAnyTask: boolean;
}

function canonical(key: string): string {
  return key
    .replace(/^workspace[._-]/i, '')
    .toUpperCase()
    .replace(/[.\-\s]/g, '_');
}

export const READ_ONLY_PERMISSIONS: BoardPermissions = {
  canCreateTask: false,
  canDeleteAnyTask: false,
  canEdit: false,
  canMoveTask: false,
};

export function resolveBoardPermissions(
  myPermissions: readonly string[] | undefined,
  options: { archived?: boolean } = {},
): BoardPermissions {
  // Bảng/nhóm đã lưu trữ ⇒ chỉ xem, dù BE có gửi quyền (README §6 dòng cuối).
  if (!myPermissions || options.archived) return READ_ONLY_PERMISSIONS;
  const keys = new Set(myPermissions.map(canonical));
  const has = (...names: string[]) => names.some((name) => keys.has(name));
  return {
    canCreateTask: has('TASK_CREATE'),
    canDeleteAnyTask: has('TASK_DELETE'),
    canEdit: has('BOARD_EDIT', 'BOARD_UPDATE'),
    canMoveTask: has('TASK_STATUS', 'TASK_UPDATE_STATUS'),
  };
}

/**
 * Tạo/sao chép bảng trong nhóm (`workspace.board.create` — OWNER/ADMIN của nhóm ĐANG hoạt động, README §6). Quyền này KHÔNG nằm trong
 * `BoardDetail.myPermissions` (chỉ có tập của phạm vi bảng) nên đọc từ vai trò + trạng thái nhóm mà `GET /workspaces/:id` trả — cùng
 * điều kiện với nút "Tạo bảng" ở `BoardListScreen`. BE vẫn là nơi quyết định (MEMBER → 403, hiện thành lỗi trong tấm).
 */
export function canCreateBoard(access: WorkspaceBoardAccess | undefined): boolean {
  return access?.status === 'ACTIVE' && (access.myRole === 'OWNER' || access.myRole === 'ADMIN');
}

/**
 * Có ÍT NHẤT một khoá quyền trong `names` không — cho quyền chưa nằm trong `BoardPermissions` (p3-03 thêm
 * `TASK_UPDATE`: sửa trường của thẻ, ví dụ "Giao cho tôi"). Dùng cùng cách chuẩn hoá khoá với
 * `resolveBoardPermissions` nên đọc được cả `workspace.task.update` lẫn `TASK_UPDATE`. Không đổi hình dạng
 * `BoardPermissions` để các nơi và test đang so sánh nguyên object không phải sửa.
 */
export function hasBoardPermission(
  myPermissions: readonly string[] | undefined,
  ...names: string[]
): boolean {
  if (!myPermissions) return false;
  const keys = new Set(myPermissions.map(canonical));
  return names.some((name) => keys.has(name));
}
