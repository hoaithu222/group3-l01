import { EmptyState } from '@/shared/ui/empty-state';

import type { SessionFailure } from '../collab/session-status';

export interface CanvasFailureViewProps {
  failure: SessionFailure;
  /**
   * Phiên từng đồng bộ HOẶC Y.Doc cục bộ đã có nét (`snapshot.everSynced || runtime.hasLocalContent()`). Chỉ đổi câu chữ của `AUTH_EXPIRED`:
   * có ⇒ "Mất phiên vẽ" (nét vẫn giữ trên máy); không ⇒ bị từ chối ngay từ lần nối đầu, chưa có gì để giữ ⇒ "Không mở được bảng".
   */
  hasLocalWork: boolean;
  /** Về danh sách/thoát màn hình. */
  onLeave: () => void;
  /** Nối lại (xin token mới rồi mở lại kết nối). */
  onRetry: () => void;
}

/**
 * Khối thay canvas khi phiên không dùng được (app.md §3 dòng "Lỗi"): "Không mở được bảng" + Thử lại; token hết hạn không xin lại được → "Mất phiên vẽ";
 * bảng quá lớn để đồng bộ (khung > 6 MiB) → chỉ có "Quay lại" (thử lại vẫn quá lớn). Mất quyền (`FORBIDDEN`/`NOT_FOUND`) KHÔNG vẽ ở đây: màn hiện
 * thông báo trung tính rồi thoát (`useLeaveOnRevoke`) — thử lại vẫn 403/404 nên không có nút Thử lại.
 *
 * ⚠️ `AUTH_EXPIRED` ngay lần nối ĐẦU (chưa đồng bộ, chưa vẽ gì) không phải "hết hạn": token vừa cấp đã bị collab từ chối — thường là máy chủ cấu hình
 * lệch (collab chạy với `COLLAB_SHARED_SECRET` khác BE, sự cố 28/09/2026). Câu "Phiên vẽ đã hết hạn… nét bạn vừa vẽ vẫn được giữ" khi đó sai sự thật và
 * dắt người dùng đi tìm lỗi ở máy mình ⇒ dùng câu "Không mở được bảng" của đặc tả, gợi ý thử lại sau/báo quản trị viên.
 */
export function CanvasFailureView({
  failure,
  hasLocalWork,
  onLeave,
  onRetry,
}: CanvasFailureViewProps) {
  if (failure.code === 'TOO_LARGE') {
    return (
      <EmptyState
        actions={[{ label: 'Quay lại', onPress: onLeave }]}
        description="Bảng có quá nhiều nội dung để đồng bộ trên máy này. Hãy dùng bản lưu để khôi phục bản nhỏ hơn."
        fullscreen
        icon="alert-warning"
        title="Bảng quá lớn"
        tone="warning"
      />
    );
  }
  if (failure.code === 'AUTH_EXPIRED' && !hasLocalWork) {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry }]}
        description="Máy chủ vẽ chưa chấp nhận phiên kết nối. Hãy thử lại sau ít phút; nếu vẫn lỗi, báo quản trị viên."
        fullscreen
        icon="unlink"
        title="Không mở được bảng"
        tone="warning"
      />
    );
  }
  if (failure.code === 'AUTH_EXPIRED') {
    return (
      <EmptyState
        actions={[{ label: 'Thử lại', onPress: onRetry }]}
        description="Phiên vẽ đã hết hạn và chưa làm mới được. Nét bạn vừa vẽ vẫn được giữ trên máy và sẽ đồng bộ khi kết nối lại."
        fullscreen
        icon="unlink"
        title="Mất phiên vẽ"
        tone="warning"
      />
    );
  }
  return (
    <EmptyState
      actions={[{ label: 'Thử lại', onPress: onRetry }]}
      description="Kiểm tra kết nối mạng rồi thử lại."
      fullscreen
      icon="alert-warning"
      title="Không mở được bảng"
      tone="danger"
    />
  );
}
