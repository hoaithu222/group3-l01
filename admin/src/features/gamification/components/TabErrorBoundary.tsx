import { Component, type ErrorInfo, type ReactNode } from 'react';

import { captureReactError } from '@/core/monitoring';
import { Button, Callout } from '@/shared/ui';

interface TabErrorBoundaryProps {
  children: ReactNode;
}

interface TabErrorBoundaryState {
  hasError: boolean;
}

/**
 * Ranh giới lỗi CỦA TỪNG TAB Gamification. Trước đây một tab sập khi render (vd bảng nhãn thiếu khoá `ROADMAP_LESSON`) kéo theo
 * `LazyErrorBoundary` của cả route: màn "Có lỗi xảy ra" toàn trang chỉ có nút "Tải lại trang" — người dùng bấm, F5 chạy lại
 * khôi phục phiên (`POST /auth/refresh`) và gặp lỗi đó là bị đăng xuất. Giờ lỗi chỉ gói trong khung của tab; "Thử lại" dựng lại tab
 * KHÔNG tải lại trang, các tab khác vẫn dùng được. Cha đặt `key={tab}` để đổi tab là sạch trạng thái lỗi.
 *
 * Class component — Error Boundary chưa có bản hook (cùng lý do `LazyErrorBoundary`).
 */
export class TabErrorBoundary extends Component<TabErrorBoundaryProps, TabErrorBoundaryState> {
  state: TabErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): TabErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    captureReactError(error, info);
  }

  handleRetry = () => this.setState({ hasError: false });

  render() {
    if (!this.state.hasError) return this.props.children;
    return (
      <Callout
        action={
          <Button size="sm" variant="stroke" onClick={this.handleRetry}>
            Thử lại
          </Button>
        }
        description="Tab này gặp lỗi khi hiển thị. Các tab khác vẫn dùng được; nếu lỗi lặp lại, báo quản trị hệ thống."
        intent="error"
        title="Không hiển thị được tab"
      />
    );
  }
}
