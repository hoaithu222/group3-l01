import { Text, View } from 'react-native';

import type { MessageBubbleFooterProps } from '@/shared/message-extensions';
import type { IconName } from '@/shared/ui/icon';
import { Icon } from '@/shared/ui/icon';

import { useChatSubFeatures } from '../../hooks/useChatSubFeatures';

function RefChip({ icon, label }: { icon: IconName; label: string }) {
  return (
    <View
      accessibilityLabel={`${label} từ tin này`}
      accessible
      className="flex-row items-center gap-3xs rounded-full bg-surface-success px-xs py-3xs"
    >
      <Icon color="success" name={icon} size="xs" />
      <Text className="text-label-xs font-semibold text-success">{label}</Text>
    </View>
  );
}

/**
 * Chip "Đã tạo task" / "Đã lưu vào tài liệu" dưới bong bóng của tin đã được chuyển đổi (`message.sourceRefs`, khe `bubbleFooter`, p7-04). Mỗi loại một chip, đếm theo `kind`; loại nào có cờ phụ TẮT thì ẩn
 * (`messageToTask`/`messageToResource`, DU-05). Chip là thông tin — không bấm được: một tin có thể sinh nhiều thẻ/tài liệu ở nhiều nơi nên không có "một đích" để mở; xem ở bảng công việc/kho tài liệu.
 * Có icon + chữ, không dựa vào màu; trợ năng đọc "Đã tạo 2 task từ tin này".
 */
export function SourceRefsFooter({ message }: MessageBubbleFooterProps) {
  const { messageToResource, messageToTask } = useChatSubFeatures();
  const refs = message.sourceRefs ?? [];
  const tasks = messageToTask ? refs.filter((ref) => ref.kind === 'TASK').length : 0;
  const resources = messageToResource ? refs.filter((ref) => ref.kind === 'RESOURCE').length : 0;
  if (tasks === 0 && resources === 0) return null;

  return (
    <View className="mt-3xs flex-row flex-wrap gap-3xs self-start">
      {tasks > 0 ? (
        <RefChip icon="checkmark-square" label={tasks === 1 ? 'Đã tạo task' : `Đã tạo ${String(tasks)} task`} />
      ) : null}
      {resources > 0 ? (
        <RefChip
          icon="document-2"
          label={resources === 1 ? 'Đã lưu vào tài liệu' : `Đã lưu ${String(resources)} tệp vào tài liệu`}
        />
      ) : null}
    </View>
  );
}
