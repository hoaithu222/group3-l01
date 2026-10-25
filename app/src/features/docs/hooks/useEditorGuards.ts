import { useEffect, useRef } from 'react';

import { showToast } from '@/shared/utils/toast.utils';

import { useDocEditorStore } from '../store/doc-editor.store';

/** Editor không báo `ready` trong chừng này thì coi là không mở được (bundle hỏng/WebView treo) — hiện "Thử lại" thay vì khung xương mãi. */
export const EDITOR_LOAD_TIMEOUT_MS = 20_000;

/**
 * Mất quyền (`FORBIDDEN`/`NOT_FOUND`: bị gỡ khỏi tài liệu, tài liệu bị xoá, token bị từ chối vì không còn quyền, `permission:revoked` cho chính tài liệu này):
 * thông báo TRUNG TÍNH một lần rồi thoát màn hình (app.md §3 dòng "Mất quyền") — không tiết lộ vì sao (bị gỡ, hay tài liệu không còn). WebView bị huỷ theo
 * màn hình nên Y.Doc cục bộ biến mất cùng nó.
 */
export function useLeaveOnRevoke(onLeave: () => void): void {
  const failure = useDocEditorStore((state) => state.failure);
  const done = useRef(false);
  useEffect(() => {
    if (done.current || !failure?.fatal) return;
    if (failure.code !== 'FORBIDDEN' && failure.code !== 'NOT_FOUND') return;
    done.current = true;
    showToast('info', 'Bạn không còn quyền truy cập tài liệu này.');
    onLeave();
  }, [failure, onLeave]);
}

/** Bắt đầu đếm khi WebView đã dựng (`active`); `ready` tới thì huỷ; hết hạn → `LOAD_TIMEOUT`. `attempt` đổi (dựng lại WebView) thì đếm lại. */
export function useEditorLoadTimeout(active: boolean, attempt: number): void {
  const ready = useDocEditorStore((state) => state.ready);
  const patch = useDocEditorStore((state) => state.patch);
  useEffect(() => {
    if (!active || ready) return;
    const timer = setTimeout(
      () => patch({ failure: { code: 'LOAD_TIMEOUT', fatal: false } }),
      EDITOR_LOAD_TIMEOUT_MS,
    );
    return () => clearTimeout(timer);
  }, [active, attempt, patch, ready]);
}

/** Store sạch khi vào và khi rời màn — trạng thái kết nối/định dạng của tài liệu trước không được rò sang tài liệu sau. */
export function useResetEditorStore(): void {
  useEffect(() => {
    const { reset } = useDocEditorStore.getState();
    reset();
    return reset;
  }, []);
}
