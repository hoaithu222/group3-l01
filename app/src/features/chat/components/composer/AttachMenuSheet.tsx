import type { ReactNode } from 'react';

import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

export interface AttachMenuSheetProps {
  visible: boolean;
  onClose: () => void;
  onPickImages: () => void;
  onTakePhoto: () => void;
  onPickDocuments: () => void;
  /**
   * Dòng thêm do feature khác đăng ký (khe `attachRows` của `@/shared/message-extensions`: Khảo sát, Hẹn giờ gửi — p7-04). Nằm SAU "Tệp". Mỗi dòng tự mang
   * vạch kẻ TRÊN nó (không phải `divider` của dòng "Tệp"): khe rỗng (cờ tắt) thì "Tệp" vẫn là dòng cuối, không có vạch cụt dưới cùng.
   */
  extraRows?: ReactNode;
}

/**
 * Menu đính kèm — Chụp ảnh · Ảnh/video · Tệp (app.md §3 `Composer`; bố cục bám `ComposerAttachSheet` của vci-sun-mobile).
 *
 * Mỗi lựa chọn là MỘT hàng: ô icon màu (`IconTile`) + tiêu đề + mô tả ngắn, cao ≥ 56dp (`min-h-14`, chuẩn hàng trong tấm — hàng
 * chỉ-nhãn 44dp trong `Card` quá bé cho tấm chọn-một-trong-N). Tông màu chỉ để phân biệt ba lựa chọn cho sinh động (không mang nghĩa trạng thái).
 *
 * ⛔ Lỗi "tấm không có lề nội dung": `padded={false}` bỏ đệm ngang của `BottomSheet` (để hàng danh sách tràn viền), và `ListItem` cũng KHÔNG
 * tự có đệm ngang (nó vốn nằm trong `Card`) ⇒ ô icon dính sát mép tấm, lệch 16dp so với tiêu đề. Nên bọc hàng bằng `SheetList` (= `px-md`) —
 * đúng cách `ActionMenuSheet` làm, thay cho lớp `View px-md` tự dựng. `pb-md` chừa khoảng thở dưới hàng cuối (tấm đã tự cộng vùng an toàn đáy).
 * ⚠️ Ô icon giữ cỡ `md` (40) chứ không `sm`: dòng thêm của khe (`ChatExtAttachRows`, feature khác) cũng `md` — lệch cỡ giữa hai nhóm hàng
 * trong cùng một tấm là thứ mắt bắt ra ngay.
 *
 * Chưa có icon `camera` trong bộ icon xuất từ Figma ⇒ "Chụp ảnh" dùng `add-image` (ảnh có dấu cộng, gần nghĩa nhất).
 */
export function AttachMenuSheet({
  visible,
  onClose,
  onPickImages,
  onTakePhoto,
  onPickDocuments,
  extraRows,
}: AttachMenuSheetProps) {
  const choose = (action: () => void) => () => {
    onClose();
    action();
  };

  return (
    <BottomSheet padded={false} snapToContent title="Đính kèm" visible={visible} onClose={onClose}>
      <SheetList accessibilityRole="menu" className="pb-md">
        <ListItem
          className="min-h-14"
          description="Mở camera để chụp và gửi ngay"
          divider
          emphasis="title"
          label="Chụp ảnh"
          leading={<IconTile name="add-image" tone="info" />}
          onPress={choose(onTakePhoto)}
        />
        <ListItem
          className="min-h-14"
          description="Chọn từ thư viện trên máy"
          divider
          emphasis="title"
          label="Ảnh / video"
          leading={<IconTile name="image" tone="success" />}
          onPress={choose(onPickImages)}
        />
        <ListItem
          className="min-h-14"
          description="Tài liệu, PDF, bảng tính…"
          emphasis="title"
          label="Tệp"
          leading={<IconTile name="document" tone="warning" />}
          onPress={choose(onPickDocuments)}
        />
        {extraRows}
      </SheetList>
    </BottomSheet>
  );
}
