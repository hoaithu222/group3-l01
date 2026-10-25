import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { SearchInput } from '@/shared/ui/search';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { Toggle } from '@/shared/ui/toggle';

import type { GrantLevel } from '../api';
import { useWorkspaceMemberOptions } from '../queries/channel-members.queries';

export interface AddGrantSheetProps {
  /** userId đã có grant — loại khỏi danh sách chọn (idempotent phía BE, nhưng lọc sẵn đỡ chọn nhầm). */
  existingUserIds: string[];
  loading: boolean;
  onAdd: (userIds: string[], level: GrantLevel) => void;
  onClose: () => void;
  visible: boolean;
  wsId: string;
}

/**
 * Chọn thành viên ACTIVE + cấp quyền — kèm câu "sẽ xem được lịch sử" (app.md §2, §3).
 *
 * ✅ Hàng người là `ListItem` (avatar · tên · kẻ ngăn · `selected` + dấu tích) — cùng khuôn chọn-nhiều của `ForwardTargetList`,
 * thay cho `Checkbox` bọc avatar (ô tích canh ĐỈNH lệch với avatar 32, các hàng không kẻ ngăn trôi vào nhau). Đang tải là khung
 * xương CÙNG HÌNH hàng (avatar + chữ) chứ không để trống.
 */
export function AddGrantSheet({
  existingUserIds,
  loading,
  onAdd,
  onClose,
  visible,
  wsId,
}: AddGrantSheetProps) {
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [asManager, setAsManager] = useState(false);
  const {
    data: options = [],
    error,
    isError,
    isLoading,
    refetch,
  } = useWorkspaceMemberOptions(wsId, query);

  const candidates = useMemo(
    () => options.filter((option) => !existingUserIds.includes(option.userId)),
    [options, existingUserIds],
  );

  function toggle(userId: string): void {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(userId)) next.delete(userId);
      else next.add(userId);
      return next;
    });
  }

  function handleClose(): void {
    setQuery('');
    setSelected(new Set());
    setAsManager(false);
    onClose();
  }

  return (
    <BottomSheet
      description="Người được thêm sẽ xem được lịch sử tin nhắn cũ của kênh."
      footer={
        <Button
          disabled={selected.size === 0}
          fullWidth
          label={selected.size > 0 ? `Thêm ${selected.size} người` : 'Thêm thành viên'}
          loading={loading}
          onPress={() => onAdd(Array.from(selected), asManager ? 'MANAGER' : 'MEMBER')}
        />
      }
      scrollable
      search={<SearchInput placeholder="Tìm thành viên" onChangeText={setQuery} />}
      title="Thêm thành viên"
      visible={visible}
      onClose={handleClose}
    >
      <View className="gap-md">
        <Toggle
          description="Người mới được thêm với quyền quản lý kênh"
          label="Thêm với quyền Quản lý"
          value={asManager}
          onChange={setAsManager}
        />

        {isLoading ? (
          <View>
            <SkeletonParagraphWithIcon className="py-xs" />
            <SkeletonParagraphWithIcon className="py-xs" />
            <SkeletonParagraphWithIcon className="py-xs" />
          </View>
        ) : isError ? (
          // ❌ Trước đây tải lỗi rơi vào nhánh rỗng ⇒ tấm nói dối "Không còn ai để thêm", không cách thử lại.
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            size="compact"
            title="Không tải được danh sách thành viên"
            tone="danger"
          />
        ) : candidates.length === 0 ? (
          <EmptyState description="Không còn ai để thêm." icon="user" size="compact" tone="info" />
        ) : (
          /* MỘT `View` bọc các hàng: `gap-md` của khối ngoài chèn vào giữa các hàng có kẻ thì kẻ và hàng kế tiếp hở ra.
             Không tự khai `px-*`: tấm `padded` mặc định đã có lề 16. */
          <View accessibilityLabel="Thành viên nhóm" accessibilityRole="list">
            {candidates.map((option, index) => {
              const name = option.displayName ?? option.name;
              const isSelected = selected.has(option.userId);
              return (
                <ListItem
                  key={option.userId}
                  divider={index < candidates.length - 1}
                  emphasis="title"
                  label={name}
                  labelNumberOfLines={2}
                  leading={
                    // Trang trí: tên đã nằm ở nhãn hàng ⇒ ẩn avatar khỏi trình đọc màn hình (không đọc tên hai lần).
                    <View
                      accessibilityElementsHidden
                      importantForAccessibility="no-hide-descendants"
                    >
                      <Avatar
                        name={name}
                        size="sm"
                        source={option.avatarUrl ? { uri: option.avatarUrl } : undefined}
                      />
                    </View>
                  }
                  selected={isSelected}
                  trailing={
                    isSelected ? (
                      <Icon color="fg-brand" label="Đã chọn" name="checkmark-circle" />
                    ) : undefined
                  }
                  onPress={() => toggle(option.userId)}
                />
              );
            })}
          </View>
        )}
      </View>
    </BottomSheet>
  );
}
