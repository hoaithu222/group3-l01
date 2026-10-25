import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Icon, type IconName } from '@/shared/ui/icon';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { OfferDetail } from '../../api/recruiter.types';
import { DECLINE_REASON_LABEL, EMPLOYMENT_TYPE_LABEL } from '../../constants/recruiter.constants';
import { CompanyHeader } from './CompanyHeader';
import { OfferMessageText } from './OfferMessageText';
import { OfferStatusBadge } from './OfferStatusBadge';

/** Dòng trạng thái theo từng ca — nói rõ chuyện gì đã/đang xảy ra với lời mời (không chỉ huy hiệu). `null` = không cần dòng nào. */
function statusNote(offer: OfferDetail): string | null {
  switch (offer.status) {
    case 'SENT':
    case 'READ':
      return `Lời mời hết hạn vào ${formatDate(offer.expiresAt)}. Bạn có thể bày tỏ quan tâm hoặc từ chối khéo.`;
    case 'INTERESTED': {
      const who = offer.recruiter.name ? ` Người liên hệ: ${offer.recruiter.name}.` : '';
      const email = offer.sharedEmail
        ? ` Đã chia sẻ email ${offer.sharedEmail}.`
        : ' Bạn chưa chia sẻ email.';
      return `Bạn đã bày tỏ quan tâm ngày ${formatDate(offer.respondedAt)}.${email}${who}`;
    }
    case 'DECLINED':
      return offer.declineReason
        ? `Bạn đã từ chối lời mời này (${DECLINE_REASON_LABEL[offer.declineReason]}).`
        : 'Bạn đã từ chối lời mời này.';
    case 'WITHDRAWN':
      return 'Doanh nghiệp đã thu hồi lời mời này.';
    case 'EXPIRED':
      return 'Lời mời đã hết hạn.';
    default:
      return null;
  }
}

export interface OfferDetailBodyProps {
  offer: OfferDetail;
  opening: boolean;
  onOpenJd: () => void;
}

/**
 * Thân chi tiết lời mời (app.md §3): header doanh nghiệp, banner tạm ngưng, tiêu đề + trạng thái, loại việc/khu vực/ngày gửi, nội dung (giữ xuống dòng,
 * liên kết bấm được sau xác nhận), JD PDF, dòng trạng thái. Nút hành động nằm ở thanh đáy (`OfferActionBar`), không lẫn vào nội dung cuộn.
 */
export function OfferDetailBody({ offer, onOpenJd, opening }: OfferDetailBodyProps) {
  // Không còn APPROVED (thực tế là SUSPENDED: công ty đã gửi lời mời thì đã được duyệt) — cùng điều kiện với `OfferActionBar` và `RECR_002`.
  const suspended = offer.company.status !== 'APPROVED';
  // Mỗi mẩu thông tin một icon (loại việc · khu vực · ngày gửi) — quét nhanh hơn một dòng chữ nối bằng "·"; CHỮ vẫn đủ nghĩa khi bỏ icon.
  const meta: { icon: IconName; key: string; text: string }[] = [
    { icon: 'user-circle', key: 'type', text: EMPLOYMENT_TYPE_LABEL[offer.employmentType] },
    ...(offer.location ? [{ icon: 'location' as const, key: 'location', text: offer.location }] : []),
    { icon: 'calendar', key: 'sent', text: `Gửi ${formatDate(offer.sentAt)}` },
  ];
  const note = statusNote(offer);
  const closedThread = offer.status === 'INTERESTED' && !offer.threadOpen;

  return (
    <View className="gap-md py-xs">
      <CompanyHeader company={offer.company} />
      {suspended ? (
        <Alert
          description="Bạn vẫn đọc và từ chối được lời mời, nhưng chưa thể bày tỏ quan tâm hay trao đổi cho tới khi doanh nghiệp hoạt động lại."
          title={
            offer.company.status === 'SUSPENDED'
              ? 'Doanh nghiệp đang tạm ngưng'
              : 'Doanh nghiệp chưa được duyệt'
          }
          tone="warning"
        />
      ) : null}
      <View className="gap-2xs">
        <View className="flex-row items-start gap-sm">
          <Text className="flex-1 text-header-sm font-semibold text-fg-1">{offer.title}</Text>
          <OfferStatusBadge status={offer.status} />
        </View>
        <View className="flex-row flex-wrap items-center gap-x-md gap-y-2xs">
          {meta.map((item) => (
            <View key={item.key} className="flex-row items-center gap-2xs">
              <Icon color="fg-2" name={item.icon} size="sm" />
              <Text className="text-caption-lg text-fg-2">{item.text}</Text>
            </View>
          ))}
        </View>
      </View>
      <OfferMessageText text={offer.message} />
      {offer.jdUrl ? (
        <Button
          fullWidth
          iconLeft="document"
          label="Xem mô tả công việc (PDF)"
          loading={opening}
          variant="secondary"
          onPress={onOpenJd}
        />
      ) : null}
      {note ? <Text className="text-body-md text-fg-2">{note}</Text> : null}
      {closedThread && !suspended ? (
        <Alert description="Cuộc trao đổi đã đóng — bạn vẫn đọc lại được các tin cũ." tone="info" />
      ) : null}
    </View>
  );
}
