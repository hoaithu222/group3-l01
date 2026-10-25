import type { Href } from 'expo-router';

/**
 * Href của các màn Real-time Docs — MỘT chỗ để đổi đường dẫn (`navigation.md`, cùng vai `PATHS`).
 *
 * ⚠️ Route CHỈ-CÓ-`index` ép `as Href` (bộ sinh typed routes sinh thất thường `/x` hoặc `/x/index` — cùng bẫy `mentor-routes.ts`).
 * ⛔ Mỗi hàm trả MỘT `Href` cố định; nơi gọi cần chọn giữa hai đích thì viết `if/else`, KHÔNG `cond ? a : b` / `a ?? b` trên `Href`:
 * union `Href` đã phình theo số route (~180) và biểu thức ba ngôi đó làm `tsc` báo TS2590 THẬT (AGENTS.md).
 */
export function docsListHref(wsId: string): Href {
  return `/workspaces/${wsId}/docs` as Href;
}

export function docEditorHref(wsId: string, docId: string): Href {
  return { params: { docId, wsId }, pathname: '/workspaces/[wsId]/docs/[docId]' };
}

export function docHistoryHref(wsId: string, docId: string): Href {
  return { params: { docId, wsId }, pathname: '/workspaces/[wsId]/docs/[docId]/history' };
}

export function docShareHref(wsId: string, docId: string): Href {
  return { params: { docId, wsId }, pathname: '/workspaces/[wsId]/docs/[docId]/share' };
}
