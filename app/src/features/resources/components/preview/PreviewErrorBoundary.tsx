import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  /** Vẽ khi con ném lỗi lúc render (vd native view `RNPDFPdf` chưa được biên dịch). */
  fallback: ReactNode;
  onError?: (error: Error) => void;
}

interface State {
  failed: boolean;
}

/**
 * Chặn lỗi RENDER của một khung xem trước để nó không kéo sập cả màn.
 *
 * Cần riêng cho `react-native-pdf`: `import()` thành công KHÔNG có nghĩa là
 * native view tồn tại — thiếu `RNPDFPdf` trong binary thì lỗi chỉ nổ lúc vẽ
 * lần đầu ("View config not found"), và try/catch quanh `import()` không bắt
 * được. Phải là class: React chưa có hook cho error boundary.
 */
export class PreviewErrorBoundary extends Component<Props, State> {
  state: State = { failed: false };

  static getDerivedStateFromError(): State {
    return { failed: true };
  }

  componentDidCatch(error: Error): void {
    this.props.onError?.(error);
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}
