import { router, useLocalSearchParams, usePathname } from 'expo-router';
import type { Href } from 'expo-router';

import { queryClient } from '@/core/config/query-client';
import { SocketEvent, useSocketEvent } from '@/core/socket';
import type { PermissionRevokedPayload } from '@/core/socket';
import { clearScope } from '@/shared/stores/draft-registry';
import { showToast } from '@/shared/utils/toast.utils';

import { cancelScopeUploads } from './cancel-scope-uploads';
import { matchesScope } from './scope';
import { getScopeCleanups } from './scope-registry';
import type { CurrentRoute } from './scope-registry';

/** Trung tính, KHÔNG nêu tên kênh/nhóm — app.md §7: nội dung riêng tư đã mất quyền. */
const REVOKED_TOAST_MESSAGE = 'Bạn không còn quyền truy cập nội dung này';

/**
 * Xử lý MỘT lượt `permission:revoked` (app.md §3–4 của p0-02, ACL-10).
 *
 * Tách khỏi hook `usePermissionRevokedHandler()` bên dưới để test được KHÔNG
 * cần dựng cây component/router thật — nhận sẵn `currentRoute` thay vì tự gọi
 * `usePathname()`/`useLocalSearchParams()`.
 *
 * Thứ tự:
 *  1. Xoá query khớp quy ước scope (`matchesScope`) — thay cho
 *     `queryClient.invalidateQueries()` toàn cục mà `AppProviders` làm TRƯỚC
 *     khi có scope cụ thể (gây "refetch bão", app.md §4).
 *  2. Xoá nháp của scope (`draftRegistry.clearScope`).
 *  3. Huỷ upload đính kèm tin của kênh/hội thoại đó (`cancelScopeUploads`).
 *  4. Với MỌI đăng ký `registerScopeCleanup()` của đúng `scopeType`: xoá thêm
 *     query key riêng, chạy `onRevoked`, và hỏi `routeMatcher` xem có đang
 *     đứng đúng màn không.
 *  5. Đang đứng đúng màn (routeMatcher trả về fallback) ⇒ `router.replace` +
 *     toast trung tính. KHÔNG ở màn đó ⇒ chỉ dọn cache/nháp, không toast
 *     (app.md §3, bảng hành vi).
 */
export function handlePermissionRevoked(
  payload: PermissionRevokedPayload,
  currentRoute: CurrentRoute,
): void {
  queryClient.removeQueries({
    predicate: (query) => matchesScope(query.queryKey, payload),
  });

  clearScope(payload.scopeType, payload.scopeId);

  // Upload dở của scope vừa mất quyền: huỷ ngay thay vì để chạy tới khi request thật ăn 403/404 (p0-05 đã có `cancelUploadsByScope`).
  cancelScopeUploads(payload.scopeType, payload.scopeId);

  let fallback: Href | null | undefined;
  for (const cleanup of getScopeCleanups(payload.scopeType)) {
    for (const queryKey of cleanup.queryKeyPrefixes?.(payload.scopeId) ?? []) {
      queryClient.removeQueries({ queryKey });
    }
    cleanup.onRevoked?.(payload.scopeId);
    if (!fallback) fallback = cleanup.routeMatcher?.(currentRoute, payload.scopeId);
  }

  if (fallback) {
    // `replace`, không `push` — app.md §7: không mở lại màn cũ khi bấm Back.
    router.replace(fallback);
    showToast('info', REVOKED_TOAST_MESSAGE);
  }
}

/** Mount ĐÚNG MỘT LẦN trong `AppProviders`, cạnh chỗ đăng ký socket khác. */
export function usePermissionRevokedHandler(): void {
  const pathname = usePathname();
  const params = useLocalSearchParams();

  useSocketEvent<PermissionRevokedPayload>(SocketEvent.PERMISSION_REVOKED, (payload) => {
    handlePermissionRevoked(payload, { params, pathname });
  });
}
