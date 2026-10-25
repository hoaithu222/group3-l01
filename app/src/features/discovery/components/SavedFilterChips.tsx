import { useState } from 'react';
import { ScrollView, View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { SavedScopeFilter } from '@/shared/saved';
import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Chip } from '@/shared/ui/chip';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSelection } from '@/shared/utils/haptics';

import type { WorkspaceOption } from '../api/discovery.types';
import { useDiscoveryWorkspaces } from '../queries/saved.queries';

export interface SavedFilterChipsProps {
  scopeType: SavedScopeFilter | undefined;
  workspace: WorkspaceOption | null;
  onScopeTypeChange: (scopeType: SavedScopeFilter | undefined) => void;
  onWorkspaceChange: (workspace: WorkspaceOption | null) => void;
}

const TYPE_OPTIONS: { label: string; value: SavedScopeFilter | undefined }[] = [
  { label: 'Tất cả', value: undefined },
  { label: 'Kênh', value: 'CHANNEL' },
  { label: 'Tin nhắn', value: 'CONVERSATION' },
];

/**
 * Lọc "Đã lưu" (app.md p1-09 §2): loại phạm vi (Tất cả · Kênh · Tin nhắn) + nhóm làm việc. Danh sách nhóm chỉ tải khi
 * mở tờ chọn (`enabled`) — phần lớn lượt mở trang "Đã lưu" không đụng tới bộ lọc nhóm.
 */
export function SavedFilterChips({
  scopeType,
  workspace,
  onScopeTypeChange,
  onWorkspaceChange,
}: SavedFilterChipsProps) {
  const [sheetOpen, setSheetOpen] = useState(false);
  const workspaces = useDiscoveryWorkspaces(sheetOpen);

  const pick = (next: WorkspaceOption | null) => {
    if ((next?.id ?? null) !== (workspace?.id ?? null)) hapticSelection();
    onWorkspaceChange(next);
    setSheetOpen(false);
  };

  return (
    <>
      {/* ⛔ `grow-0`: `ScrollView` của RN mặc định `flexGrow: 1` (cả khi ngang). Nằm trong cột cùng một `flex-1` khác (danh sách
          bên dưới) thì hàng chip bị kéo cao ~nửa màn và chip trôi giữa khoảng trống — không lỗi nào báo. */}
      <ScrollView
        className="grow-0"
        horizontal
        keyboardShouldPersistTaps="handled"
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
      >
        <View className="flex-row items-center gap-xs px-md">
          {TYPE_OPTIONS.map((option) => (
            <Chip
              key={option.label}
              label={option.label}
              role="radio"
              selected={scopeType === option.value}
              size="sm"
              onPress={() => {
                if (scopeType !== option.value) hapticSelection(); // đổi bộ lọc = đổi lựa chọn
                onScopeTypeChange(option.value);
              }}
            />
          ))}
          <Chip
            label={workspace ? `Nhóm: ${workspace.name}` : 'Tất cả nhóm'}
            role="button"
            selected={workspace !== null}
            size="sm"
            trailing={<Icon name="arrow-down-small" size="sm" />}
            onPress={() => setSheetOpen(true)}
          />
        </View>
      </ScrollView>

      {/* Danh sách hàng có kẻ ngăn ⇒ `padded={false}` + `SheetList`: thân `padded` mặc định chèn khe 8 giữa các hàng (kẻ và hàng kế tiếp hở ra
          một dải trắng); `SheetList` giữ lề 16 mà hàng dính nhau. */}
      <BottomSheet
        padded={false}
        scrollable
        title="Lọc theo nhóm"
        visible={sheetOpen}
        onClose={() => setSheetOpen(false)}
      >
        <SheetList
          accessibilityLabel="Nhóm làm việc"
          accessibilityRole="radiogroup"
          className="pb-md"
        >
          <ListItem
            divider
            emphasis="title"
            label="Tất cả nhóm"
            // Ô icon "Nhóm" (icon + tông khớp ô Nhóm ở Trang chủ); từng nhóm bên dưới là avatar chữ viết tắt của tên nhóm.
            leading={<IconTile name="add-team" size="sm" tone="info" />}
            selected={workspace === null}
            trailing={
              workspace === null ? (
                <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />
              ) : undefined
            }
            onPress={() => pick(null)}
          />
          {workspaces.isLoading ? (
            <View className="py-xs">
              <SkeletonParagraphWithIcon className="py-xs" />
              <SkeletonParagraphWithIcon className="py-xs" />
            </View>
          ) : workspaces.isError ? (
            <EmptyState
              actions={[{ label: 'Thử lại', onPress: () => void workspaces.refetch() }]}
              description={toErrorMessage(workspaces.error)}
              icon="alert-warning"
              size="compact"
              title="Không tải được danh sách nhóm"
              tone="danger"
            />
          ) : (
            workspaces.data?.map((item, index) => (
              <ListItem
                key={item.id}
                divider={index < (workspaces.data?.length ?? 0) - 1}
                emphasis="title"
                label={item.name}
                labelNumberOfLines={2}
                leading={
                  // Trang trí: tên nhóm đã nằm ở nhãn hàng ⇒ ẩn avatar khỏi trình đọc màn hình (không đọc tên hai lần).
                  <View accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    <Avatar name={item.name} size="sm" />
                  </View>
                }
                selected={workspace?.id === item.id}
                trailing={
                  workspace?.id === item.id ? (
                    <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />
                  ) : undefined
                }
                onPress={() => pick(item)}
              />
            ))
          )}
        </SheetList>
      </BottomSheet>
    </>
  );
}
