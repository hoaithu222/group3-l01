import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type {
  CursorPage,
  OfferDetail,
  OfferItem,
  OfferMessage,
  OfferMessageCreatedEvent,
  OfferUpdatedEvent,
} from '../api/recruiter.types';
import { offerKeys } from '../queries/offers.keys';
import { isThreadActive } from './active-thread';

type ListData = InfiniteData<CursorPage<OfferItem>, string | undefined>;
type MessagesData = InfiniteData<CursorPage<OfferMessage>, string | undefined>;

/** Đặt tin server vừa trả vào ĐẦU trang mới nhất (không chờ `offer:message-created` rồi tải lại) — bỏ qua nếu đã có, tránh hiện hai lần. */
export function insertSavedMessage(qc: QueryClient, offerId: string, saved: OfferMessage): void {
  qc.setQueryData<MessagesData>(offerKeys.messages(offerId), (old) => {
    const first = old?.pages[0];
    if (!old || !first || old.pages.some((page) => page.items.some((m) => m.id === saved.id)))
      return old;
    return { ...old, pages: [{ ...first, items: [saved, ...first.items] }, ...old.pages.slice(1)] };
  });
}

/** Vá MỘT lời mời trong danh sách (mọi trang). Trả `false` khi lời mời chưa có trong cache — nơi gọi quyết định có tải lại danh sách không. */
function patchOfferInList(qc: QueryClient, offerId: string, patch: Partial<OfferItem>): boolean {
  let found = false;
  qc.setQueryData<ListData>(offerKeys.list(), (old) => {
    if (!old) return old;
    return {
      ...old,
      pages: old.pages.map((page) => ({
        ...page,
        items: page.items.map((item) => {
          if (item.id !== offerId) return item;
          found = true;
          return { ...item, ...patch };
        }),
      })),
    };
  });
  return found;
}

/** `threadOpen` của BE = đang `INTERESTED` && chưa khoá (đã tính cả công ty tạm ngưng) — tính lại khi vá để nút "Trao đổi" đổi ngay, không chờ tải lại. */
export function patchOfferDetail(
  qc: QueryClient,
  offerId: string,
  patch: Partial<OfferDetail>,
): void {
  qc.setQueryData<OfferDetail>(offerKeys.detail(offerId), (old) => {
    if (!old) return old;
    const next = { ...old, ...patch };
    return { ...next, threadOpen: next.status === 'INTERESTED' && !next.threadLocked };
  });
}

/**
 * Đồng bộ dòng trong danh sách theo bản chi tiết VỪA tải (trạng thái, đã đọc, khoá thread, chưa đọc). Cần vì `GET /me/offers/:id` có tác dụng phụ `SENT → READ`: nếu chỉ chờ
 * `offer:updated` (qua worker) thì danh sách vẫn hiện "Mới" + chấm chưa đọc một lúc sau khi người dùng đã đọc xong; chi tiết luôn mới hơn danh sách.
 */
export function patchListFromDetail(qc: QueryClient, detail: OfferDetail): void {
  patchOfferInList(qc, detail.id, {
    readAt: detail.readAt,
    status: detail.status,
    threadLocked: detail.threadLocked,
    unreadMessages: detail.unreadMessages,
  });
}

/** Sau khi phản hồi (Quan tâm/Từ chối) máy chủ trả bản chi tiết mới: ghi vào cache chi tiết và vá dòng tương ứng của danh sách. */
export function applyOfferDetail(qc: QueryClient, detail: OfferDetail): void {
  qc.setQueryData(offerKeys.detail(detail.id), detail);
  patchListFromDetail(qc, detail);
}

/** Mở thread là server đặt lại "chưa đọc" của phía mình — vá cache theo để chấm/số trên danh sách tắt ngay. */
export function clearUnread(qc: QueryClient, offerId: string): void {
  patchOfferInList(qc, offerId, { unreadMessages: 0 });
  patchOfferDetail(qc, offerId, { unreadMessages: 0 });
}

/**
 * Socket `offer:updated` → vá chi tiết + danh sách rồi đánh dấu chi tiết cũ (ai đang mở màn thì tải lại: trạng thái công ty, ngày…).
 * ⚠️ Lời mời MỚI (chưa có trong danh sách) không vá được — tải lại danh sách. Payload không có tiêu đề/nội dung (CR-47) nên không tự dựng được dòng.
 */
export function applyOfferUpdate(qc: QueryClient, event: OfferUpdatedEvent): void {
  const patch = { status: event.status, threadLocked: event.threadLocked };
  if (!patchOfferInList(qc, event.offerId, patch))
    void qc.invalidateQueries({ queryKey: offerKeys.list() });
  patchOfferDetail(qc, event.offerId, patch);
  void qc.invalidateQueries({ queryKey: offerKeys.detail(event.offerId) });
}

/**
 * Socket `offer:message-created` (KHÔNG có nội dung — gọi REST lấy lại). Thread đang mở: chỉ tải lại tin (server tự đặt lại chưa đọc).
 * Ngược lại và là tin của DOANH NGHIỆP: tải lại danh sách/chi tiết để có số chưa đọc chính xác từ server (không tự cộng: có thể đã đọc ở máy khác).
 * Tin của chính mình (`CANDIDATE`) cũng được phát lại cho mình — bỏ qua phần chưa đọc.
 */
export function applyOfferMessage(qc: QueryClient, event: OfferMessageCreatedEvent): void {
  void qc.invalidateQueries({ queryKey: offerKeys.messages(event.offerId) });
  if (isThreadActive(event.offerId) || event.side === 'CANDIDATE') return;
  void qc.invalidateQueries({ queryKey: offerKeys.list() });
  void qc.invalidateQueries({ queryKey: offerKeys.detail(event.offerId) });
}
