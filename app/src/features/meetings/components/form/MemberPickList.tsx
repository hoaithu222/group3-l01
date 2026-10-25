import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { LinkButton } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { SearchInput, useSearchInput } from '@/shared/ui/search';
import { Skeleton } from '@/shared/ui/skeleton';

import { useWorkspaceMemberSearch } from '../../queries/meetings.queries';

export interface MemberPickListProps {
  /** Đã ở trong danh sách người tham dự — chip khoá, ghi rõ "Đã tham dự". */
  disabledIds?: ReadonlySet<string>;
  selected: readonly string[];
  workspaceId: string;
  /** Tên đi kèm để nơi gọi nhớ (danh sách kết quả đổi theo từ khoá, chip đã chọn vẫn phải có tên). */
  onToggle: (userId: string, name: string) => void;
}

/**
 * Chọn thành viên ACTIVE của nhóm để mời (form tạo + tấm "Thêm người"). Ô tìm `useSearchInput`: uncontrolled + debounce nên không
 * mất dấu tiếng Việt trên Android/Telex. Chip `role="checkbox"` (chọn nhiều). Dùng chung một chỗ để hai màn không lệch nhau về
 * trạng thái tải/lỗi/rỗng.
 */
export function MemberPickList({
  disabledIds,
  onToggle,
  selected,
  workspaceId,
}: MemberPickListProps) {
  const search = useSearchInput();
  const members = useWorkspaceMemberSearch(workspaceId, search.value);
  const list = members.data ?? [];

  return (
    <View className="gap-xs">
      <SearchInput {...search.inputProps} placeholder="Tìm thành viên trong nhóm" />
      {members.isPending ? (
        <Skeleton className="h-10 rounded-md" />
      ) : members.isError ? (
        // Lỗi nằm giữa form ⇒ dòng chữ + "Thử lại" tại chỗ (khối `EmptyState` 120dp ở đây đẩy nút Tạo khỏi màn).
        <View className="flex-row flex-wrap items-center gap-xs">
          <Text className="text-body-md text-fg-2">Không tải được danh sách thành viên.</Text>
          <LinkButton iconLeft="reload" label="Thử lại" size="sm" onPress={() => void members.refetch()} />
        </View>
      ) : list.length === 0 ? (
        <Text className="text-body-md text-fg-2">Không tìm thấy thành viên phù hợp.</Text>
      ) : (
        <View className="flex-row flex-wrap gap-xs">
          {list.map((member) => {
            const name = member.displayName ?? member.name;
            const already = disabledIds?.has(member.userId) ?? false;
            return (
              <Chip
                key={member.userId}
                // Ảnh đại diện của thành viên (có sẵn trong dữ liệu, trước chưa vẽ) — chọn người bằng mặt nhanh hơn bằng tên.
                // `sm` (32) khớp đúng khe ảnh của chip `md`; không có/ảnh lỗi thì `Avatar` tự hiện chữ viết tắt.
                avatar={
                  <Avatar
                    name={name}
                    size="sm"
                    source={member.avatarUrl ? { uri: member.avatarUrl } : undefined}
                  />
                }
                disabled={already}
                label={already ? `${name} · Đã tham dự` : name}
                role="checkbox"
                selected={selected.includes(member.userId)}
                onPress={() => onToggle(member.userId, name)}
              />
            );
          })}
        </View>
      )}
    </View>
  );
}
