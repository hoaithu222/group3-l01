import { useState } from 'react';
import { View } from 'react-native';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { Input } from '@/shared/ui/input';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { toErrorMessage } from '@/shared/utils/errors';
import { formatFileSize } from '@/shared/utils/format/file-size.utils';

import { PICKER_MIN_QUERY } from '../api/resource-picker.service';
import type { PickableWorkspace } from '../api/resource-picker.service';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { usePickerPdfs, usePickerWorkspaces } from '../queries/resource-picker.queries';

export interface ResourcePickerSheetProps {
  visible: boolean;
  onClose: () => void;
  onPick: (resource: { id: string; name: string }) => void;
}

/** Khung chờ cùng DÁNG hàng thật (icon + dòng chữ) — hai khối xám trơn không cho biết sắp hiện gì. */
function LoadingRows() {
  return (
    <View className="gap-md py-xs">
      <SkeletonParagraphWithIcon />
      <SkeletonParagraphWithIcon />
      <SkeletonParagraphWithIcon />
    </View>
  );
}

/**
 * Chọn PDF từ tài liệu của NHÓM (app.md §3 `FileSourcePicker` "Từ tài liệu nhóm"): bước 1 chọn nhóm, bước 2 chọn tệp (danh sách gốc, hoặc gõ ≥ 2 ký tự
 * để tìm cả nhóm). Chọn xong trả `{ id, name }` — đơn tham chiếu asset HIỆN TẠI của tài liệu lúc tạo đơn (snapshot, README p6-05 §2), người đặt phải có
 * quyền đọc; mất quyền giữa chừng thì tạo đơn báo "Không còn quyền với tài liệu". `padded={false}` + `SheetList`: hàng kẻ ngăn dính nhau (`ui-component`).
 */
export function ResourcePickerSheet({ visible, onClose, onPick }: ResourcePickerSheetProps) {
  const [workspace, setWorkspace] = useState<PickableWorkspace | null>(null);
  const [text, setText] = useState('');
  const query = useDebouncedValue(text, 400);
  const workspaces = usePickerWorkspaces(visible);
  const files = usePickerPdfs(workspace?.id ?? null, query);
  const items = files.data?.pages.flatMap((page) => page.items) ?? [];

  const close = () => {
    setWorkspace(null);
    setText('');
    onClose();
  };

  const body = workspace ? (
    <SheetList className="gap-xs pb-md">
      <Input
        accessibilityLabel="Tìm tên tệp PDF"
        autoCapitalize="none"
        autoCorrect={false}
        hint={`Gõ từ ${PICKER_MIN_QUERY} ký tự để tìm cả nhóm — không gõ thì chỉ hiện tài liệu ở thư mục gốc`}
        placeholder="Tìm tên tệp PDF"
        value={text}
        onChangeText={setText}
      />
      {files.isPending ? (
        <LoadingRows />
      ) : files.isError ? (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void files.refetch() }]}
          description={toErrorMessage(files.error)}
          icon="alert-warning"
          size="compact"
          title="Không tải được tài liệu"
          tone="danger"
        />
      ) : items.length === 0 ? (
        <EmptyState
          description="Nhóm này chưa có tệp PDF ở đây. Bạn có thể tải PDF lên từ máy."
          icon="document-2"
          size="compact"
          title="Không có tệp PDF"
          tone="neutral"
        />
      ) : (
        // ⚠️ Bọc riêng: `gap-xs` của khối ngoài (ô tìm ↔ danh sách ↔ "Xem thêm") chèn vào GIỮA các hàng thì kẻ ngăn hở một dải trắng.
        <View>
          {items.map((item, index) => (
            <ListItem
              key={item.id}
              description={formatFileSize(item.size)}
              divider={index < items.length - 1}
              emphasis="title"
              label={item.name}
              leading={<Icon color="fg-brand" name="document-2" size="sm" />}
              onPress={() => {
                onPick({ id: item.id, name: item.name });
                close();
              }}
            />
          ))}
        </View>
      )}
      {files.hasNextPage ? (
        <Button
          fullWidth
          label="Xem thêm"
          loading={files.isFetchingNextPage}
          variant="secondary"
          onPress={() => void files.fetchNextPage()}
        />
      ) : null}
    </SheetList>
  ) : (
    <SheetList className="pb-md">
      {workspaces.isPending ? (
        <LoadingRows />
      ) : workspaces.isError ? (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void workspaces.refetch() }]}
          description={toErrorMessage(workspaces.error)}
          icon="alert-warning"
          size="compact"
          title="Không tải được danh sách nhóm"
          tone="danger"
        />
      ) : (workspaces.data ?? []).length === 0 ? (
        <EmptyState
          description="Bạn chưa thuộc nhóm nào. Hãy tải PDF lên từ máy."
          icon="add-team"
          size="compact"
          title="Chưa có nhóm"
          tone="neutral"
        />
      ) : (
        (workspaces.data ?? []).map((item, index, all) => (
          <ListItem
            key={item.id}
            divider={index < all.length - 1}
            emphasis="title"
            label={item.name}
            trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
            onPress={() => setWorkspace(item)}
          />
        ))
      )}
    </SheetList>
  );

  return (
    <BottomSheet
      footer={
        workspace ? (
          <Button
            fullWidth
            iconLeft="arrow-left-small"
            label="Chọn nhóm khác"
            variant="secondary"
            onPress={() => {
              setWorkspace(null);
              setText('');
            }}
          />
        ) : undefined
      }
      padded={false}
      scrollable
      title={workspace ? workspace.name : 'Chọn nhóm có tài liệu'}
      visible={visible}
      onClose={close}
    >
      {body}
    </BottomSheet>
  );
}
