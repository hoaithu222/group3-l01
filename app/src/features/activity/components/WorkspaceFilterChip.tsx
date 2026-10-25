import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Chip } from '@/shared/ui/chip';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { hapticSelection } from '@/shared/utils/haptics';

import type { ActivityWorkspaceOption } from '../api/activity.service';
import { useActivityWorkspaces } from '../hooks/useInbox';

export interface WorkspaceFilterChipProps {
  onChange: (workspace: ActivityWorkspaceOption | null) => void;
  value: ActivityWorkspaceOption | null;
}

/** Lọc hộp thư theo MỘT nhóm làm việc (hoặc tất cả). Danh sách nhóm chỉ tải khi mở tờ chọn. */
export function WorkspaceFilterChip({ onChange, value }: WorkspaceFilterChipProps) {
  const [open, setOpen] = useState(false);
  const workspaces = useActivityWorkspaces(open);

  const pick = (next: ActivityWorkspaceOption | null) => {
    // Đổi bộ lọc = đổi lựa chọn trong nhóm ⇒ nhịp "đổi lựa chọn" (chọn lại đúng nhóm đang lọc thì không rung).
    if ((next?.id ?? null) !== (value?.id ?? null)) hapticSelection();
    onChange(next);
    setOpen(false);
  };
  const selectedIcon = (
    <Icon color="fg-brand" label="Đang chọn" name="checkmark-circle" size="sm" />
  );

  return (
    <>
      <Chip
        label={value ? `Nhóm: ${value.name}` : 'Tất cả nhóm'}
        role="button"
        selected={value !== null}
        size="sm"
        trailing={<Icon name="arrow-down-small" size="sm" />}
        onPress={() => setOpen(true)}
      />
      {/* Danh sách hàng có kẻ ngăn ⇒ `padded={false}` + `SheetList`: thân `padded` mặc định chèn khe 8 giữa các hàng (kẻ và hàng kế tiếp hở ra
          một dải trắng); `SheetList` giữ lề 16 mà hàng dính nhau. */}
      <BottomSheet
        padded={false}
        scrollable
        title="Lọc theo nhóm"
        visible={open}
        onClose={() => setOpen(false)}
      >
        <SheetList
          accessibilityLabel="Nhóm làm việc"
          accessibilityRole="radiogroup"
          className="pb-md"
        >
          {/* Hàng "Tất cả" mang ô icon của phân hệ Nhóm (`add-team` · `info`); từng nhóm mang avatar chữ viết tắt (bo góc — dáng
              avatar NHÓM, khác avatar người) để danh sách không còn là một cột chữ trơn. */}
          <ListItem
            divider
            emphasis="title"
            label="Tất cả nhóm"
            leading={<IconTile name="add-team" size="sm" tone="info" />}
            selected={value === null}
            trailing={value === null ? selectedIcon : undefined}
            onPress={() => pick(null)}
          />
          {workspaces.isLoading ? (
            // Khung xương CÙNG HÌNH hàng nhóm (ô tròn + chữ) — thanh xám trơn cao 40 trông như một ô nhập chứ không phải hàng danh sách.
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
                    <Avatar name={item.name} shape="rounded" size="sm" />
                  </View>
                }
                selected={value?.id === item.id}
                trailing={value?.id === item.id ? selectedIcon : undefined}
                onPress={() => pick(item)}
              />
            ))
          )}
        </SheetList>
      </BottomSheet>
    </>
  );
}
