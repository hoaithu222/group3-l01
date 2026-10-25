import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { ProfileView } from '../../api/recruiter.types';

export interface ProfileViewRowProps {
  view: ProfileView;
}

/**
 * Một dòng "Ai đã xem hồ sơ của tôi": logo + tên doanh nghiệp, ngày xem, số lượt trong ngày ở cột phải. Không bấm được — BE chỉ
 * trả doanh nghiệp (không danh tính nhà tuyển dụng, không hồ sơ để mở), nên không có đích nào để điều hướng tới.
 *
 * Cả hàng là MỘT phần tử trợ năng với nhãn đọc trọn câu (tên · ngày · số lượt): đọc rời ba mảnh chữ thì "3 lượt" không biết của ai.
 * Chữ tên nằm trong khối `flex-1` để cột số lượt bên phải không bị đẩy ra khỏi màn ở máy 320dp (cùng khuôn `BlockedCompanyRow`).
 * `px-md`: danh sách nằm trong `Screen padded={false}` (FlashList tràn viền để kẻ chia chạy hết bề rộng) nên hàng tự có lề 16.
 */
export function ProfileViewRow({ view }: ProfileViewRowProps) {
  const { company } = view;
  const date = formatDate(view.dayKey);
  const countLabel = `${String(view.viewCount)} lượt xem`;

  return (
    <View
      accessibilityLabel={`${company.name}, ${countLabel} ngày ${date}`}
      accessible
      className="min-h-[64px] flex-row items-center gap-sm border-b border-b-divider-1 px-md py-sm"
    >
      <Avatar
        name={company.name}
        shape="rounded"
        size="md"
        source={company.logoUrl ? { uri: company.logoUrl } : undefined}
      />
      <View className="flex-1 gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1" numberOfLines={2}>
          {company.name}
        </Text>
        <Text className="text-caption-lg text-fg-2">{`Ngày ${date}`}</Text>
      </View>
      <Text className="text-label-md font-semibold text-fg-1">{countLabel}</Text>
    </View>
  );
}
