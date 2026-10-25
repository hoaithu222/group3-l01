/**
 * Quyền ĐỔI TRỌNG SỐ = quyền sửa bảng (`BOARD_EDIT`, README p4-06 §6: OWNER/ADMIN). Đọc từ `myPermissions` mà `GET /boards/:id` trả —
 * ⛔ KHÔNG suy quyền từ vai trò trong nhóm: BE mới là nơi quyết định (và vẫn kiểm lại ở `PUT`).
 *
 * Khoá THẬT của BE là `workspace.board.edit` (`be/src/core/permission/actions.ts`); README gọi nó là `BOARD_EDIT`. Chuẩn hoá bỏ
 * tiền tố `workspace.` và đọc được CẢ hai cách viết — đổi cú pháp phía BE không làm nút "Đổi trọng số" biến mất im lặng.
 * (Viết lại thay vì import `boards/utils/board-permissions`: feature không import chéo nhau.)
 */
function canonical(key: string): string {
  return key
    .replace(/^workspace[._-]/i, '')
    .toUpperCase()
    .replace(/[.\-\s]/g, '_');
}

export function canEditBoard(myPermissions: readonly string[] | undefined): boolean {
  if (!myPermissions) return false;
  const keys = new Set(myPermissions.map(canonical));
  return keys.has('BOARD_EDIT') || keys.has('BOARD_UPDATE');
}
