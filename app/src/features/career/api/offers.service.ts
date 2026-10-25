import { apiClient } from '@/core/api/client';
import { unwrapData } from '@/core/api/unwrap';

import {
  MY_OFFERS_PATH,
  offerDeclinePath,
  offerInterestedPath,
  offerMessagesPath,
  offerPath,
} from './recruiter.api';
import type {
  CursorPage,
  DeclineReason,
  OfferDetail,
  OfferItem,
  OfferMessage,
  SendMessagePayload,
} from './recruiter.types';

/** Số lời mời một trang — trần của BE (`LIMITS.offer.listPageMax`); sinh viên hiếm khi có quá vài chục lời mời nên thường chỉ một trang. */
const OFFERS_PAGE_SIZE = 50;
const MESSAGES_PAGE_SIZE = 30;

// ⚠️ Cursor: đọc `data` + `meta` ở gốc thân phản hồi (`ResponseUtils.cursor`) — `unwrapData` vứt `meta`, mất `nextCursor`.
// `export`: `profile-views.service.ts` (`GET /me/profile-views`, cùng khuôn `ResponseUtils.cursor`) dùng lại, không viết bản thứ hai.
export async function cursorList<T>(
  url: string,
  params: Record<string, unknown>,
): Promise<CursorPage<T>> {
  const response = await apiClient.get<{ data: T[]; meta: { nextCursor: string | null } }>(url, {
    params,
    skipErrorToast: true,
  });
  return { items: response.data.data, nextCursor: response.data.meta?.nextCursor ?? null };
}

/**
 * Lời mời phía SINH VIÊN + thread trao đổi (be.md §4). Mọi lời gọi `skipErrorToast`: màn tự hiện lỗi đúng chỗ (404 "Lời mời không còn",
 * `RECR_009` làm mới + toast riêng, `RECR_008` đổi ô soạn thành thông báo đóng) — để interceptor toast thêm là toast hai lần.
 */
export const offersService = {
  list(cursor?: string): Promise<CursorPage<OfferItem>> {
    return cursorList<OfferItem>(MY_OFFERS_PATH, { cursor, limit: OFFERS_PAGE_SIZE });
  },

  /** ⚠️ Có TÁC DỤNG PHỤ: lần đầu mở, server chuyển `SENT → READ` và báo doanh nghiệp. */
  async get(offerId: string): Promise<OfferDetail> {
    return unwrapData<OfferDetail>(
      await apiClient.get(offerPath(offerId), { skipErrorToast: true }),
    );
  },

  /** `shareEmail` mặc định tắt ở UI — bật là chốt bản chụp email gửi doanh nghiệp NGAY lúc bấm. */
  async interested(offerId: string, shareEmail: boolean): Promise<OfferDetail> {
    return unwrapData<OfferDetail>(
      await apiClient.post(offerInterestedPath(offerId), { shareEmail }, { skipErrorToast: true }),
    );
  },

  async decline(offerId: string, reason: DeclineReason): Promise<OfferDetail> {
    return unwrapData<OfferDetail>(
      await apiClient.post(offerDeclinePath(offerId), { reason }, { skipErrorToast: true }),
    );
  },

  /** Mới nhất TRƯỚC; `nextCursor` trỏ về tin CŨ hơn. Mở thread là server đặt lại "chưa đọc" của phía mình. */
  messages(offerId: string, cursor?: string): Promise<CursorPage<OfferMessage>> {
    return cursorList<OfferMessage>(offerMessagesPath(offerId), {
      cursor,
      limit: MESSAGES_PAGE_SIZE,
    });
  },

  /** Idempotent theo `clientMessageId`: gửi lại cùng id trả về đúng tin đã tạo (200 thay vì 201), không nhân đôi. */
  async sendMessage(offerId: string, payload: SendMessagePayload): Promise<OfferMessage> {
    return unwrapData<OfferMessage>(
      await apiClient.post(offerMessagesPath(offerId), payload, { skipErrorToast: true }),
    );
  },
};
