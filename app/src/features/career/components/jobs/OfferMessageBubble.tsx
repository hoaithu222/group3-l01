import { Pressable, Text, View } from 'react-native';

import { formatTime } from '@/shared/utils/format/date.utils';

import type { ThreadRow } from '../../utils/offer-thread.types';
import { OfferMessageText } from './OfferMessageText';

export interface OfferMessageBubbleProps {
  /** Tên hiện trên tin của doanh nghiệp — tên doanh nghiệp, KHÔNG phải tên HR (BE không trả tác giả của từng tin, đoán tên là gán nhầm người). */
  companyName: string;
  row: ThreadRow;
  onRetry: (id: string) => void;
}

/**
 * Một tin trong thread (app.md §3): của tôi ở PHẢI, của doanh nghiệp ở TRÁI. Trạng thái gửi luôn có CHỮ ("Đang gửi…", "Gửi không được"), tin lỗi có nút
 * "Gửi lại" (cùng `clientMessageId` nên không nhân đôi). Nội dung đi qua `OfferMessageText`: liên kết chỉ mở sau khi xác nhận.
 */
export function OfferMessageBubble({ companyName, onRetry, row }: OfferMessageBubbleProps) {
  const mine = row.side === 'CANDIDATE';
  const failed = row.delivery === 'FAILED';

  return (
    <View className={mine ? 'items-end gap-3xs px-md py-2xs' : 'items-start gap-3xs px-md py-2xs'}>
      {mine ? null : <Text className="text-caption-lg text-fg-2">{companyName}</Text>}
      <View
        className={
          mine
            ? 'max-w-[85%] rounded-md bg-action-tint px-sm py-xs'
            : 'max-w-[85%] rounded-md border-hairline border-border-1 bg-bg-1 px-sm py-xs'
        }
      >
        <OfferMessageText text={row.content} />
      </View>
      {row.delivery === 'SENDING' ? (
        <Text className="text-caption-sm text-fg-2">Đang gửi…</Text>
      ) : null}
      {failed ? (
        <Pressable
          accessibilityLabel="Tin nhắn gửi không được. Gửi lại"
          accessibilityRole="button"
          className="min-h-[44px] justify-center"
          onPress={() => onRetry(row.id)}
        >
          <Text className="text-caption-lg font-semibold text-error">Gửi không được · Gửi lại</Text>
        </Pressable>
      ) : null}
      {row.delivery ? null : (
        <Text className="text-caption-sm text-fg-2">{formatTime(row.createdAt)}</Text>
      )}
    </View>
  );
}
