import { Pressable, ScrollView, Text, View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import { STUDY_ITEM_TYPES, type StudyItemType } from '../../api/study.types';
import { ITEM_TYPE_META } from '../../constants/study.constants';
import { ITEM_TYPE_TONE } from '../../utils/editor-type-meta';

export interface EditorEmptyStateProps {
  /** "Thêm thủ công" — mở tấm chọn dạng mục. */
  onAdd: () => void;
  /** "Nhập từ CSV" — mở tấm nhập hàng loạt. */
  onImport: () => void;
  /** Chạm một dạng ở hàng "Bắt đầu nhanh" — thêm luôn mục dạng đó, bỏ qua tấm chọn. */
  onQuickAdd: (type: StudyItemType) => void;
}

function QuickTile({
  onPress,
  type,
}: {
  onPress: (type: StudyItemType) => void;
  type: StudyItemType;
}) {
  const meta = ITEM_TYPE_META[type];
  return (
    <Pressable
      accessibilityLabel={`Thêm ${meta.label}`}
      accessibilityRole="button"
      className="min-h-[44px] grow basis-[30%]"
      onPress={() => onPress(type)}
    >
      {({ pressed }) => (
        <View className={cn('items-center gap-xs rounded-sm py-xs', pressed && 'opacity-70')}>
          <IconTile name={meta.icon} tone={ITEM_TYPE_TONE[type]} />
          <Text className="text-center text-caption-sm text-fg-1">{meta.label}</Text>
        </View>
      )}
    </Pressable>
  );
}

/**
 * Bộ chưa có mục: hình minh hoạ + HAI lối vào rõ ràng ("Nhập từ CSV" cho ai đã có bảng tính, "Thêm thủ công" cho ai gõ từng thẻ),
 * rồi hàng "Bắt đầu nhanh" — năm dạng mục bấm là thêm luôn (bỏ một bước chọn dạng) và cho người soạn thấy sẵn có những gì.
 * Cuộn được (`ScrollView`) vì màn thấp/phóng cỡ chữ không chứa vừa hình + hai nút + hàng dạng.
 */
export function EditorEmptyState({ onAdd, onImport, onQuickAdd }: EditorEmptyStateProps) {
  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      <View className="pb-md">
        <EmptyState
          actions={[
            { label: 'Nhập từ CSV', onPress: onImport, variant: 'secondary' },
            { label: 'Thêm thủ công', onPress: onAdd },
          ]}
          description="Thêm thẻ ghi nhớ hoặc câu hỏi đầu tiên, hoặc dán nhiều thẻ một lúc từ bảng tính."
          icon="book"
          title="Bộ chưa có mục"
          tone="success"
        />
        <View className="items-center gap-xs px-md">
          <Text className="text-label-md font-semibold text-fg-1">Bắt đầu nhanh với một dạng</Text>
          <View className="flex-row flex-wrap justify-center gap-xs">
            {STUDY_ITEM_TYPES.map((type) => (
              <QuickTile key={type} type={type} onPress={onQuickAdd} />
            ))}
          </View>
        </View>
      </View>
    </ScrollView>
  );
}
