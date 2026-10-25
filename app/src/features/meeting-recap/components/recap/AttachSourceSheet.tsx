import { pickDocuments, pickImages } from '@/core/media/pick-media';
import type { PickedFile } from '@/core/uploads/upload.types';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

export interface AttachSourceSheetProps {
  /** Còn nhận được bao nhiêu tệp — giới hạn số ảnh chọn một lượt. */
  remaining: number;
  visible: boolean;
  onClose: () => void;
  onPicked: (files: PickedFile[]) => void;
}

interface AttachSource {
  description: string;
  icon: IconName;
  key: 'documents' | 'library';
  label: string;
  tone: IconTileTone;
}

/** Tông chỉ để phân biệt hai nguồn cho sinh động (không mang nghĩa trạng thái) — cùng bộ với tấm đính kèm của `boards`/chat. */
const SOURCES: readonly AttachSource[] = [
  {
    description: 'Chọn từ thư viện trên máy',
    icon: 'image',
    key: 'library',
    label: 'Ảnh từ thư viện',
    tone: 'success',
  },
  {
    description: 'Tài liệu, PDF, bảng tính…',
    icon: 'document',
    key: 'documents',
    label: 'Tệp',
    tone: 'warning',
  },
];

/**
 * Chọn nguồn tệp đính kèm biên bản: ảnh thư viện · tệp (PDF, Office…). Đóng tấm TRƯỚC khi mở bộ chọn của hệ điều hành (hai cửa sổ chồng
 * nhau làm bộ chọn ảnh không hiện trên một số máy Android). Không xin quyền ở đây: `pick-media` tự xin đúng quyền cần.
 * ⚠️ Viết cục bộ: bản cùng dáng của `boards` (`AttachSourceSheet`) không nhập chéo được (`feature-structure.md`).
 *
 * Mỗi nguồn là MỘT hàng `ListItem` (ô icon có tông + tiêu đề + mô tả) trong `SheetList` — cùng dáng bản của `boards`. Trước đây là hai
 * `Button secondary` KHÔNG `fullWidth` nên hai viên thuốc ôm chữ dài ngắn lệch nhau, dạt về mép trái.
 */
export function AttachSourceSheet({
  remaining,
  visible,
  onClose,
  onPicked,
}: AttachSourceSheetProps) {
  const pickers: Record<AttachSource['key'], () => Promise<PickedFile[]>> = {
    documents: pickDocuments,
    library: () => pickImages({ selectionLimit: Math.max(1, remaining) }),
  };
  const run = (pick: () => Promise<PickedFile[]>) => {
    // ⛔ Giữ thứ tự: đóng tấm TRƯỚC rồi mới gọi bộ chọn (xem chú thích đầu component).
    onClose();
    void pick().then(onPicked);
  };

  return (
    <BottomSheet padded={false} title="Đính kèm vào biên bản" visible={visible} onClose={onClose}>
      {/* `SheetList` = lề 16 (tấm tràn viền không đệm, `ListItem` cũng không). `pb-md`: tấm không có `footer`. */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {SOURCES.map((source, index) => (
          <ListItem
            key={source.key}
            className="min-h-14"
            description={source.description}
            divider={index < SOURCES.length - 1}
            emphasis="title"
            label={source.label}
            leading={<IconTile name={source.icon} tone={source.tone} />}
            onPress={() => run(pickers[source.key])}
          />
        ))}
      </SheetList>
    </BottomSheet>
  );
}
