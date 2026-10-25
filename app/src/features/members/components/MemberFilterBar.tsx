import type { Ref } from 'react';
import { ScrollView, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { SearchInput, type SearchInputHandle } from '@/shared/ui/search';
import { hapticSelection } from '@/shared/utils/haptics';

import type { MemberRoleFilter, MemberStatusFilter } from '../api';
import type { MemberRoleCounts } from '../hooks/useMemberRoleCounts';

type FilterKey = 'ALL' | 'BANNED' | MemberRoleFilter;

const FILTER_CHIPS: { key: FilterKey; label: string }[] = [
  { key: 'ALL', label: 'Tất cả' },
  { key: 'OWNER', label: 'Chủ nhóm' },
  { key: 'ADMIN', label: 'Quản trị viên' },
  { key: 'MEMBER', label: 'Thành viên' },
];

export interface MemberFilterBarProps {
  /**
   * Chỉ OWNER/ADMIN xem được danh sách "Bị chặn" (BE trả `PERM_001` cho người khác) ⇒ thành viên thường KHÔNG thấy chip này,
   * thay vì bấm vào rồi nhận lỗi.
   */
  canSeeBanned: boolean;
  /** Số người của CẢ NHÓM theo vai trò (`useMemberRoleCounts`) — chip hiện "Quản trị viên · 2". Chưa biết số thì chỉ nhãn. */
  counts?: MemberRoleCounts;
  onQueryChange: (q: string) => void;
  onRoleChange: (role: MemberRoleFilter | undefined) => void;
  onStatusChange: (status: MemberStatusFilter) => void;
  role: MemberRoleFilter | undefined;
  /** Tay cầm ô tìm (uncontrolled) — màn cha xoá chữ đã gõ từ nút "Xoá tìm kiếm" của trạng thái rỗng. */
  searchRef?: Ref<SearchInputHandle>;
  status: MemberStatusFilter;
}

/** Nhãn chip kèm số: "Quản trị viên · 2" — số ở CHÍNH nhãn để trình đọc màn hình đọc cùng (khe `trailing` tách ô trợ năng). */
function chipLabel(label: string, count: number | undefined): string {
  return count === undefined ? label : `${label} · ${count}`;
}

/**
 * Tìm + lọc (app.md p1-02 §3): ô tìm rồi MỘT dải chip chọn-một — Tất cả · Chủ nhóm · Quản trị viên · Thành viên · (Bị chặn, chỉ
 * quản lý). Trước đây "Bị chặn" là một dải tab riêng đặt TRÊN dải chip vai trò (ba dải điều khiển xếp chồng trước người đầu tiên
 * trong danh sách); gộp lại còn hai dải, và "Bị chặn" là một TRẠNG THÁI nên chọn nó thì bỏ lọc vai trò (màn cha lo).
 *
 * Dải chip cuộn ngang (`grow-0`: `ScrollView` ngang mặc định `flexGrow: 1` sẽ bị kéo cao trong cột `flex-1`); lề 16 nằm trong nội
 * dung cuộn để chip đầu thẳng cột với ô tìm.
 */
export function MemberFilterBar({
  canSeeBanned,
  counts,
  onQueryChange,
  onRoleChange,
  onStatusChange,
  role,
  searchRef,
  status,
}: MemberFilterBarProps) {
  const chips = canSeeBanned ? [...FILTER_CHIPS, { key: 'BANNED' as const, label: 'Bị chặn' }] : FILTER_CHIPS;
  const selected: FilterKey = status === 'BANNED' ? 'BANNED' : (role ?? 'ALL');

  function choose(key: FilterKey): void {
    if (key !== selected) hapticSelection(); // đổi bộ lọc = đổi lựa chọn; bấm lại chip đang chọn thì không rung
    if (key === 'BANNED') {
      onStatusChange('BANNED');
      return;
    }
    // Gọi đổi trạng thái TRƯỚC: màn cha xoá luôn bộ lọc vai trò khi đổi trạng thái, rồi `onRoleChange` đặt lại đúng vai trò vừa chọn.
    if (status !== 'ACTIVE') onStatusChange('ACTIVE');
    onRoleChange(key === 'ALL' ? undefined : key);
  }

  return (
    <View className="gap-sm">
      <View className="px-md">
        <SearchInput ref={searchRef} placeholder="Tìm thành viên" onChangeText={onQueryChange} />
      </View>

      <ScrollView
        className="grow-0"
        contentContainerClassName="gap-xs px-md"
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        {chips.map((chip) => (
          <Chip
            key={chip.key}
            label={chipLabel(chip.label, chip.key === 'BANNED' ? undefined : counts?.[chip.key])}
            role="radio"
            selected={selected === chip.key}
            onPress={() => choose(chip.key)}
          />
        ))}
      </ScrollView>
    </View>
  );
}
