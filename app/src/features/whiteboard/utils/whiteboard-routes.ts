import type { Href } from 'expo-router';

/**
 * Href của các màn Bảng trắng — MỘT chỗ để đổi đường dẫn (`navigation.md`, cùng vai `PATHS`).
 *
 * ⚠️ Route CHỈ-CÓ-`index` ép `as Href` (bộ sinh typed routes sinh thất thường `/x` hoặc `/x/index`).
 * ⛔ Mỗi hàm trả MỘT `Href` cố định; nơi gọi cần chọn giữa hai đích thì viết `if/else`, KHÔNG `cond ? a : b` / `a ?? b` trên `Href`:
 * union `Href` đã phình theo số route (~190) và biểu thức ba ngôi đó làm `tsc` báo TS2590 THẬT (AGENTS.md).
 */
export function whiteboardListHref(wsId: string): Href {
  return `/workspaces/${wsId}/whiteboards` as Href;
}

export function whiteboardCanvasHref(wsId: string, wbId: string): Href {
  return { params: { wbId, wsId }, pathname: '/workspaces/[wsId]/whiteboards/[wbId]' };
}

export function whiteboardShareHref(wsId: string, wbId: string): Href {
  return { params: { wbId, wsId }, pathname: '/workspaces/[wsId]/whiteboards/[wbId]/share' };
}

export function whiteboardHistoryHref(wsId: string, wbId: string): Href {
  return { params: { wbId, wsId }, pathname: '/workspaces/[wsId]/whiteboards/[wbId]/history' };
}
