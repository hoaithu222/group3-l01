import { Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';

/**
 * Chú giải của biểu đồ (app.md §3): "Đường găng", "Xung đột lịch", "Hôm nay" — mỗi mục có icon + CHỮ chứ không chỉ màu
 * (§7). Có quyền kéo thì thêm dòng hướng dẫn cử chỉ (giữ rồi kéo) và nhắc đường thay thế bằng chạm.
 */
export function GanttLegend({ canDrag }: { canDrag: boolean }) {
  return (
    <View className="gap-3xs px-md py-xs">
      <View className="flex-row flex-wrap items-center gap-md">
        <View className="flex-row items-center gap-3xs">
          <Icon color="error" name="flash" size={14} />
          <Text className="text-caption-sm text-fg-1">Đường găng</Text>
        </View>
        <View className="flex-row items-center gap-3xs">
          <Icon color="warning" name="alert-warning" size={14} />
          <Text className="text-caption-sm text-fg-1">Xung đột lịch</Text>
        </View>
        <View className="flex-row items-center gap-3xs">
          <View className="h-3 w-3xs rounded-full bg-action-accent" />
          <Text className="text-caption-sm text-fg-1">Hôm nay</Text>
        </View>
      </View>
      {canDrag ? (
        <Text className="text-caption-sm text-fg-2">
          Giữ rồi kéo thanh để đổi lịch, hoặc chạm thanh để chọn ngày.
        </Text>
      ) : null}
    </View>
  );
}
