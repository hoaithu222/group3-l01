import { Component, type ReactNode, type ErrorInfo } from 'react';
import { Button } from '@/shared/ui';
import { SystemIcon } from '@/shared/ui/icons/Icons';
import { toSafeLog } from '@/shared/utils/error-log.utils';
import { PATHS } from '@/app/config';
import { captureReactError } from '@/core/monitoring';

interface LazyErrorBoundaryState {
  hasError: boolean;
  error?: Error;
  chunkError: boolean;
}

interface LazyErrorBoundaryProps {
  children: ReactNode;
}

/**
 * Bắt lỗi khi lazy-load chunk thất bại (deploy mới, chunk hash đổi).
 * Chunk error → nút "Tải lại trang". Lỗi khác → thông báo + Tải lại / Về trang chủ.
 *
 * Class component (Error Boundary BẮT BUỘC) — không thể dùng hook `useMemo`/`memo`.
 */
export class LazyErrorBoundary extends Component<LazyErrorBoundaryProps, LazyErrorBoundaryState> {
  constructor(props: LazyErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, chunkError: false };
  }

  static getDerivedStateFromError(error: Error): LazyErrorBoundaryState {
    const message = error.message || '';
    const isChunkError =
      message.includes('Failed to fetch dynamically imported module') ||
      message.includes('Loading chunk') ||
      message.includes('Loading CSS chunk') ||
      message.includes('MIME type') ||
      message.includes('Failed to load module script') ||
      message.includes('Importing a module script failed');

    return {
      hasError: true,
      error,
      chunkError: isChunkError,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // `toSafeLog`: lỗi axios mang theo `config.data` (mật khẩu) và `Authorization` (token).
    console.error('[LazyLoad] Module load error:', toSafeLog(error));
    console.error('[LazyLoad] Component stack:', errorInfo.componentStack);
    // p0-11: lỗi tải chunk sau deploy (hash đổi) là nhiễu — chỉ báo Sentry lỗi render thật.
    if (!this.state.chunkError) captureReactError(error, errorInfo);
  }

  /**
   * Xoá cache rồi tải lại — phải ĐỢI xoá xong.
   *
   * Bản trước gọi `caches.delete()` không `await` rồi `reload()` ngay ở dòng
   * sau, nên trang tải lại TRƯỚC khi xoá kịp xong: chunk hỏng vẫn nằm đó và
   * người dùng bấm "tải lại" bao nhiêu lần cũng gặp đúng màn lỗi ấy. Thêm nữa
   * `.then` không có `.catch` → unhandled rejection ở trình duyệt đang chặn
   * lưu trữ trang.
   *
   * `finally` để dù xoá cache hỏng thì vẫn tải lại — tải lại là thứ người dùng
   * bấm nút để có.
   */
  handleReload = () => {
    const done =
      'caches' in window
        ? caches.keys().then((names) => Promise.all(names.map((name) => caches.delete(name))))
        : Promise.resolve();

    void done.catch(() => undefined).finally(() => window.location.reload());
  };

  handleGoHome = () => {
    window.location.href = PATHS.HOME;
  };

  render() {
    if (this.state.hasError) {
      const isChunk = this.state.chunkError;
      return (
        <div className="flex min-h-dvh items-center justify-center bg-bg-base px-4">
          <div className="w-full max-w-md rounded-lg border border-border-1 bg-bg-1 p-6 text-center shadow-[0_4px_20px_var(--color-popup-shadow)]">
            <div aria-hidden className="mb-4 flex justify-center text-warning">
              <SystemIcon
                name={isChunk ? 'arrows-rotate-bold' : 'triangle-exclamation-bold'}
                size={40}
              />
            </div>
            <h2 className="text-body-16-medium mb-2 text-fg-1">
              {isChunk ? 'Phiên bản mới đã được cập nhật' : 'Có lỗi xảy ra'}
            </h2>
            <p className="text-body-14 mb-6 text-fg-3">
              {isChunk
                ? 'Hệ thống đã được cập nhật phiên bản mới. Vui lòng tải lại trang để sử dụng phiên bản mới nhất.'
                : // Không in `error.message` (chuỗi tiếng Anh kỹ thuật) — chi tiết đã ghi ở console.
                  'Đã xảy ra lỗi khi tải trang. Hãy tải lại trang; nếu lỗi lặp lại, liên hệ quản trị hệ thống.'}
            </p>
            <div className="flex flex-wrap justify-center gap-3">
              <Button size="md" onClick={this.handleReload}>
                Tải lại trang
              </Button>
              {!isChunk && (
                <Button size="md" skin="neutral" variant="stroke" onClick={this.handleGoHome}>
                  Về trang chủ
                </Button>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
