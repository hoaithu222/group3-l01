import { isAxiosError } from 'axios';

import { getErrorCode } from '@/core/api/client.helpers';
import type { TemplateSelection } from '@/shared/workspace-templates';

/**
 * `POST /workspaces` từ chối `templateCode` (be.md p5-04 §5): mẫu không còn/đã tắt (`TPL_001`) hoặc cờ phụ `workspaceTemplates`
 * vừa tắt (`CFG_005`) — cả hai đều 404 và đều xử lý MỘT cách: bỏ mẫu, cho tạo nhóm trơn. Chỉ nhận diện ở mức hợp đồng của
 * endpoint tạo nhóm; nhãn/lỗi CỦA mẫu (`TPL_002`, `TPL_003`…) thuộc feature `workspace-templates`.
 */
export function isTemplateRejected(error: unknown): boolean {
  if (!isAxiosError(error) || error.response?.status !== 404) return false;
  const code = getErrorCode(error);
  return code === 'TPL_001' || code === 'CFG_005';
}

export const TEMPLATE_REJECTED_NOTICE =
  'Mẫu vừa bị tắt hoặc không còn — đã chuyển về “Không dùng mẫu”. Bạn có thể tạo nhóm ngay.';

/**
 * Phần `templateCode`/`channelKeys` của body tạo nhóm. Không chọn mẫu ⇒ KHÔNG gửi gì (BE từ chối `channelKeys` thiếu
 * `templateCode`); chọn mẫu mà bỏ tick hết ⇒ `channelKeys: []` (dùng mẫu nhưng không tạo kênh nào — hợp lệ).
 */
export function templateBody(selection: TemplateSelection | null): {
  channelKeys?: string[];
  templateCode?: string;
} {
  return selection ? { channelKeys: selection.channelKeys, templateCode: selection.code } : {};
}

/** Chữ ký của body tạo nhóm cho `useIdempotencyKey`: đổi tên/mô tả/mẫu/tập kênh ⇒ khoá mới. */
export function createSignature(
  values: { description?: string; name?: string },
  selection: TemplateSelection | null,
): string {
  return JSON.stringify([
    values.name?.trim() ?? '',
    values.description?.trim() ?? '',
    selection?.code ?? null,
    selection ? [...selection.channelKeys].sort() : null,
  ]);
}
