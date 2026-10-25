import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef } from 'react';

import { SocketEvent, useConnectionState, useSocketEvent } from '@/core/socket';

import type {
  CompanyUpdatedEvent,
  OfferMessageCreatedEvent,
  OfferUpdatedEvent,
} from '../api/recruiter.types';
import { offerKeys } from '../queries/offers.keys';
import { applyOfferMessage, applyOfferUpdate } from '../utils/offer-cache';

/**
 * Socket của lời mời → cache (app.md §4): `offer:updated` vá chi tiết + danh sách (nút Quan tâm biến mất ngay khi doanh nghiệp thu hồi),
 * `offer:message-created` tải lại tin của thread đang mở, `company:updated` làm mới tất cả. Payload KHÔNG có nội dung nên luôn kết thúc
 * bằng một lượt tải lại từ REST — không bao giờ dựng dữ liệu từ sự kiện.
 *
 * ⚠️ Mất kết nối là LỠ sự kiện: khi nối lại (từ trạng thái không-`connected`) tải lại toàn bộ thay vì tin vào cache. Gọi được ở nhiều màn cùng lúc
 * (danh sách, chi tiết, thread đều đang nằm trong ngăn xếp) — mọi bước đều idempotent nên chỉ tốn vài lượt vá thừa.
 */
export function useOfferEvents(): void {
  const qc = useQueryClient();
  const connection = useConnectionState();
  const wasConnected = useRef(connection === 'connected');

  useSocketEvent<OfferUpdatedEvent>(SocketEvent.OFFER_UPDATED, (event) =>
    applyOfferUpdate(qc, event),
  );
  useSocketEvent<OfferMessageCreatedEvent>(SocketEvent.OFFER_MESSAGE_CREATED, (event) =>
    applyOfferMessage(qc, event),
  );
  useSocketEvent<CompanyUpdatedEvent>(SocketEvent.COMPANY_UPDATED, () => {
    void qc.invalidateQueries({ queryKey: offerKeys.all });
  });

  useEffect(() => {
    if (connection === 'connected' && !wasConnected.current) {
      void qc.invalidateQueries({ queryKey: offerKeys.all });
    }
    wasConnected.current = connection === 'connected';
  }, [connection, qc]);
}
