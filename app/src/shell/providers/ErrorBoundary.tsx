import { Component, type ErrorInfo, type ReactNode } from 'react';

import { captureException } from '@/core/monitoring';
import { EmptyState, Screen } from '@/shared/ui';
import { logger } from '@/shared/utils/logger';

/**
 * Nhãn nút — cũng là `key` của hàng nút trong `EmptyState`, nên đừng trùng với
 * nhãn nào khác nếu sau này thêm nút thứ hai.
 */
const RETRY_LABEL = 'Thử lại';

const GENERIC_TITLE = 'Đã có lỗi xảy ra';

/**
 * Câu cho NGƯỜI DÙNG CUỐI: nói việc phải làm, không nói lỗi gì.
 *
 * ⚠️ `EmptyState` chặn mô tả ở 3 dòng (rộng 279, cỡ 14/20 ⇒ ~120 ký tự). Dài
 * hơn là bị cắt ÂM THẦM và câu hướng dẫn mất vế cuối.
 */
const GENERIC_DESCRIPTION =
  'Ứng dụng gặp sự cố khi hiển thị màn hình này. Bạn thử lại giúp nhé, nếu vẫn lỗi hãy đóng và mở lại ứng dụng.';

interface ErrorBoundaryProps {
  children: ReactNode;
  /**
   * Thay TOÀN BỘ giao diện lỗi cho ca đặc biệt (ví dụ một khối nhỏ nhúng giữa
   * màn hình thì không nên bung ra cả `Screen`).
   *
   * ⚠️ Nhận `ReactNode` chứ không nhận hàm `(error) => ReactNode`: nơi gọi mà
   * cần nội dung lỗi thật thì nó đang muốn HIỆN lỗi cho người dùng — đúng thứ
   * mục "chế độ phát hành" dưới đây cấm. Cần lỗi để gửi đi thì móc vào
   * `componentDidCatch` (một chỗ duy nhất), đừng mở đường qua prop.
   */
  fallback?: ReactNode;
  /**
   * Dọn dẹp thêm khi người dùng bấm "Thử lại" — ví dụ `queryClient.clear()` khi
   * nghi ngờ dữ liệu trong cache mới là thứ làm màn hình nổ.
   *
   * ⛔ Không có nó thì "Thử lại" chỉ dựng lại đúng cái cây vừa chết với đúng dữ
   * liệu vừa làm nó chết ⇒ lỗi lặp lại ngay, người dùng bấm vô ích.
   */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * Ranh giới lỗi — lưới an toàn cuối cùng của cây React.
 *
 * ── Vì sao BẮT BUỘC phải có ─────────────────────────────────────────────────
 * Từ React 16, một lỗi render KHÔNG được bắt sẽ gỡ bỏ TOÀN BỘ cây React chứ
 * không chỉ nhánh gây lỗi. Ở bản dev còn thấy màn đỏ; ở bản phát hành người
 * dùng nhận một màn hình TRẮNG, không nút, không chữ — cách thoát duy nhất là
 * tắt hẳn app. Với app ngân hàng, đó là ca "app hỏng" trong mắt người dùng dù
 * lỗi chỉ nằm ở một thẻ nhỏ.
 *
 * ── Vì sao là class component ───────────────────────────────────────────────
 * ⛔ Không có bản hook: React chưa mở `componentDidCatch` /
 * `getDerivedStateFromError` cho hàm. Đây là ngoại lệ duy nhất được phép của
 * luật "component là hàm" trong repo này.
 *
 * ── Chỉ bắt LỖI RENDER ──────────────────────────────────────────────────────
 * ⚠️ Không bắt: lỗi trong handler (`onPress`), lỗi bất đồng bộ (`setTimeout`,
 * `fetch`), lỗi ở chính nó, và lỗi ở tầng native. Lỗi API đã có `queryClient` +
 * toast lo; đừng trông chờ ranh giới này thay được chúng.
 *
 * ```tsx
 * <ErrorBoundary onReset={() => queryClient.clear()}>
 *   <RiskyScreen />
 * </ErrorBoundary>
 * ```
 */
export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    /**
     * ⛔ Ghi CẢ ở bản phát hành, không bọc trong `__DEV__`.
     *
     * `logger.error` (mức `error` luôn ra console, kể cả bản phát hành) là DẤU VẾT
     * chắc chắn còn lại: trên máy thật nó vẫn đi vào `adb logcat` / Console của
     * Xcode, đủ để bộ phận hỗ trợ lấy được khi người dùng báo lỗi.
     * ⚠️ Dịch vụ báo lỗi (Sentry, p0-11) nối vào ĐÚNG chỗ này — hoặc qua `addLogSink`
     * của logger (nhận cả dòng này); đừng rải nơi khác.
     *
     * `componentStack` mới là thứ đáng giá: nó chỉ ra component nào ném lỗi,
     * còn `error.stack` sau khi thu nhỏ (minify) gần như không đọc được.
     */
    logger.error('[ErrorBoundary] lỗi render:', error, info.componentStack);
    // p0-11: báo lỗi render lên Sentry (đã lọc; no-op khi chưa bật DSN) — điểm nối DUY NHẤT của ranh giới lỗi.
    captureException(error, { componentStack: info.componentStack });
  }

  /**
   * Trường (không phải method) để `this` luôn đúng khi truyền xuống `onPress` —
   * method thường mất `this` lúc bị truyền đi như một giá trị.
   */
  private handleRetry = () => {
    /* Dọn dẹp TRƯỚC khi dựng lại: đổi thứ tự thì cây con remount với đúng dữ
       liệu vừa làm nó nổ, rồi cache mới bị xoá sau — vô nghĩa. */
    this.props.onReset?.();
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;
    const { children, fallback } = this.props;

    if (!error) return children;
    if (fallback !== undefined) return fallback;

    /**
     * ⛔ Chế độ PHÁT HÀNH tuyệt đối không hiện nội dung lỗi.
     *
     * `error.message` của một app ngân hàng thường kèm đường dẫn nội bộ, tên
     * endpoint, đôi khi cả mảnh dữ liệu phiên — mà màn hình lỗi lại đúng là thứ
     * người dùng chụp màn hình rồi gửi cho người lạ trong nhóm chat để hỏi.
     *
     * ⛔ Chế độ PHÁT TRIỂN thì ngược lại, PHẢI hiện: ranh giới lỗi nuốt mất màn
     * đỏ của React, nên nếu ở đây cũng chỉ có câu chung chung thì lập trình
     * viên mất hẳn dấu vết và phải đi bỏ `ErrorBoundary` ra mới gỡ lỗi được.
     */
    const description = __DEV__ ? error.message : GENERIC_DESCRIPTION;

    return (
      <Screen>
        <EmptyState
          actions={[{ label: RETRY_LABEL, onPress: this.handleRetry, variant: 'primary' }]}
          description={description}
          /* Canh giữa theo chiều dọc — `Screen` cho `flexGrow: 1` nên `flex-1`
             ở đây có chỗ để chia. */
          fullscreen
          /* Hình minh hoạ chuẩn của `EmptyState` (quầng + đĩa tông + icon hai tông) theo quy ước lỗi = `danger` — cùng
             dáng mọi màn lỗi khác của app, thay cho icon trần 64dp tạm thời trước khi bộ minh hoạ Figma được xuất. */
          icon="alert-warning"
          title={GENERIC_TITLE}
          tone="danger"
        />
      </Screen>
    );
  }
}
