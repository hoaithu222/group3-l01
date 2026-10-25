import { Fragment, type ReactNode } from 'react';

/**
 * ĐIỂM NỐI thêm khối THỐNG KÊ / tóm tắt vào Trang chủ (hoạt động trong tuần, chuỗi ngày chăm chỉ, giờ tập trung…)
 * MÀ KHÔNG để `features/home` import feature nguồn (`feature-structure.md` cấm import chéo). Cùng mẫu
 * `@/shared/activity-widgets`: feature nguồn đăng ký renderer ở nơi lắp ráp — import file `register-home-widgets`
 * của feature (side-effect) trong `app/(app)/_layout.tsx` — còn `home` chỉ vẽ `<HomeWidgetsSlot />`.
 *
 * Renderer là HÀM trả `ReactNode` chứ không phải component: tra một component từ registry ngay lúc render bị
 * `react-hooks/static-components` chặn. Widget TỰ kiểm điều kiện hiện (cờ phân hệ `useFeature`, có dữ liệu hay
 * chưa) và trả `null` khi không áp dụng — slot không biết gì về dữ liệu. Đăng ký lặp cùng `id` chỉ ghi đè (an
 * toàn với Fast Refresh); `null` là gỡ (test).
 *
 * ⚠️ Đăng ký TRƯỚC lần vẽ đầu của Trang chủ (import ở layout route, không phải trong effect).
 * ⚠️ Widget nằm trong khối có `gap` của màn: ẩn thì trả `null` thẳng, ⛔ đừng bọc `View` rỗng (khoảng `gap` vẫn còn).
 */
export type HomeWidgetRenderer = () => ReactNode;

export interface HomeWidgetOptions {
  /** Số nhỏ đứng trên. Mặc định 100; cùng số thì theo thứ tự đăng ký (`sort` của JS ổn định). */
  order?: number;
}

const DEFAULT_ORDER = 100;

const widgets = new Map<string, { order: number; render: HomeWidgetRenderer }>();

export function registerHomeWidget(
  id: string,
  renderer: HomeWidgetRenderer | null,
  options: HomeWidgetOptions = {},
): void {
  if (renderer) widgets.set(id, { order: options.order ?? DEFAULT_ORDER, render: renderer });
  else widgets.delete(id);
}

/** Vẽ mọi widget đã đăng ký (chưa đăng ký nào — cờ tắt, test — thì không vẽ gì). */
export function HomeWidgetsSlot(): ReactNode {
  if (widgets.size === 0) return null;
  return [...widgets.entries()]
    .sort(([, a], [, b]) => a.order - b.order)
    .map(([id, { render }]) => <Fragment key={id}>{render()}</Fragment>);
}

/** Chỉ cho test — trả khe về trạng thái chưa đăng ký. */
export function resetHomeWidgets(): void {
  widgets.clear();
}
