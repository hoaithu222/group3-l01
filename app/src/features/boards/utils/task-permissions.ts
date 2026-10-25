import type { TaskDetailDto } from '../api/task-detail.types';

export interface TaskAccess {
  canAttach: boolean;
  canComment: boolean;
  canDelete: boolean;
  canEdit: boolean;
  canRestore: boolean;
  /** Thẻ đang ở thùng rác (mở từ link) — chỉ hiện banner "Khôi phục", không sửa gì. */
  deleted: boolean;
  /** Vì sao chỉ-đọc — để hiện đúng câu (không chỉ ẩn nút một cách bí ẩn). */
  readOnlyReason: 'archived' | 'deleted' | 'loading' | 'offline' | 'permission' | null;
}

export interface TaskAccessContext {
  /** Bảng hoặc nhóm đã lưu trữ — README §6 dòng cuối: chỉ xem. */
  archived: boolean;
  offline: boolean;
  /** Đang dùng bản giữ chỗ dựng từ thẻ mini: chưa biết quyền thật. */
  placeholder: boolean;
}

/**
 * Quyền của tôi trên MỘT thẻ = `myPermissions` BE trả (ma trận README §6) VÀ đang online VÀ bảng/nhóm
 * chưa lưu trữ VÀ thẻ chưa bị xoá (app.md §3 cột Offline: "ẩn nút sửa, composer 'Kết nối lại để gửi'").
 * ⛔ KHÔNG suy quyền từ vai trò — BE mới là nơi quyết định (GUEST luôn 404, không tới được đây).
 */
export function resolveTaskAccess(
  detail: TaskDetailDto | undefined,
  { archived, offline, placeholder }: TaskAccessContext,
): TaskAccess {
  const none: TaskAccess = {
    canAttach: false,
    canComment: false,
    canDelete: false,
    canEdit: false,
    canRestore: false,
    deleted: false,
    readOnlyReason: 'loading',
  };
  if (!detail || placeholder) return none;

  const deleted = Boolean(detail.deletedAt);
  const perms = detail.myPermissions;
  const blocked: TaskAccess['readOnlyReason'] = deleted
    ? 'deleted'
    : archived
      ? 'archived'
      : offline
        ? 'offline'
        : !perms.edit && !perms.comment
          ? 'permission'
          : null;
  const live = !deleted && !archived && !offline;

  return {
    canAttach: live && perms.attach,
    canComment: live && perms.comment,
    canDelete: live && perms.delete,
    canEdit: live && perms.edit,
    canRestore: deleted && !archived && !offline && (perms.restore ?? perms.delete),
    deleted,
    readOnlyReason: blocked,
  };
}
