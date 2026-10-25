import type { DocumentView } from '../api/docs.types';

/**
 * Có nên HIỆN các thao tác quản lý (đổi tên, lưu trữ, khôi phục) ở MỘT HÀNG trong danh sách không — suy từ `myRole` của hàng + vai trong nhóm:
 * người tạo luôn quản lý được; quản trị nhóm (OWNER/ADMIN) quản lý tài liệu WORKSPACE (PRIVATE thì họ không thấy trừ khi là người tạo/cộng tác viên).
 *
 * ⚠️ Chỉ để ẩn/hiện menu cho gọn — danh sách KHÔNG có `myPermissions` (chỉ `GET /documents/:id` mới có, do server tính). Suy sai thì BE trả 403 và
 * câu lỗi hiện đúng chỗ; hàng rào thật luôn ở BE. Trong màn soạn thảo/chia sẻ dùng `myPermissions.manage` (chính xác), không dùng hàm này.
 */
export function canManageFromList(doc: DocumentView, workspaceRole: string | undefined): boolean {
  if (doc.myRole === 'CREATOR') return true;
  return doc.visibility === 'WORKSPACE' && (workspaceRole === 'OWNER' || workspaceRole === 'ADMIN');
}
