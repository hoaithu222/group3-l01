import { Component, type ErrorInfo, type ReactNode } from 'react';

import { Button, EmptyState } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { toSafeLog } from '@/shared/utils/error-log.utils';

import { captureReactError } from './sentry';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error: Error | null;
  /** Mã sự kiện Sentry (nếu SDK đã sẵn sàng lúc bắt lỗi) — người dùng đọc cho hỗ trợ. */
  eventId?: string;
}

/**
 * Ranh giới lỗi NGOÀI CÙNG của admin (p0-11 admin.md §2): bắt lỗi render ở tầng provider — thứ `RouteErrorBoundary` (chỉ phủ cây route) không với tới —
 * thay vì để màn TRẮNG. Gửi lỗi lên Sentry (đã lọc, no-op nếu chưa bật) và hiện câu tiếng Việt cố định + mã sự kiện rút gọn + "Tải lại".
 * ⛔ KHÔNG in `error.message` cho người dùng (chuỗi kỹ thuật, có thể lộ chi tiết nội bộ) — chi tiết đã có ở console (qua `toSafeLog`) và Sentry.
 *
 * Class component: React chưa có bản hook của `componentDidCatch` (cùng lý do `LazyErrorBoundary`).
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('[AppError]', toSafeLog(error));
    this.setState({ eventId: captureReactError(error, info) });
  }

  render() {
    const { error, eventId } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="flex min-h-dvh items-center justify-center bg-bg-base px-4">
        <div className="w-full max-w-md border border-border-1 bg-bg-1 p-6 shadow-[0_4px_20px_var(--color-popup-shadow)]">
          <EmptyState
            action={
              <Button size="md" onClick={() => window.location.reload()}>
                Tải lại
              </Button>
            }
            description={
              <>
                Đã xảy ra lỗi không mong muốn. Hãy tải lại trang; nếu lỗi lặp lại, liên hệ quản trị hệ thống
                {eventId ? ` và cung cấp mã ${eventId.slice(0, 8)}` : ''}.
              </>
            }
            icon={<SystemIcon className="text-error" name="triangle-exclamation-bold" size={40} />}
            size="md"
            title="Trang quản trị gặp lỗi"
          />
        </div>
      </div>
    );
  }
}
