import type { BlockPort } from "../../../shared/ports/block.port";
import { getBlockPort } from "../../blocks/public";

/** Phần `BlockPort` (p1-08) mà pipeline thông báo cần: bỏ khỏi danh sách những người ĐÃ CHẶN người gửi. */
export type NotificationBlockFilter = Pick<BlockPort, "filterNotificationRecipients">;

let override: NotificationBlockFilter | null = null;

/**
 * Bộ lọc người đã chặn tác giả (NT-14): người ĐÃ CHẶN tác giả không nhận mục hộp thư mention/thread và không
 * nhận push. Mặc định dùng `getBlockPort()` của `@modules/blocks/public` (p1-08; cache Redis, fail-open về DB) —
 * KHÔNG đọc `UserBlock` trực tiếp. `setNotificationBlockFilter` chỉ để test/DI tường minh.
 * Tách file riêng (không kéo cả wiring) để export qua `public.ts` không tạo vòng import.
 */
export function setNotificationBlockFilter(filter: NotificationBlockFilter | null): void {
  override = filter;
}

export function getNotificationBlockFilter(): NotificationBlockFilter {
  return override ?? getBlockPort();
}
