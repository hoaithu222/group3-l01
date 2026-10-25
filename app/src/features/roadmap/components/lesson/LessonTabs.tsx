import { View } from 'react-native';

import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

export const LESSON_TAB_KEYS = ['content', 'resources', 'media', 'selfcheck'] as const;
export type LessonTabKey = (typeof LESSON_TAB_KEYS)[number];

export interface LessonTabsProps {
  /** Số mục tự kiểm tra đã tick / tổng — "Tự kiểm tra (2/5)" nói ngay còn bao nhiêu việc. */
  checkedCount: number;
  checklistTotal: number;
  mediaCount: number;
  resourceCount: number;
  value: LessonTabKey;
  onChange: (key: LessonTabKey) => void;
}

/**
 * Nội dung · Tài liệu · Hình ảnh · Tự kiểm tra (app.md §3). Tab rỗng ẨN đếm — "Hình ảnh" không hiện "(0)".
 *
 * ⚠️ Tiến độ tự kiểm tra ghi trong NHÃN, không dùng khe `badge` của `TabItem`: huy hiệu đó là chấm ĐỎ `action-error`
 * (nghĩa "có việc cần chú ý gấp") — gắn lên một checklist học tập là báo động giả.
 */
export function LessonTabs({
  checkedCount,
  checklistTotal,
  mediaCount,
  onChange,
  resourceCount,
  value,
}: LessonTabsProps) {
  return (
    // Hàng tab là khối duy nhất ghim dưới AppBar; thông tin buổi nằm trong vùng cuộn.
    <View className="px-md py-2xs">
      <Tabs
        items={[
          { key: 'content', label: 'Nội dung' },
          {
            key: 'resources',
            label: resourceCount > 0 ? `Tài liệu (${String(resourceCount)})` : 'Tài liệu',
          },
          { key: 'media', label: mediaCount > 0 ? `Hình ảnh (${String(mediaCount)})` : 'Hình ảnh' },
          {
            accessibilityLabel:
              checklistTotal > 0
                ? `Tự kiểm tra, đã tick ${String(checkedCount)} trên ${String(checklistTotal)} mục`
                : undefined,
            key: 'selfcheck',
            label:
              checklistTotal > 0
                ? `Tự kiểm tra (${String(checkedCount)}/${String(checklistTotal)})`
                : 'Tự kiểm tra',
          },
        ]}
        scrollable
        value={value}
        onChange={(key) => {
          // Rung "đổi lựa chọn" chỉ khi thật sự sang tab khác (chạm lại tab đang mở thì không).
          if (key !== value) hapticSelection();
          onChange(key as LessonTabKey);
        }}
      />
    </View>
  );
}
