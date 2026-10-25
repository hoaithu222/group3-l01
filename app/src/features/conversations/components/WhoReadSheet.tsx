import { Avatar } from '@/shared/ui/avatar';
import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';
import { formatRelative } from '@/shared/utils/format/date.utils';

import type { ReadReceiptEntry } from '../api/conversations.types';

export interface WhoReadSheetProps {
  visible: boolean;
  onClose: () => void;
  readers: ReadReceiptEntry[];
}

/**
 * app.md §3 — danh sách đầy đủ "Đã xem" cho GROUP, mở từ `SeenAvatars`.
 *
 * Cùng dáng hàng với `WhoReactedSheet` của chat (ai đã thả cảm xúc): `ListItem` + ảnh 32dp + tên chữ chính, giờ xem ở cột giá trị
 * (`tone="muted"`, chữ phụ) và kẻ ngăn giữa các hàng — bản cũ là hàng tự dựng, lệch cỡ chữ/khe so với tấm kia dù hai tấm cùng một ý.
 * `padded={false}` + `SheetList`: `ListItem` KHÔNG tự có lề ngang, thiếu lớp này ảnh đại diện dính sát mép tấm.
 */
export function WhoReadSheet({ visible, onClose, readers }: WhoReadSheetProps) {
  return (
    <BottomSheet padded={false} scrollable title="Đã xem" visible={visible} onClose={onClose}>
      {readers.length === 0 ? (
        // Hiếm (`SeenAvatars` chỉ mở tấm khi đã có người xem) nhưng có thật: danh sách làm mới về rỗng lúc tấm đang mở.
        <EmptyState
          description="Chưa có ai xem tin nhắn này."
          icon="view"
          size="compact"
          tone="neutral"
        />
      ) : (
        <SheetList accessibilityRole="list" className="pb-md">
          {readers.map((reader, index) => (
            <ListItem
              key={reader.userId}
              // Hàng chỉ để đọc (không `onPress`) mặc định `items-start` — canh giữa để tên thẳng tâm ảnh 32dp.
              className="items-center"
              divider={index < readers.length - 1}
              emphasis="title"
              // ⚠️ Không `labelNumberOfLines`: `ListItem` chia đôi hàng cho tên và giờ (hai cột `flex-1`), cắt một dòng là họ tên
              // Việt ~16 ký tự đã thành "Trần Thị Thanh…" — hai người cùng họ đệm không phân biệt được. Tên dài thì xuống dòng.
              label={reader.name}
              leading={
                <Avatar
                  name={reader.name}
                  size="sm"
                  source={reader.avatarUrl ? { uri: reader.avatarUrl } : undefined}
                />
              }
              tone="muted"
              value={formatRelative(reader.readAt)}
            />
          ))}
        </SheetList>
      )}
    </BottomSheet>
  );
}
