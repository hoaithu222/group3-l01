import type { Href } from 'expo-router';

/**
 * Đường dẫn màn của feature — MỘT nơi để đổi. Route nằm dưới `app/(app)/me/wellbeing/**` (KHÔNG phải `(app)/wellbeing/**`: thư mục mới cấp `(app)/` bị
 * Expo Router tự dựng thành TAB; `me/` có `_layout.tsx` kiểu Stack nên màn con không thành tab).
 *
 * ⛔ Mỗi hằng `satisfies Href` — KHÔNG `cond ? a : b` / `a ?? b` tạo `Href` trong một biểu thức: union `Href` đã vài trăm mục, TS rút gọn quá giới hạn
 * (TS2590). Cần chọn giữa hai đích thì `if/else` hai lệnh `router.replace`.
 */
export const WELLBEING_HREF = '/me/wellbeing' satisfies Href;
export const WELLBEING_ONBOARDING_HREF = '/me/wellbeing/onboarding' satisfies Href;
export const WELLBEING_SETTINGS_HREF = '/me/wellbeing/settings' satisfies Href;
/** P1 — `TakeABreakScreen` (mở dạng modal, `_layout.tsx`). */
export const WELLBEING_BREAK_HREF = '/me/wellbeing/break' satisfies Href;

/** Mọi màn của nhánh (đường dẫn đã bỏ nhóm `(app)`): cảnh báo nổi KHÔNG hiện ở đây — màn Sức khoẻ tự có thẻ cảnh báo, còn Cài đặt là nơi tắt. */
export const isWellbeingRoute = (pathname: string | null | undefined): boolean =>
  Boolean(pathname && /^\/me\/wellbeing(\/|$)/.test(pathname));
