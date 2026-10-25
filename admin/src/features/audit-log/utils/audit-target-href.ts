import type { AuditLogDto } from '../types/audit-log.types';

/** `id` từ BE đi vào đường dẫn → mã hoá để không chèn được `/`, `?`, `#` vào URL nội bộ. */
const seg = encodeURIComponent;

/** Đích của cột/khối "Workspace" — trang chi tiết workspace. */
export function auditWorkspaceHref(workspaceId: string): string {
  return `/workspace/${seg(workspaceId)}`;
}

/**
 * Tab của trang `system-config` chứa một khoá registry. Phần lớn khoá có tab = phần trước dấu chấm
 * (`limits.message` → `limits`, `features`), NGOẠI LỆ theo `tab` mà registry BE khai — bảng này khoá các
 * ngoại lệ (nếu không, link từ nhật ký rơi vào tab không tồn tại và trang bật tab đầu tiên).
 */
const SYSTEM_CONFIG_TAB_BY_KEY: Readonly<Record<string, string>> = {
  'notification.defaults': 'notifications',
  'limits.resource': 'storage',
  resource: 'storage',
  'limits.board': 'pm',
  'limits.task': 'pm',
};

function systemConfigTab(key: string): string {
  return SYSTEM_CONFIG_TAB_BY_KEY[key] ?? key.split('.')[0];
}

/**
 * Đích điều hướng của "đối tượng" trong một dòng nhật ký — `null` khi phân hệ đích
 * chưa có trang (job/outbox/kênh…).
 *
 * ⛔ Viết thẳng chuỗi path, KHÔNG import `MODULE_PATHS`: trang audit-log do chính
 * registry lazy-load, import ngược `module-registry` khép vòng (`check:cycles`) —
 * cùng lý do đã ghi ở `WorkspaceListPage`/`UserDetailPage`. Path ở đây khớp
 * `user.routes.tsx` / `workspace.routes.tsx` / `system-config.routes.tsx` / `moderation.routes.tsx`.
 */
export function auditTargetHref(
  row: Pick<AuditLogDto, 'targetType' | 'targetId' | 'workspaceId'>,
): string | null {
  const { targetType, targetId, workspaceId } = row;
  switch (targetType.toLowerCase()) {
    case 'user':
      return `/user/${seg(targetId)}`;
    case 'workspace':
      return auditWorkspaceHref(targetId);
    case 'workspacemembership': {
      // `targetId` của membership có dạng `<workspaceId>:<userId>`.
      const ws = targetId.split(':')[0];
      return ws ? `${auditWorkspaceHref(ws)}?tab=members` : null;
    }
    case 'channel':
      return workspaceId ? `${auditWorkspaceHref(workspaceId)}?tab=channels` : null;
    case 'systemconfig':
      return `/system-config?tab=${seg(systemConfigTab(targetId))}`;
    case 'workspaceinvitation':
      // Lời mời email: `targetId` là id lời mời (không có workspace) — dẫn về tab thành viên qua `workspaceId`.
      return workspaceId ? `${auditWorkspaceHref(workspaceId)}?tab=members` : null;
    case 'report':
      // Kiểm duyệt (p1-08): BE ghi `targetType: 'Report'`, `targetId` = báo cáo ĐẠI DIỆN của nhóm — đúng `:id`
      // của `/moderation/:id` (chi tiết nhóm báo cáo). Gồm `moderation.view-private`, `remove-content`, `dismiss`…
      return `/moderation/${seg(targetId)}`;
    default:
      return null;
  }
}

/** `metadata` có cặp trước/sau không (`before/after` hoặc `from/to`) — để drawer dựng khối so sánh. */
export function extractBeforeAfter(metadata: unknown): { before: unknown; after: unknown } | null {
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return null;
  const m = metadata as Record<string, unknown>;
  if ('before' in m && 'after' in m) return { before: m.before, after: m.after };
  if ('from' in m && 'to' in m) return { before: m.from, after: m.to };
  return null;
}
