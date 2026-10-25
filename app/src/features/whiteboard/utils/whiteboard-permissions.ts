import type { WhiteboardView } from '../api/whiteboard.types';

/**
 * Có nên HIỆN các thao tác quản lý (đổi tên, lưu trữ, khôi phục) ở MỘT HÀNG trong danh sách không — suy từ `myRole` của hàng + vai trong nhóm:
 * người tạo luôn quản lý được; quản trị nhóm (OWNER/ADMIN) quản lý bảng WORKSPACE (PRIVATE thì họ không thấy trừ khi là người tạo/cộng tác viên).
 *
 * ⚠️ Chỉ để ẩn/hiện menu cho gọn — danh sách KHÔNG có `myPermissions` (chỉ `GET /whiteboards/:id` mới có, do server tính). Suy sai thì BE trả 403
 * và câu lỗi hiện đúng chỗ; hàng rào thật luôn ở BE. Trong màn vẽ/chia sẻ dùng `myPermissions.manage` (chính xác), không dùng hàm này.
 */
export function canManageFromList(
  board: WhiteboardView,
  workspaceRole: string | undefined,
): boolean {
  if (board.myRole === 'CREATOR') return true;
  return (
    board.visibility === 'WORKSPACE' && (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN')
  );
}
