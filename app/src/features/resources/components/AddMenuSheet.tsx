import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

export type AddMenuKey = 'camera' | 'documents' | 'folder' | 'images' | 'video';

interface AddMenuOption {
  icon: IconName;
  key: AddMenuKey;
  label: string;
  tone: IconTileTone;
}

const OPTIONS: readonly AddMenuOption[] = [
  { icon: 'upload', key: 'documents', label: 'Tải tệp lên', tone: 'brand' },
  // Ảnh chọn NHIỀU được (`pickImages`), video chỉ một (`pickVideo`) — trình chọn chung chưa gộp hai loại.
  { icon: 'image', key: 'images', label: 'Ảnh từ thư viện', tone: 'success' },
  { icon: 'play', key: 'video', label: 'Video từ thư viện', tone: 'info' },
  { icon: 'add-image', key: 'camera', label: 'Chụp ảnh', tone: 'warning' },
  { icon: 'add-square', key: 'folder', label: 'Tạo thư mục', tone: 'accent' },
];

export interface AddMenuSheetProps {
  onClose: () => void;
  onSelect: (key: AddMenuKey) => void;
  /** Tải lên/chụp ảnh cần mạng — offline thì bỏ các mục đó, chỉ chừa "Tạo thư mục" (cũng cần mạng nên ẩn luôn). */
  online: boolean;
  visible: boolean;
  /** Theo `capabilities`: có thể chỉ được tải lên mà không được tạo thư mục (hoặc ngược lại). */
  canCreateFolder: boolean;
  canUpload: boolean;
}

/**
 * Nút "+" của FileExplorer (app.md p3-01 §3): Tải tệp · Ảnh/Video · Chụp ảnh · Tạo thư mục. Vẽ hàng bằng `ListItem` (ô icon
 * có tông dẫn đầu + kẻ ngăn) — tông xoay vòng cho từng nguồn; "Tạo thư mục" cùng tông `accent` với ô thư mục trong lưới.
 */
export function AddMenuSheet({
  canCreateFolder,
  canUpload,
  onClose,
  onSelect,
  online,
  visible,
}: AddMenuSheetProps) {
  const options = OPTIONS.filter((option) =>
    option.key === 'folder' ? canCreateFolder : canUpload,
  );

  return (
    <BottomSheet padded={false} title="Thêm vào kho" visible={visible} onClose={onClose}>
      {!online ? (
        // Ngoại tuyến = `EmptyState` gọn tông `neutral` (quy ước của bộ chung) thay cho dòng chữ trần. Nó tự có lề 16 nên
        // đứng NGOÀI `SheetList` (bọc vào là thụt 32).
        <EmptyState
          description="Kết nối lại để tải lên hoặc tạo thư mục."
          icon="upload"
          size="compact"
          tone="neutral"
        />
      ) : (
        // `SheetList` lo lề 16 cho các hàng — `ListItem` không tự có lề trong tấm `padded={false}`.
        <SheetList accessibilityRole="menu" className="pb-md">
          {options.map((option, index) => (
            <ListItem
              key={option.key}
              divider={index < options.length - 1}
              emphasis="title"
              label={option.label}
              leading={<IconTile name={option.icon} size="sm" tone={option.tone} />}
              onPress={() => {
                onClose();
                onSelect(option.key);
              }}
            />
          ))}
        </SheetList>
      )}
    </BottomSheet>
  );
}
