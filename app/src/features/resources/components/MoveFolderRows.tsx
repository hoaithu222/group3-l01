import { View } from 'react-native';

import { SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import type { FolderDto } from '../api';

export interface MoveFolderRowsProps {
  folders: readonly FolderDto[];
  isError: boolean;
  isLoading: boolean;
  /** Id thư mục ĐANG được di chuyển (không vào được — cả cây con của nó cũng không); `null` khi di chuyển tệp. */
  movingFolderId: string | null;
  onOpen: (folder: FolderDto) => void;
  onRetry: () => void;
}

/** 3 hàng khung xương — cùng dáng "ô icon + hai dòng" với hàng thư mục thật. */
const SKELETON_ROWS = [0, 1, 2] as const;

/**
 * Thân của `MoveToFolderSheet` (tấm tràn viền): danh sách thư mục con của cấp đang xem + ba trạng thái tải / lỗi / rỗng.
 *
 * Hàng là `ListItem` điều hướng (ô thư mục tông `accent` như lưới kho · tên ≤ 2 dòng · mũi tên `›` · kẻ ngăn giữa các
 * hàng) trong `SheetList`. ❌ Trước đây là hàng `Pressable` tự dựng, kẻ `border-b` cả ở hàng cuối, lại nằm trong khối
 * `gap-xs` nên kẻ và hàng kế hở một dải trắng. Thư mục đang di chuyển: khoá + dòng phụ "Đang di chuyển" (không chỉ đổi màu).
 */
export function MoveFolderRows({
  folders,
  isError,
  isLoading,
  movingFolderId,
  onOpen,
  onRetry,
}: MoveFolderRowsProps) {
  if (isLoading) {
    return (
      <View className="gap-md px-md py-sm">
        {SKELETON_ROWS.map((key) => (
          <SkeletonParagraphWithIcon key={key} />
        ))}
      </View>
    );
  }
  if (isError) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry }]}
        description="Không tải được danh sách thư mục."
        icon="alert-warning"
        size="compact"
        title="Không tải được thư mục"
        tone="danger"
      />
    );
  }
  if (folders.length === 0) {
    return (
      <EmptyState
        description="Chưa có thư mục con ở đây."
        icon="book"
        size="compact"
        tone="neutral"
      />
    );
  }

  return (
    // Không `pb-md`: tấm có `footer` ("Di chuyển vào đây"), khe dưới hàng cuối do vùng đáy lo.
    <SheetList accessibilityLabel="Thư mục con" accessibilityRole="list">
      {folders.map((folder, index) => {
        const isSelf = folder.id === movingFolderId;
        return (
          <ListItem
            key={folder.id}
            description={isSelf ? 'Đang di chuyển' : undefined}
            disabled={isSelf}
            divider={index < folders.length - 1}
            emphasis="title"
            label={folder.name}
            labelNumberOfLines={2}
            // Cùng ô thư mục tông `accent` như lưới kho; thư mục đang di chuyển (không chọn được) về `neutral`.
            leading={<IconTile name="book" size="sm" tone={isSelf ? 'neutral' : 'accent'} />}
            // Mũi tên trang trí (không `label` ⇒ ẩn khỏi trình đọc màn hình) — chỉ ở hàng vào được.
            trailing={isSelf ? undefined : <Icon color="fg-2" name="arrow-right-small" size="sm" />}
            onPress={() => onOpen(folder)}
          />
        );
      })}
    </SheetList>
  );
}
