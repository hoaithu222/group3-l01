import type { Href } from 'expo-router';

/**
 * Href của hai route CHỈ-CÓ-`index` (`boards/index.tsx`, `boards/[boardId]/index.tsx`).
 *
 * ⚠️ Vì sao ép kiểu `as Href` ở đây mà các route khác dùng `{ pathname, params }`
 * có kiểu: bộ sinh typed routes (`.expo/types/router.d.ts`) khi chạy dưới
 * `expo start` có hai cách sinh cho route `index` — lúc quét cả thư mục thì ra
 * `/workspaces/[wsId]/boards`, nhưng lúc file mới được THÊM khi dev server đang
 * chạy nền thì ra `/workspaces/[wsId]/boards/index`. Hai dạng loại trừ nhau nên
 * `tsc` xanh/đỏ tuỳ lúc sinh; chuỗi thật `/workspaces/<id>/boards` thì đúng ở
 * MỌI trường hợp lúc chạy. Gom cái ép kiểu vào MỘT file để khi đường dẫn đổi chỉ
 * sửa một chỗ (`navigation.md` "Typed routes").
 */
export function boardListHref(wsId: string): Href {
  return `/workspaces/${wsId}/boards` as Href;
}

export function boardHref(wsId: string, boardId: string): Href {
  return `/workspaces/${wsId}/boards/${boardId}` as Href;
}

/** Màn Gantt "Dòng thời gian" của một bảng (p4-04) — cùng lý do ép kiểu `as Href` như hai hàm trên. */
export function boardGanttHref(wsId: string, boardId: string): Href {
  return `/workspaces/${wsId}/boards/${boardId}/gantt` as Href;
}
