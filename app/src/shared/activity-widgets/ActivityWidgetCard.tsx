import { Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Icon, type IconName } from '@/shared/ui/icon';

export interface ActivityWidgetCardProps {
  /** Nút hành động của thẻ ("Ôn ngay", "Chấm ngay"). MỘT hành động — chạm nút, không phải cả thẻ, để vùng chạm rõ ràng. */
  actionLabel: string;
  /** Dòng phụ (vd "Chờ bạn từ 2 giờ trước"). Bỏ trống ⇒ thẻ một dòng. */
  description?: string;
  icon: IconName;
  onAction: () => void;
  /** Câu nói ra việc đang chờ, có SỐ ("12 thẻ cần ôn hôm nay") — trình đọc màn hình đọc đúng câu này. */
  title: string;
}

/**
 * Khung DÙNG CHUNG của widget ở đầu tab Hoạt động (`ActivityWidgetsSlot`): biểu tượng + câu việc đang chờ + một nút. Để mọi widget do các feature đăng ký
 * có cùng dáng (nền `bg-2`, bo `md`, một hàng) thay vì mỗi feature vẽ một kiểu — khi bổ sung widget thứ ba thì không phải copy lại markup.
 * Chữ nói rõ việc chứ không dựa vào màu/icon ("N thẻ cần chấm", không chỉ chấm đỏ).
 */
export function ActivityWidgetCard({
  actionLabel,
  description,
  icon,
  onAction,
  title,
}: ActivityWidgetCardProps) {
  return (
    <View className="flex-row items-center gap-sm rounded-md bg-bg-2 p-sm">
      <Icon color="fg-brand" name={icon} />
      <View className="flex-1 gap-3xs">
        <Text className="text-body-md text-fg-1">{title}</Text>
        {description ? <Text className="text-caption-lg text-fg-2">{description}</Text> : null}
      </View>
      <Button label={actionLabel} size="sm" onPress={onAction} />
    </View>
  );
}
