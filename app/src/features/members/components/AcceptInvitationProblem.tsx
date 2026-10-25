import { EmptyState } from '@/shared/ui/empty-state';

import type { AcceptFailure } from '../utils/invitation-errors';

export interface AcceptInvitationProblemProps {
  failure: AcceptFailure;
  /** Email đã che của lời mời (từ bản xem trước) — nói rõ nên đăng nhập tài khoản nào. */
  emailHint?: string;
  loggingOut?: boolean;
  onGoHome: () => void;
  onLogout: () => void;
  onRetry: () => void;
  /** Mở luồng "Xác minh email" (`EMAIL_NOT_VERIFIED`). Vắng ⇒ chỉ còn "Thử lại" (xác minh ở nơi khác). */
  onVerifyEmail?: () => void;
}

/**
 * Nội dung theo LOẠI lỗi chấp nhận lời mời (app.md p3-04 §3). Mỗi loại một hành
 * động đúng việc: không khớp email → Đăng xuất (đổi tài khoản); chưa xác minh →
 * Xác minh email (mã 6 số, xong tự chấp nhận lại) kèm Thử lại; hết hạn → hướng dẫn
 * xin lời mời mới (không có nút thử lại — vô ích).
 */
export function AcceptInvitationProblem({
  emailHint,
  failure,
  loggingOut,
  onGoHome,
  onLogout,
  onRetry,
  onVerifyEmail,
}: AcceptInvitationProblemProps) {
  switch (failure.kind) {
    case 'EMAIL_MISMATCH':
      return (
        <EmptyState
          actions={[{ label: 'Đăng xuất', onPress: onLogout }]}
          description={`Lời mời gửi tới ${emailHint ?? 'một email khác'}. Hãy đăng nhập đúng tài khoản.${loggingOut ? ' Đang đăng xuất…' : ''}`}
          icon="user-circle"
          title="Lời mời dành cho tài khoản khác"
          tone="warning"
        />
      );
    case 'EMAIL_NOT_VERIFIED':
      return (
        <EmptyState
          actions={[
            ...(onVerifyEmail ? [{ label: 'Xác minh email', onPress: onVerifyEmail }] : []),
            { label: 'Thử lại', onPress: onRetry },
          ]}
          description="Email của tài khoản chưa được xác minh. Hãy xác minh email rồi bấm Thử lại."
          icon="email"
          title="Cần xác minh email"
          tone="warning"
        />
      );
    case 'EXPIRED':
      return (
        <EmptyState
          actions={[{ label: 'Về trang chủ', onPress: onGoHome }]}
          description="Lời mời đã hết hạn — hãy xin lời mời mới từ người đã mời bạn."
          icon="clock"
          title="Lời mời không còn hiệu lực"
          tone="warning"
        />
      );
    case 'NOT_FOUND':
      return (
        <EmptyState
          actions={[{ label: 'Về trang chủ', onPress: onGoHome }]}
          description="Liên kết không đúng hoặc đã bị thu hồi."
          icon="alert-help"
          title="Không tìm thấy lời mời"
          tone="warning"
        />
      );
    case 'BLOCKED':
      return (
        <EmptyState
          actions={[{ label: 'Về trang chủ', onPress: onGoHome }]}
          description="Bạn không thể tham gia nhóm này."
          icon="lock"
          title="Không thể tham gia"
          tone="warning"
        />
      );
    case 'OTHER':
      return (
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: onRetry }]}
          description={failure.message}
          icon="alert-warning"
          title="Không thể mở lời mời"
          tone="danger"
        />
      );
  }
}
