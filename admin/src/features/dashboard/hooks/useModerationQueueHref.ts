import { useFeature } from '@/app/capabilities';
import { MODULE_BY_ID } from '@/app/router/modules/module-registry';
import { useAuthStore } from '@/app/store';

/**
 * Đường dẫn hàng đợi kiểm duyệt đã lọc `OPEN` — hoặc `undefined` khi KHÔNG nên dẫn người dùng tới đó: thiếu `moderation:view`, cờ `communication`
 * tắt (route trả trang "Chưa bật") hoặc phân hệ không có trong registry. Nơi gọi `undefined` ⇒ hiện chữ thường, không dựng liên kết chết.
 */
export function useModerationQueueHref(): string | undefined {
  const canView = useAuthStore((s) => s.hasPermission('moderation', 'view'));
  const communication = useFeature('communication');
  const path = MODULE_BY_ID.moderation?.path;
  if (!canView || communication === false || !path) return undefined;
  return `${path}?status=OPEN`;
}
