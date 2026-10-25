import type { Href } from 'expo-router';

import type { NotificationTarget } from './notification-target.types';

/**
 * p4-06 (báo cáo đóng góp): xuất PDF xong / lỗi → mở màn "Đóng góp" của BẢNG kèm `?exportId=` (màn tự hiện trạng thái + nút "Mở PDF" hoặc "Thử lại").
 * Push/hộp thư chỉ mang id (`exportId`, `boardId`, `workspaceId` — không tên thành viên, không số liệu). Thiếu `boardId`/`workspaceId` → `null` (rơi về hộp thư).
 * Tách khỏi `notification-route.ts` để file đó giữ trong trần độ dài.
 *
 * ⚠️ Ép kiểu `as Href` vì route mới chưa chắc đã có trong `.expo/types/router.d.ts` (sinh lúc `expo start`); chuỗi thật đúng ở mọi trường hợp — cùng lý do
 * `boards/utils/board-routes.ts`. Thay đổi đường dẫn phải sửa CẢ `features/contribution/utils/contribution-routes.ts`.
 */
export function isContributionExportType(type: string): boolean {
  return type === 'contribution.export-ready' || type === 'contribution.export-failed';
}

export function contributionExportHref({ boardId, exportId, workspaceId }: NotificationTarget): Href | null {
  if (!boardId || !workspaceId) return null;
  const query = exportId ? `?exportId=${encodeURIComponent(exportId)}` : '';
  return `/workspaces/${workspaceId}/boards/${boardId}/contribution${query}` as Href;
}
