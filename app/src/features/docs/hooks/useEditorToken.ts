import { useEffect, useMemo } from 'react';

import { type CollabGrant, CollabTokenProvider, useCollabTokenRefresher } from '@/shared/collab';

import { docsCollabService } from '../api/docs-collab.service';
import { useDocEditorStore } from '../store/doc-editor.store';
import { httpStatusOf, isNotAvailable } from '../utils/docs-errors';
import type { DocEditorBridge } from '../webview/doc-editor-bridge';
import { hostMessage } from '../webview/doc-editor-bridge';

/**
 * Vòng đời mã kết nối của MỘT phiên soạn thảo (README §3.6, CW-D5):
 *  · `provider` — nguồn token của riêng tài liệu này (không toàn cục), `clear()` khi rời màn;
 *  · `begin()` — mỗi lần trang báo `ready`: xin token MỚI, bật hẹn giờ làm mới `expiresAt − 60 s`, xoá cờ lỗi → trả grant để dựng `init`;
 *  · `onRequestToken` — bridge `requestToken` (`expired`/`unauthorized`): xin mới rồi `setToken`;
 *  · `reconnect()` — nút "Thử lại" khi `AUTH_EXPIRED`: token mới + `setToken` + `retry`;
 *  · `fail(error)` — 404/403 = mất quyền (lỗi nghiêm trọng → màn thoát); lỗi khác (mạng/BE) = cờ `tokenProblem`, hẹn giờ thử lại.
 * ⛔ Token chỉ đi từ provider vào tin `init`/`setToken`; không vào store, URL hay log.
 */
export function useEditorToken(docId: string, bridge: DocEditorBridge) {
  const patch = useDocEditorStore((state) => state.patch);
  const provider = useMemo(
    () => new CollabTokenProvider(() => docsCollabService.issueToken(docId)),
    [docId],
  );
  useEffect(() => () => provider.clear(), [provider]);

  const sendToken = (grant: CollabGrant) =>
    bridge.send(hostMessage('setToken', { expiresAt: grant.expiresAt, token: grant.token }));
  const refresher = useCollabTokenRefresher({
    onGiveUp: () => patch({ tokenProblem: true }),
    onGrant: sendToken,
    provider,
  });

  const fail = (error: unknown) =>
    patch(
      isNotAvailable(error) || httpStatusOf(error) === 403
        ? { failure: { code: 'FORBIDDEN', fatal: true } }
        : { tokenProblem: true },
    );

  const renew = (after?: () => void) =>
    provider.refresh().then((grant) => {
      sendToken(grant);
      after?.();
      refresher.start(grant);
      patch({ tokenProblem: false });
    }, fail);

  return {
    async begin(): Promise<CollabGrant> {
      const grant = await provider.refresh();
      refresher.start(grant);
      patch({ failure: null, tokenProblem: false });
      return grant;
    },
    fail,
    // Trang tự dừng sau 2 lượt liên tiếp rồi báo `AUTH_EXPIRED`; quá 3 là tin lạ — không dồn thêm vào BE (30 lần/phút).
    onRequestToken: (attempt: number) => {
      if (attempt <= 3) void renew();
    },
    reconnect: () => {
      patch({ failure: null });
      void renew(() => bridge.send(hostMessage('retry', {})));
    },
  };
}
