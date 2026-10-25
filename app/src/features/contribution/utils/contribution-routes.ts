import type { Href } from 'expo-router';

/**
 * Href của màn "Đóng góp" (`/workspaces/[wsId]/boards/[boardId]/contribution`).
 *
 * ⚠️ Vì sao ép kiểu `as Href` ở đây mà không dùng `{ pathname, params }` có kiểu: bộ sinh typed routes (`.expo/types/router.d.ts`) chỉ chạy dưới
 * `expo start`, nên với một route MỚI thêm vào thì `tsc` xanh/đỏ tuỳ lúc sinh; chuỗi thật đúng ở MỌI trường hợp lúc chạy (cùng lý do `boards/utils/board-routes.ts`).
 * Gom cái ép kiểu vào MỘT file để khi đường dẫn đổi chỉ sửa một chỗ (`navigation.md` "Typed routes").
 */
export function contributionHref(wsId: string, boardId: string, params?: { exportId?: string; period?: string }): Href {
  const query = new URLSearchParams();
  if (params?.period) query.set('period', params.period);
  if (params?.exportId) query.set('exportId', params.exportId);
  const suffix = query.toString();
  return `/workspaces/${wsId}/boards/${boardId}/contribution${suffix ? `?${suffix}` : ''}` as Href;
}

/**
 * Href của màn "Hoạt động của nhóm" (`/workspaces/[wsId]/boards/activity`) — nằm cạnh `boards/new`, đứng TRƯỚC `boards/[boardId]` (đoạn tĩnh thắng đoạn động). Cùng lý do
 * ép kiểu `as Href` như `contributionHref`.
 */
export function workspaceActivityHref(wsId: string): Href {
  return `/workspaces/${wsId}/boards/activity` as Href;
}
