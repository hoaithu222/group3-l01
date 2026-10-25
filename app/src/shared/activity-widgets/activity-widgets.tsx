import { Fragment, type ReactNode } from 'react';

/**
 * ĐIỂM NỐI thêm widget "việc đang chờ bạn" lên ĐẦU tab Hoạt động (p1-07) — vd "12 thẻ cần ôn hôm nay" (p4-02), "3 thẻ cần chấm" (p4-05) —
 * MÀ KHÔNG để `features/activity` import feature đó (`feature-structure.md` cấm import chéo). Cùng mẫu `@/shared/profile` (`registerProfileRow`),
 * `@/shared/board-extensions` và `@/shared/message-extensions`: feature nguồn đăng ký renderer ở nơi lắp ráp — import file
 * `register-activity-widgets` của feature (side-effect) trong `app/(app)/activity/_layout.tsx` — còn `activity` chỉ vẽ `<ActivityWidgetsSlot />`.
 *
 * Renderer là HÀM trả `ReactNode` (thường là `<XxxWidget />`) chứ không phải component: tra một component từ registry ngay lúc render bị
 * `react-hooks/static-components` chặn. Widget TỰ kiểm điều kiện hiện (cờ phân hệ `useFeature`, có việc hay không) và trả `null` khi không áp
 * dụng — slot không biết gì về dữ liệu. Đăng ký lặp cùng `id` chỉ ghi đè (an toàn với Fast Refresh); `null` là gỡ (test).
 *
 * ⚠️ Đăng ký TRƯỚC lần vẽ đầu của màn Hoạt động (import ở layout route, không phải trong effect) — nếu không thì widget chỉ hiện sau khi màn vẽ lại.
 * ⚠️ Widget nằm trong khối có `gap` của màn: đừng bọc thêm `View` rỗng khi ẩn (khoảng `gap` vẫn còn) — trả `null` thẳng.
 */
export type ActivityWidgetRenderer = () => ReactNode;

export interface ActivityWidgetOptions {
  /** Số nhỏ đứng trên. Mặc định 100; cùng số thì theo thứ tự đăng ký (`sort` của JS ổn định). */
  order?: number;
}

const DEFAULT_ORDER = 100;

const widgets = new Map<string, { order: number; render: ActivityWidgetRenderer }>();

export function registerActivityWidget(
  id: string,
  renderer: ActivityWidgetRenderer | null,
  options: ActivityWidgetOptions = {},
): void {
  if (renderer) widgets.set(id, { order: options.order ?? DEFAULT_ORDER, render: renderer });
  else widgets.delete(id);
}

/** Vẽ mọi widget đã đăng ký (chưa đăng ký nào — cờ tắt, test — thì không vẽ gì và màn giữ nguyên hình dạng cũ). */
export function ActivityWidgetsSlot(): ReactNode {
  if (widgets.size === 0) return null;
  return [...widgets.entries()]
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, { render }]) => <Fragment key={id}>{render()}</Fragment>);
}

/** Chỉ cho test — trả khe về trạng thái chưa đăng ký. */
export function resetActivityWidgets(): void {
  widgets.clear();
}
