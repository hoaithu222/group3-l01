import { Pressable, Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge } from '@/shared/ui/badge';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { OfferItem } from '../../api/recruiter.types';
import { EMPLOYMENT_TYPE_LABEL, OFFER_STATUS_LABEL } from '../../constants/recruiter.constants';
import { OfferStatusBadge } from './OfferStatusBadge';

export interface OfferRowProps {
  offer: OfferItem;
  /** Hàng đang mở ở khung chi tiết (chỉ có nghĩa khi hộp thư và chi tiết cùng hiện — máy tính bảng): tô nền nhẹ + báo trạng thái "đã chọn" cho trình đọc màn hình. */
  selected?: boolean;
  onPress: (offerId: string) => void;
}

/**
 * Một dòng của hộp thư lời mời (app.md §2 `OfferRow`): logo, tên doanh nghiệp, tiêu đề, loại việc + thời điểm gửi, trạng thái bằng CHỮ, chấm "chưa đọc".
 * Lời mời `SENT` (chưa mở) và lời mời có tin trao đổi chưa đọc được đậm tên + chấm/số. Cả dòng là MỘT phần tử trợ năng đọc đủ ý (chấm không có
 * chữ nên phải gộp vào nhãn — "3 tin chưa đọc" chứ không chỉ một chấm).
 */
export function OfferRow({ offer, onPress, selected = false }: OfferRowProps) {
  const isNew = offer.status === 'SENT';
  const unread = offer.unreadMessages;
  const emphasized = isNew || unread > 0;
  const spoken = [
    offer.company.name,
    offer.title,
    OFFER_STATUS_LABEL[offer.status],
    unread > 0 ? `${String(unread)} tin nhắn chưa đọc` : null,
  ]
    .filter(Boolean)
    .join('. ');

  return (
    <Pressable
      accessibilityLabel={spoken}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      // `active:opacity-70`: phản hồi nhấn cho hàng trần (không có nền để đổi khi chưa chọn).
      className={
        selected
          ? 'min-h-[64px] flex-row items-center gap-sm border-b border-b-divider-1 bg-action-tint px-md py-sm active:opacity-70'
          : 'min-h-[64px] flex-row items-center gap-sm border-b border-b-divider-1 px-md py-sm active:opacity-70'
      }
      onPress={() => onPress(offer.id)}
    >
      <Avatar
        name={offer.company.name}
        shape="rounded"
        size="md"
        source={offer.company.logoUrl ? { uri: offer.company.logoUrl } : undefined}
      />
      <View className="flex-1 gap-3xs">
        <Text
          className={
            emphasized ? 'text-label-lg font-semibold text-fg-1' : 'text-label-lg text-fg-1'
          }
          numberOfLines={1}
        >
          {offer.company.name}
        </Text>
        <Text className="text-body-md text-fg-1" numberOfLines={2}>
          {offer.title}
        </Text>
        <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
          {`${EMPLOYMENT_TYPE_LABEL[offer.employmentType]} · ${formatRelative(offer.sentAt)}`}
        </Text>
      </View>
      <View className="items-end gap-2xs">
        <OfferStatusBadge status={offer.status} />
        {unread > 0 ? (
          <Badge
            accessibilityLabel={`${String(unread)} tin nhắn chưa đọc`}
            count={unread}
            size="sm"
          />
        ) : null}
        {isNew && unread === 0 ? <Badge accessibilityLabel="Chưa đọc" dot size="sm" /> : null}
      </View>
    </Pressable>
  );
}
