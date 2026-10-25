import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';

import type { TocEntry } from '../../utils/block-anchors';

export interface TocSheetProps {
  entries: readonly TocEntry[];
  visible: boolean;
  onClose: () => void;
  onSelect: (anchor: string) => void;
}

/** Mục lục H2/H3 của buổi (app.md §7.3) — chạm một mục để cuộn tới (`ContentTab` đo vị trí bằng `onLayout`). */
export function TocSheet({ entries, onClose, onSelect, visible }: TocSheetProps) {
  return (
    <BottomSheet padded={false} scrollable title="Mục lục" visible={visible} onClose={onClose}>
      {/* `pb-md`: tấm KHÔNG có footer ⇒ hàng cuối cần khe dưới, không thì dính sát mép đáy tấm (cùng mẫu `NotifyModeSheet`). */}
      <SheetList accessibilityRole="menu" className="pb-md">
        {entries.map((entry, index) => (
          <ListItem
            key={entry.anchor}
            divider={index < entries.length - 1}
            label={entry.text}
            // ⚠️ `fg-2`, không `fg-3`: mũi tên là dấu hiệu CẤP (H3 nằm dưới H2) — hình mang nghĩa cần ≥ 3:1, `fg-3` chỉ 2.96:1.
            leading={
              entry.level === 3 ? (
                <Icon color="fg-2" name="arrow-right-small" size="sm" />
              ) : undefined
            }
            onPress={() => onSelect(entry.anchor)}
          />
        ))}
      </SheetList>
    </BottomSheet>
  );
}
