import { Pressable, ScrollView } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Chip } from '@/shared/ui/chip';
import { Icon } from '@/shared/ui/icon';

export interface SelectedChipOption {
  id: string;
  name: string;
  avatarUrl?: string | null;
}

export interface SelectedChipsProps {
  items: SelectedChipOption[];
  onRemove: (id: string) => void;
}

/** app.md §3 — chip người đã chọn ở bước 2 `CreateGroupScreen`, cuộn ngang. */
export function SelectedChips({ items, onRemove }: SelectedChipsProps) {
  if (items.length === 0) return null;

  return (
    // `-mx-md`: hai màn dùng (`MembersStep`, `AddMembersScreen`) đã bọc chip trong `px-md` — `paddingHorizontal` bên trong
    // cộng thêm là chip thụt 32dp so với ô tìm. Kéo vùng cuộn ra hết bề ngang rồi để `paddingHorizontal` trả lại đúng 16:
    // chip đầu thẳng cột với ô tìm, còn lúc cuộn thì chip trượt tới tận mép màn thay vì bị cắt cụt cách mép 16dp.
    // `grow-0`: không để `ScrollView` (mặc định `flexGrow: 1`) phình ra khi cha là cột `flex-1`.
    <ScrollView
      className="-mx-md grow-0"
      contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {items.map((item) => (
        <Chip
          key={item.id}
          avatar={<Avatar name={item.name} size="xs" source={item.avatarUrl ? { uri: item.avatarUrl } : undefined} />}
          label={item.name}
          trailing={
            // Icon 16dp + `hitSlop` 14 mỗi phía = 44dp (`hitSlop={8}` cũ chỉ ra 32dp).
            <Pressable accessibilityLabel={`Bỏ chọn ${item.name}`} accessibilityRole="button" hitSlop={14} onPress={() => onRemove(item.id)}>
              <Icon color="fg-2" name="cancel" size={16} />
            </Pressable>
          }
        />
      ))}
    </ScrollView>
  );
}
