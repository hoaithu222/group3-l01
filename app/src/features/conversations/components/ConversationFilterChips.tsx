import { ScrollView } from 'react-native';

import { Chip } from '@/shared/ui/chip';

import type { ConversationFilter } from '../api/conversations.types';

const CHIPS: { label: string; value: ConversationFilter }[] = [
  { label: 'Tất cả', value: 'all' },
  { label: 'Chưa đọc', value: 'unread' },
  { label: 'Cá nhân', value: 'direct' },
  { label: 'Nhóm', value: 'group' },
];

export interface ConversationFilterChipsProps {
  value: ConversationFilter;
  onChange: (value: ConversationFilter) => void;
}

/**
 * app.md §3 — chip "Tất cả · Chưa đọc · Cá nhân · Nhóm" trên `ConversationListScreen`.
 *
 * Cuộn NGANG một dòng thay vì `flex-wrap`: 4 chip đủ rộng để xuống hàng 2 trên máy hẹp, đẩy danh sách hội thoại thụt
 * xuống — cùng cách `SkillFilterChips` đang làm.
 *
 * ✅ Dải cuộn TRÀN VIỀN, lề 16 nằm TRONG `contentContainerClassName`: chip đầu vẫn thẳng mép trái ô tìm, còn khi máy hẹp
 * không đủ chỗ thì chip cuối trôi ra tận mép màn — gợi ý "còn nữa, vuốt ngang". Bản cũ để nơi gọi bọc cả dải trong
 * `px-md`: khung nhìn dừng cách mép 16dp và chip "Nhóm" bị xén ngang giữa chữ đúng ở chỗ đó (thấy trên máy thật).
 * ⛔ Vì vậy nơi gọi KHÔNG bọc dải này trong khối `px-md` — hai lề cộng lại là chip thụt 32dp so với ô tìm.
 *
 * `size="sm"` (32dp, chữ 14) là cỡ chip LỌC: bốn chip vừa một dòng từ máy 360dp. ⚠️ `py-1.5` (6dp) KHÔNG phải trang trí:
 * `HIT_SLOP` dọc 6dp của chip `sm` chỉ bấm được khi nằm TRONG khung của cha — thiếu nó ScrollView cao đúng 32dp và vùng
 * chạm thật tụt từ 44 về 32dp. `grow-0`: ScrollView của RN mặc định `flexGrow: 1`, đặt thẳng trong cột `flex-1` là nó
 * nở chia đôi chỗ với danh sách bên dưới.
 */
export function ConversationFilterChips({ value, onChange }: ConversationFilterChipsProps) {
  return (
    <ScrollView
      className="grow-0"
      contentContainerClassName="gap-xs px-md py-1.5"
      horizontal
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    >
      {CHIPS.map((chip) => (
        <Chip
          key={chip.value}
          label={chip.label}
          role="radio"
          selected={value === chip.value}
          size="sm"
          onPress={() => onChange(chip.value)}
        />
      ))}
    </ScrollView>
  );
}
