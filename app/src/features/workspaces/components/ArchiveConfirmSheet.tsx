import { Text, View } from 'react-native';

import { ConfirmSheet } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';

export interface ArchiveConfirmSheetProps {
  visible: boolean;
  loading?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const IMPACTS = [
  'Ngừng gửi tin nhắn và tạo lời mời mới',
  'Cuộc gọi/cuộc họp đang diễn ra sẽ kết thúc',
  'Thành viên vẫn đọc và tìm được nội dung cũ',
];

/**
 * WS-04 (README p1-01 §8) — liệt kê ảnh hưởng trước khi lưu trữ nhóm.
 *
 * ✅ `ConfirmSheet` (ô biểu tượng + câu hỏi + mô tả canh giữa, [Huỷ | Lưu trữ]) thay cho hai `Button fullWidth` trần trong
 * `flex-row`: hai khối `width: 100%` không co nên nút "Lưu trữ" bị đẩy ra ngoài mép tấm và bị cắt mất. Đang lưu trữ thì "Huỷ"
 * và nền mờ bị khoá (huỷ giữa lúc yêu cầu đang bay là đóng tấm mà việc vẫn xảy ra). Cùng khuôn `ArchiveChannelSheet`.
 * Danh sách ảnh hưởng nằm trong một khối nền nhạt canh trái — chữ căn giữa nhiều dòng khó đọc thành danh sách.
 */
export function ArchiveConfirmSheet({
  visible,
  loading,
  onClose,
  onConfirm,
}: ArchiveConfirmSheetProps) {
  return (
    <ConfirmSheet
      confirmLabel="Lưu trữ"
      description="Nhóm sẽ chuyển sang chỉ đọc. Bạn có thể khôi phục lại sau."
      icon="history"
      loading={loading}
      title="Lưu trữ nhóm này?"
      tone="danger"
      visible={visible}
      onClose={onClose}
      onConfirm={onConfirm}
    >
      <View accessibilityRole="list" className="gap-xs rounded-xs bg-surface-neutral p-sm">
        {IMPACTS.map((impact) => (
          <View key={impact} className="flex-row items-start gap-xs">
            <Icon color="fg-2" name="alert-information" size="sm" />
            <Text className="flex-1 text-body-md text-fg-2">{impact}</Text>
          </View>
        ))}
      </View>
    </ConfirmSheet>
  );
}
