import type { ReactNode } from 'react';

/**
 * ĐIỂM NỐI phần mở rộng vào thẻ hồ sơ ở màn Tôi (cấp độ + chuỗi ngày của p4-03…) mà KHÔNG để `features/me`
 * import feature khác (`feature-structure.md` cấm import chéo). Cùng mẫu `registerCallActionsRenderer` của
 * `@/shared/calls`: feature nguồn đăng ký MỘT renderer ở nơi lắp ráp (`app/(app)/_layout.tsx`, module scope),
 * `MeScreen` chỉ vẽ `<ProfileExtrasSlot />`.
 *
 * Renderer là HÀM trả `ReactNode` chứ không phải component: tra một component từ registry ngay lúc render bị
 * `react-hooks/static-components` chặn (mỗi lần vẽ là một kiểu component mới, state con bị reset). Chưa đăng ký
 * (test, cờ tắt) ⇒ slot không vẽ gì — thẻ hồ sơ giữ nguyên hình dạng cũ.
 */
export type ProfileExtrasRenderer = () => ReactNode;

let renderer: ProfileExtrasRenderer | null = null;

export function registerProfileExtrasRenderer(next: ProfileExtrasRenderer | null): void {
  renderer = next;
}

export function ProfileExtrasSlot(): ReactNode {
  return renderer ? renderer() : null;
}
