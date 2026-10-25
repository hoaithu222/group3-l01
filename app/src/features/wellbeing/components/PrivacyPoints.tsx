import { Text, View } from 'react-native';

import { IconTile } from '@/shared/ui/icon-tile';

import { PRIVACY_POINTS } from '../constants/wellbeing-copy.constants';

/**
 * Sáu điều người dùng cần biết về dữ liệu của mình (thu thập gì · ai KHÔNG thấy · giữ bao lâu · tắt/xoá) — dùng ở màn giải thích TRƯỚC khi bật và nhắc lại ở Cài đặt.
 * Nội dung ở `PRIVACY_POINTS` (một nơi cho người duyệt câu chữ). Mỗi điều có tiêu đề (`header` để trình đọc màn hình nhảy giữa các điều) + đoạn giải thích; ô icon chỉ trang trí.
 * ⚠️ Chữ nằm trong `View flex-1` cạnh ô icon: con `Text` của `flex-row` không co, đoạn dài sẽ đẩy ô icon ra khỏi mép.
 */
export function PrivacyPoints() {
  return (
    <View className="gap-md">
      {PRIVACY_POINTS.map((point) => (
        <View key={point.key} className="flex-row items-start gap-sm">
          <IconTile name={point.icon} size="sm" tone="brand" />
          <View className="min-w-0 flex-1 gap-3xs">
            <Text accessibilityRole="header" className="text-label-lg font-semibold text-fg-1">
              {point.title}
            </Text>
            <Text className="text-body-md text-fg-2">{point.body}</Text>
          </View>
        </View>
      ))}
    </View>
  );
}
