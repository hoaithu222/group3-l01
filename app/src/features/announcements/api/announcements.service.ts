import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import { announcementPaths } from './announcements.api';
import type {
  AnnouncementView,
  ConfirmResult,
  CreateAnnouncementInput,
  ReceiptStatus,
  ReceiptsMeta,
  ReceiptsPage,
  ReceiptItem,
} from './announcements.types';

/**
 * ⛔ Mọi request dùng `skipErrorToast`: lỗi `ANN_*`/`CH_004` được feature này hiện bằng nhãn riêng (`utils/error-info.ts`),
 * còn bảng mã chung của app chưa có `ANN_*` — để interceptor toast thì hiện nguyên văn BE và toast hai lần.
 *
 * ⛔ Danh sách xác nhận đọc `response.data.data` + `response.data.meta` TRỰC TIẾP, không `unwrapData`: BE trả
 * `{ success, data: [...], meta }` ở gốc thân, `unwrapData` bóc `.data` và VỨT `meta` (cùng bẫy `chatService.list`).
 */
export const announcementsService = {
  async listByChannel(channelId: string): Promise<AnnouncementView[]> {
    const response = await apiClient.get<AnnouncementView[]>(announcementPaths.channel(channelId), {
      skipErrorToast: true,
    });
    return unwrapData<AnnouncementView[]>(response);
  },

  /** 201 khi tạo/khôi phục, 200 khi đã có yêu cầu còn hiệu lực (idempotent) — cả hai trả `AnnouncementView`. */
  async create({ messageId, deadlineAt }: CreateAnnouncementInput): Promise<AnnouncementView> {
    const response = await apiClient.post<AnnouncementView>(
      announcementPaths.message(messageId),
      deadlineAt ? { deadlineAt } : {},
      { skipErrorToast: true },
    );
    return unwrapData<AnnouncementView>(response);
  },

  async cancel(messageId: string): Promise<void> {
    await apiClient.delete(announcementPaths.message(messageId), { skipErrorToast: true });
  },

  async confirm(messageId: string): Promise<ConfirmResult> {
    const response = await apiClient.post<ConfirmResult>(
      announcementPaths.confirm(messageId),
      undefined,
      {
        skipErrorToast: true,
      },
    );
    return unwrapData<ConfirmResult>(response);
  },

  async listReceipts(
    messageId: string,
    params: { status: ReceiptStatus; cursor?: string; limit?: number },
  ): Promise<ReceiptsPage> {
    const response = await apiClient.get<{ data: ReceiptItem[]; meta: ReceiptsMeta }>(
      announcementPaths.receipts(messageId),
      { params, skipErrorToast: true },
    );
    return { data: response.data.data, meta: response.data.meta };
  },
};
