import { QueryClient, type InfiniteData } from '@tanstack/react-query';

import type { CursorPage, OfferDetail, OfferItem, OfferMessage } from '../api/recruiter.types';
import { offerKeys } from '../queries/offers.keys';
import { setActiveThread } from '../utils/active-thread';
import {
  applyOfferMessage,
  applyOfferUpdate,
  clearUnread,
  insertSavedMessage,
  patchOfferDetail,
} from '../utils/offer-cache';
import { makeDetail, makeMessage, makeOffer } from './jobs-fixtures';

/** Vá cache theo socket của Recruiter board (p6-08): `offer:updated`/`offer:message-created` vá tại chỗ, không dựng dữ liệu từ payload (không có tiêu đề/nội dung — CR-47). */
describe('vá cache theo socket', () => {
  type ListData = InfiniteData<CursorPage<OfferItem>, string | undefined>;
  const listOf = (items: OfferItem[]): ListData => ({
    pageParams: [undefined],
    pages: [{ items, nextCursor: null }],
  });
  const newClient = () =>
    new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false } } });

  it('offer:updated vá ngay dòng danh sách và chi tiết; threadOpen tính lại (khoá thread ⇒ đóng)', () => {
    const qc = newClient();
    qc.setQueryData(offerKeys.list(), listOf([makeOffer({ status: 'INTERESTED' })]));
    qc.setQueryData(offerKeys.detail('o1'), makeDetail({ status: 'INTERESTED', threadOpen: true }));

    applyOfferUpdate(qc, {
      companyId: 'c1',
      offerId: 'o1',
      status: 'INTERESTED',
      threadLocked: true,
      v: 1,
    });

    expect(qc.getQueryData<ListData>(offerKeys.list())?.pages[0]?.items[0]?.threadLocked).toBe(
      true,
    );
    expect(qc.getQueryData<OfferDetail>(offerKeys.detail('o1'))?.threadOpen).toBe(false);
  });

  it('offer:updated cho lời mời CHƯA có trong danh sách ⇒ đánh dấu danh sách cũ để tải lại (payload không đủ dựng dòng)', () => {
    const qc = newClient();
    qc.setQueryData(offerKeys.list(), listOf([]));
    applyOfferUpdate(qc, {
      companyId: 'c1',
      offerId: 'moi',
      status: 'SENT',
      threadLocked: false,
      v: 1,
    });
    expect(qc.getQueryState(offerKeys.list())?.isInvalidated).toBe(true);
  });

  it('offer:message-created: tin của doanh nghiệp khi thread KHÔNG mở ⇒ tải lại danh sách; thread đang mở hoặc tin của chính mình ⇒ không đụng danh sách', () => {
    const qc = newClient();
    qc.setQueryData(offerKeys.list(), listOf([makeOffer()]));
    const event = { createdAt: '2026-09-27T00:00:00.000Z', messageId: 'm1', offerId: 'o1', v: 1 };

    applyOfferMessage(qc, { ...event, side: 'CANDIDATE' });
    expect(qc.getQueryState(offerKeys.list())?.isInvalidated).toBe(false);

    setActiveThread('o1');
    applyOfferMessage(qc, { ...event, side: 'COMPANY' });
    expect(qc.getQueryState(offerKeys.list())?.isInvalidated).toBe(false);

    setActiveThread(null);
    applyOfferMessage(qc, { ...event, side: 'COMPANY' });
    expect(qc.getQueryState(offerKeys.list())?.isInvalidated).toBe(true);
  });

  it('mở thread xoá chưa đọc trong cả danh sách lẫn chi tiết', () => {
    const qc = newClient();
    qc.setQueryData(offerKeys.list(), listOf([makeOffer({ unreadMessages: 4 })]));
    qc.setQueryData(offerKeys.detail('o1'), makeDetail({ unreadMessages: 4 }));
    clearUnread(qc, 'o1');
    expect(qc.getQueryData<ListData>(offerKeys.list())?.pages[0]?.items[0]?.unreadMessages).toBe(0);
    expect(qc.getQueryData<OfferDetail>(offerKeys.detail('o1'))?.unreadMessages).toBe(0);
  });

  it('insertSavedMessage đặt tin mới lên ĐẦU trang mới nhất và không nhân đôi khi socket/REST trả lại cùng tin', () => {
    const qc = newClient();
    const seed: InfiniteData<CursorPage<OfferMessage>, string | undefined> = {
      pageParams: [undefined],
      pages: [{ items: [makeMessage({ id: 'm1' })], nextCursor: null }],
    };
    qc.setQueryData(offerKeys.messages('o1'), seed);
    const saved = makeMessage({ id: 'm2', side: 'CANDIDATE' });

    insertSavedMessage(qc, 'o1', saved);
    insertSavedMessage(qc, 'o1', saved);

    const data = qc.getQueryData<typeof seed>(offerKeys.messages('o1'));
    expect(data?.pages[0]?.items.map((m) => m.id)).toEqual(['m2', 'm1']);
  });

  it('patchOfferDetail không tạo dữ liệu từ hư không khi chi tiết chưa từng được tải', () => {
    const qc = newClient();
    patchOfferDetail(qc, 'o1', { status: 'WITHDRAWN' });
    expect(qc.getQueryData(offerKeys.detail('o1'))).toBeUndefined();
  });
});
