import { EmptyState } from '@/shared/ui/empty-state';

import type { DocEditorFailure } from '../store/doc-editor.store';

export interface EditorFailureViewProps {
  failure: DocEditorFailure;
  /** Về danh sách/thoát màn hình. */
  onLeave: () => void;
  /** Xin token mới rồi bảo trang nối lại (`AUTH_EXPIRED`). */
  onReconnect: () => void;
  /** Dựng lại WebView từ đầu (`LOAD_TIMEOUT`, `TOKEN_FAILED`, lỗi tải nghiêm trọng). */
  onReload: () => void;
}

/**
 * Khối thay WebView khi editor không dùng được (app.md §3 dòng "Lỗi"): "Không mở được tài liệu" + Thử lại; token hết hạn không xin lại được → xin
 * mới; bản app lệch giao thức bridge → chỉ có "Quay lại". Mất quyền (`FORBIDDEN`/`NOT_FOUND`) KHÔNG vẽ ở đây: màn hiện thông báo trung tính
 * rồi thoát (`useLeaveOnRevoke`) — thử lại vẫn 403/404 nên không có nút Thử lại.
 */
export function EditorFailureView({
  failure,
  onLeave,
  onReconnect,
  onReload,
}: EditorFailureViewProps) {
  if (failure.code === 'UNSUPPORTED') {
    return (
      <EmptyState
        actions={[{ label: 'Quay lại', onPress: onLeave }]}
        description="Phiên bản ứng dụng chưa khớp với trình soạn thảo. Hãy cập nhật ứng dụng rồi mở lại tài liệu."
        fullscreen
        icon="alert-warning"
        title="Chưa mở được trình soạn thảo"
        tone="warning"
      />
    );
  }
  if (failure.code === 'AUTH_EXPIRED') {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onReconnect }]}
        description="Phiên soạn thảo đã hết hạn và chưa làm mới được. Thay đổi của bạn vẫn được giữ trên máy và sẽ đồng bộ khi kết nối lại."
        fullscreen
        icon="unlink"
        title="Mất phiên soạn thảo"
        tone="warning"
      />
    );
  }
  return (
    <EmptyState
      actions={[{ label: 'Thử lại', onPress: onReload }]}
      description="Kiểm tra kết nối mạng rồi thử lại."
      fullscreen
      icon="alert-warning"
      title="Không mở được tài liệu"
      tone="danger"
    />
  );
}
