import { memo, useMemo } from 'react';

import { Button, Callout, Skeleton, Text } from '@/shared/ui';
import { formatDate } from '@/shared/utils/format';

import { flattenMessages, useOfferMessages } from '../service/offer.queries';
import type { OfferDetail } from '../types/offer.types';
import OfferThreadComposer from './OfferThreadComposer';

export interface OfferThreadProps {
  offer: Pick<OfferDetail, 'id' | 'status' | 'threadOpen' | 'threadLocked'>;
}

const TIME_FORMAT = 'HH:mm DD/MM/YYYY';

/** Trạng thái CÓ THỂ có tin: từ INTERESTED trở đi (đã có thể bị thu hồi/từ chối sau đó — thread khi đó chỉ đọc). SENT/READ/EXPIRED chưa từng có thread. */
const THREAD_STATUSES: readonly OfferDetail['status'][] = ['INTERESTED', 'DECLINED', 'WITHDRAWN'];

/**
 * Thread trao đổi trong lời mời (admin.md p6-08 §2.6): danh sách tin (cũ → mới, "Tải tin cũ hơn" khi còn) + ô soạn. Ô soạn CHỈ hiện khi `threadOpen` (INTERESTED, chưa khoá, doanh nghiệp còn
 * duyệt); lời mời chưa Quan tâm → giải thích "mở sau khi ứng viên bấm Quan tâm" và KHÔNG gọi API tin nhắn; đã khoá/tạm ngưng → "chỉ đọc". Tin do BÊN NÀO gửi hiện bằng CHỮ ("Doanh nghiệp"/"Ứng viên"), không
 * chỉ dựa vào vị trí. Nội dung là văn bản thuần (`whitespace-pre-wrap`), không dựng HTML.
 */
const OfferThread = memo(function OfferThread({ offer }: OfferThreadProps) {
  const hasThread = THREAD_STATUSES.includes(offer.status);
  const messages = useOfferMessages(offer.id, hasThread);
  const items = useMemo(() => flattenMessages(messages.data), [messages.data]);

  if (!hasThread) {
    return (
      <Callout
        description="Bạn chỉ trao đổi được với ứng viên sau khi họ bấm Quan tâm."
        intent="neutral"
        title="Chưa mở trao đổi"
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {messages.isError && items.length === 0 ? (
        <Callout
          action={
            <Button size="sm" variant="stroke" onClick={() => void messages.refetch()}>
              Thử lại
            </Button>
          }
          intent="error"
          title="Không tải được trao đổi"
        />
      ) : messages.isLoading ? (
        <Skeleton className="w-full" height={80} />
      ) : (
        <>
          {messages.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                loading={messages.isFetchingNextPage}
                size="xs"
                variant="ghost"
                onClick={() => void messages.fetchNextPage()}
              >
                Tải tin cũ hơn
              </Button>
            </div>
          ) : null}
          {items.length === 0 ? (
            <Text size="small" skin="muted">
              Chưa có tin nhắn nào.
            </Text>
          ) : (
            <ul aria-label="Tin nhắn trong lời mời" className="flex flex-col gap-2">
              {items.map((m) => (
                <li
                  key={m.id}
                  className={
                    m.side === 'COMPANY'
                      ? 'ml-8 flex flex-col gap-0.5 border border-border-1 bg-bg-2 p-2'
                      : 'mr-8 flex flex-col gap-0.5 border border-border-1 bg-bg-1 p-2'
                  }
                >
                  <span className="text-caption-12 text-fg-4">
                    {m.side === 'COMPANY' ? 'Doanh nghiệp' : 'Ứng viên'} · {formatDate(m.createdAt, TIME_FORMAT)}
                  </span>
                  <span className="whitespace-pre-wrap break-words text-body-14 text-fg-1">{m.content}</span>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {offer.threadOpen ? (
        <OfferThreadComposer offerId={offer.id} />
      ) : (
        <Text size="small" skin="muted">
          {offer.status === 'INTERESTED' || offer.threadLocked
            ? 'Trao đổi đang chỉ đọc (lời mời bị khoá hoặc doanh nghiệp đang tạm ngưng).'
            : 'Lời mời đã đóng — trao đổi chỉ đọc.'}
        </Text>
      )}
    </div>
  );
});

export default OfferThread;
