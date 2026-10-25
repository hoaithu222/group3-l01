import type { Href } from 'expo-router';

/**
 * Đường dẫn màn của feature — MỘT nơi để đổi. Route nằm dưới `app/(app)/me/**` (KHÔNG phải `(app)/…` cấp trên như app.md p7-04 ghi: thư mục/tệp MỚI cấp `(app)/`
 * bị Expo Router tự dựng thành TAB; `me/` đã có `_layout.tsx` kiểu Stack nên màn con không thành tab).
 *
 * ⛔ Mỗi hàm trả `Href` bằng `return` tường minh — KHÔNG `cond ? a : b` / `a ?? b` trong MỘT biểu thức: `Href` đã hàng trăm mục, TS rút gọn union quá giới hạn (TS2590).
 * Cần rẽ nhánh thì `if`/`return`.
 */
export const ME_SCHEDULED_HREF = '/me/scheduled-messages' satisfies Href;
export const ME_REMINDERS_HREF = '/me/reminders' satisfies Href;

/** "Tin đã hẹn" lọc theo MỘT phòng (mở từ banner trên ô soạn) — `scopeType`/`scopeId` là tham số lọc của `GET /me/scheduled-messages`. */
export function scheduledOfScopeHref(scopeType: 'CHANNEL' | 'CONVERSATION', scopeId: string): Href {
  return { pathname: '/me/scheduled-messages', params: { scopeType, scopeId } };
}

/** Mở thẻ công việc vừa tạo (route của `boards`, khai ở đây để không import chéo feature). */
export function taskHref(wsId: string, boardId: string, taskId: string): Href {
  return {
    pathname: '/workspaces/[wsId]/boards/[boardId]/tasks/[taskId]',
    params: { wsId, boardId, taskId },
  };
}

/** Mở kho tài liệu của nhóm (route của `resources`, khai ở đây để không import chéo feature) — nút "Mở tài liệu" sau khi lưu tệp của tin. */
export function resourcesHref(wsId: string): Href {
  return { pathname: '/workspaces/[wsId]/resources', params: { wsId } };
}
