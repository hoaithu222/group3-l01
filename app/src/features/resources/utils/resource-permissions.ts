import type { WorkspaceStatus } from '../api';

export interface ExplorerCapabilities {
  canCreateFolder: boolean;
  canUpload: boolean;
  /** Workspace ARCHIVED ⇒ chỉ xem/tải (mọi thao tác ghi bị BE từ chối `403 PERM_001`). */
  readOnly: boolean;
}

/**
 * Quyền cấp KHO — CHỈ suy từ `status` của workspace, KHÔNG từ vai trò.
 *
 * Quyền theo MỤC không nằm ở đây: BE trả cờ server tính sẵn (`canModify` trên mỗi
 * `FolderDto`/`ResourceDto`, `canRestore`/`canPurge` trên mỗi mục thùng rác,
 * `myPermissions` ở `GET /resources/:id`) và client chỉ ĐỌC chúng (02-conventions §2).
 *
 * ⚠️ BE KHÔNG có cờ cấp kho cho "tải lên"/"tạo thư mục" ở danh sách/thư mục. Ma trận
 * hiện tại của BE cho MỌI người đọc được kho (OWNER/ADMIN/MEMBER — GUEST nhận 404, không
 * bao giờ tới màn này) cả `resource.upload` lẫn `folder.manage` khi workspace ACTIVE, nên
 * "ACTIVE" là điều kiện đủ để HIỆN nút; BE vẫn là hàng rào (403 → toast). Còn mở với BE:
 * trả `myPermissions: Action[]` ở `GET /workspaces/:id/folders` để bỏ giả định này.
 *
 * `status` chưa biết (đang tải / lỗi) ⇒ mọi quyền ghi TẮT: thà giấu nút một nhịp còn hơn
 * hiện nút rồi 403.
 */
export function resolveExplorerCapabilities(
  status: WorkspaceStatus | undefined,
): ExplorerCapabilities {
  const writable = status === 'ACTIVE';
  return {
    canCreateFolder: writable,
    canUpload: writable,
    readOnly: status === 'ARCHIVED',
  };
}
