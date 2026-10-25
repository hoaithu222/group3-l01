import type { Href } from 'expo-router';

/**
 * Href của các màn chấm chéo (p4-05 app.md §1). Ép kiểu `as Href` vì route mới chưa chắc đã có trong `.expo/types/router.d.ts`
 * (sinh lúc `expo start`); chuỗi thật đúng ở mọi trường hợp — cùng lý do `board-routes.ts`. Đổi đường dẫn phải sửa CẢ
 * `core/notifications/review-route.ts` (bảng `type → route` của thông báo, không import được từ feature).
 */
export function reviewSubmitHref(wsId: string, boardId: string, taskId: string): Href {
  return `/workspaces/${wsId}/boards/${boardId}/tasks/${taskId}/review` as Href;
}

export function reviewSettingsHref(wsId: string, boardId: string): Href {
  return `/workspaces/${wsId}/boards/${boardId}/review-settings` as Href;
}

/** "Cần chấm của tôi" — nằm trong ngăn xếp của tab Tôi. */
export const MY_REVIEWS_HREF = '/me/reviews' as Href;
