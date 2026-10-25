import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { useConnectionState } from '@/core/socket';
import { showToast } from '@/shared/utils/toast.utils';

import { offersService } from '../api/offers.service';
import { JOB_LIMITS } from '../constants/recruiter.constants';
import { offerKeys } from '../queries/offers.keys';
import { useOfferMessages } from '../queries/offers.queries';
import { setActiveThread } from '../utils/active-thread';
import { newClientMessageId } from '../utils/client-message-id';
import { clearUnread, insertSavedMessage } from '../utils/offer-cache';
import type { PendingMessage, ThreadRow } from '../utils/offer-thread.types';
import { isNetworkFailure, isThreadClosed, recruiterErrorMessage } from '../utils/recruiter-errors';

/**
 * Thread trao đổi của một lời mời (app.md §3–§4): tin đã lưu (mới nhất trước → đảo lại cho hiển thị cũ→mới) + tin tôi đang gửi theo `clientMessageId`.
 * Gửi lại cùng `clientMessageId` là idempotent nên "Gửi lại" không nhân đôi tin. `RECR_008` (chưa Quan tâm / bị khoá / công ty tạm ngưng) ⇒ `closed`
 * và bỏ tin đang gửi. Hàng đợi gửi KHÔNG lưu xuống máy: đóng màn là mất tin chưa gửi (app.md §4).
 */
export function useOfferThread(offerId: string) {
  const qc = useQueryClient();
  const query = useOfferMessages(offerId);
  const connection = useConnectionState();
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const [closed, setClosed] = useState(false);
  const pendingRef = useRef(pending);

  useEffect(() => {
    pendingRef.current = pending;
  });
  useEffect(() => {
    setActiveThread(offerId);
    return () => setActiveThread(null);
  }, [offerId]);
  // Mở thread là server đặt lại "chưa đọc" — vá cache để chấm/số ở danh sách tắt ngay.
  useEffect(() => {
    if (query.isSuccess) clearUnread(qc, offerId);
  }, [query.isSuccess, offerId, qc]);

  const settle = useCallback(
    (id: string) => setPending((prev) => prev.filter((p) => p.clientMessageId !== id)),
    [],
  );
  const mark = useCallback(
    (id: string, patch: Partial<PendingMessage>) =>
      setPending((prev) => prev.map((p) => (p.clientMessageId === id ? { ...p, ...patch } : p))),
    [],
  );

  const deliver = useCallback(
    async (item: PendingMessage) => {
      try {
        const saved = await offersService.sendMessage(offerId, {
          clientMessageId: item.clientMessageId,
          content: item.content,
        });
        insertSavedMessage(qc, offerId, saved);
        settle(item.clientMessageId);
      } catch (error) {
        if (isThreadClosed(error)) {
          setClosed(true);
          settle(item.clientMessageId);
          void qc.invalidateQueries({ queryKey: offerKeys.detail(offerId) });
          return;
        }
        const retryable = isNetworkFailure(error);
        if (!retryable) showToast('error', recruiterErrorMessage(error));
        mark(item.clientMessageId, { delivery: 'FAILED', retryable });
      }
    },
    [mark, offerId, qc, settle],
  );

  const send = useCallback(
    (raw: string): boolean => {
      const content = raw.trim();
      // ⚠️ Đếm theo độ dài chuỗi như `z.string().max` của BE (không phải grapheme) — emoji nhiều thì BE mới là bên quyết.
      if (content.length === 0 || content.length > JOB_LIMITS.messageMax) return false;
      const item: PendingMessage = {
        clientMessageId: newClientMessageId(),
        content,
        createdAt: new Date().toISOString(),
        delivery: 'SENDING',
        retryable: false,
      };
      setPending((prev) => [...prev, item]);
      void deliver(item);
      return true;
    },
    [deliver],
  );

  const retry = useCallback(
    (id: string) => {
      const item = pendingRef.current.find((p) => p.clientMessageId === id);
      if (!item) return;
      mark(id, { delivery: 'SENDING' });
      void deliver(item);
    },
    [deliver, mark],
  );

  // Có mạng lại ⇒ tự gửi lại các tin thất bại vì MẠNG (không phải tin bị server từ chối).
  useEffect(() => {
    if (connection !== 'connected') return;
    for (const p of pendingRef.current)
      if (p.delivery === 'FAILED' && p.retryable) retry(p.clientMessageId);
  }, [connection, retry]);

  const rows = useMemo<ThreadRow[]>(() => {
    const saved: ThreadRow[] = (query.data?.pages ?? []).flatMap((page) => page.items).reverse();
    const local = pending.map<ThreadRow>((p) => ({
      ...p,
      id: p.clientMessageId,
      side: 'CANDIDATE',
    }));
    return [...saved, ...local];
  }, [query.data, pending]);

  return {
    closed,
    error: query.error,
    hasOlder: query.hasNextPage,
    isError: query.isError,
    isFetchingOlder: query.isFetchingNextPage,
    isLoading: query.isLoading,
    loadOlder: () => {
      if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
    },
    refetch: () => void query.refetch(),
    retry,
    rows,
    send,
  };
}
