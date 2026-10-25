import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import { EmptyState } from '@/shared/ui/empty-state';
import { ListItem } from '@/shared/ui/list';

import type { HeatmapDay } from '../api/contribution.types';
import { activeDaysNewestFirst, dayPartsText, fullDate } from '../utils/heatmap-grid';

export interface HeatmapDaySheetProps {
  days: readonly HeatmapDay[];
  visible: boolean;
  onClose: () => void;
}

/**
 * Bản CHỮ của biểu đồ hoạt động (app.md §7): mọi ngày CÓ hoạt động, mới → cũ, mỗi ngày một dòng "15/09/2026 — 7 hoạt động" kèm "4 thẻ, 2 bình luận, 1 lượt
 * chấm". Cho trình đọc màn hình (SVG bị ẩn) và cho ai muốn đọc số chính xác thay vì đoán theo màu. Chỉ ngày + số đếm, không giờ.
 */
export function HeatmapDaySheet({ days, visible, onClose }: HeatmapDaySheetProps) {
  const active = activeDaysNewestFirst(days);

  return (
    <BottomSheet padded={false} scrollable title="Hoạt động theo ngày" visible={visible} onClose={onClose}>
      {active.length === 0 ? (
        <EmptyState
          description="Chưa có ngày nào có hoạt động trong khoảng đang xem."
          icon="chart-1"
          size="compact"
          title="Chưa có hoạt động"
        />
      ) : (
        /* `SheetList`: tấm `padded={false}` + `ListItem` trần ⇒ ngày và số hoạt động dính sát hai mép tấm (`ListItem` không tự có lề). */
        <SheetList accessibilityRole="list" className="pb-md">
          {active.map((day, index) => (
            <ListItem
              key={day.date}
              description={dayPartsText(day)}
              divider={index < active.length - 1}
              label={fullDate(day.date)}
              value={`${day.total} hoạt động`}
            />
          ))}
        </SheetList>
      )}
    </BottomSheet>
  );
}
