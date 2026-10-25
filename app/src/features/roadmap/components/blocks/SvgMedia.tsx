import { Component, type ReactNode } from 'react';
import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { Icon } from '@/shared/ui/icon';
import { cn } from '@/shared/utils/style/cn';

interface BoundaryProps {
  children: ReactNode;
  fallback: ReactNode;
}
interface BoundaryState {
  failed: boolean;
}

/**
 * Chặn lỗi RENDER của `SvgXml` để nó không kéo sập cả buổi học. BE đã vệ sinh SVG trước khi lưu (README §3 —
 * bỏ `<script>`, `on*`, tham chiếu ngoài) nhưng README vẫn chốt "app vẫn bọc `ErrorBoundary`" phòng cú pháp lạ.
 * Phải là class — React chưa có hook cho error boundary (cùng lý do `PreviewErrorBoundary` của `resources`; viết
 * lại cục bộ ở đây vì không import chéo feature được, xem `feature-structure.md`).
 */
class SvgErrorBoundary extends Component<BoundaryProps, BoundaryState> {
  state: BoundaryState = { failed: false };

  static getDerivedStateFromError(): BoundaryState {
    return { failed: true };
  }

  render(): ReactNode {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export interface SvgMediaProps {
  alt: string;
  className?: string;
  /**
   * Nằm trong một nút đã có nhãn (ô hình bấm được) ⇒ tắt ô trợ năng riêng của hình, không thì TalkBack đọc chú thích
   * hai lần (một lần ở nút, một lần ở hình).
   */
  decorative?: boolean;
  /** Lấp đầy khung CHA có kích thước cố định (ô ảnh nhỏ) thay vì tự tính cao theo tỉ lệ. */
  fill?: boolean;
  height?: number | null;
  /**
   * Trần chiều cao (dp). Mockup giáo trình là khổ DỌC (900×1500, 1100×1700): vẽ đủ bề ngang thì một hình cao hơn cả màn
   * và người học phải cuộn qua nó mới đọc tiếp được. Có trần thì hình co lại vừa khung (`meet`), chạm để phóng to.
   */
  maxHeight?: number;
  svg: string;
  width?: number | null;
}

/** SVG inline của buổi học (`RoadmapMedia.kind === 'SVG'`, README §3 "không phụ thuộc kho tệp"). */
export function SvgMedia({ alt, className, decorative = false, fill = false, height, maxHeight, svg, width }: SvgMediaProps) {
  const ratio = width && height && width > 0 && height > 0 ? width / height : 1;
  const box = cn(
    'items-center justify-center overflow-hidden bg-bg-2',
    fill ? 'h-full w-full' : 'w-full rounded-sm',
    className,
  );
  const style = fill ? undefined : { aspectRatio: ratio, maxHeight };

  return (
    <SvgErrorBoundary
      fallback={
        <View
          accessibilityLabel={decorative ? undefined : `${alt} — không hiện được`}
          accessible={!decorative}
          className={box}
          style={style}
        >
          <Icon color="fg-2" name="image" size="lg" />
        </View>
      }
    >
      <View accessibilityLabel={decorative ? undefined : alt} accessible={!decorative} className={box} style={style}>
        <SvgXml height="100%" width="100%" xml={svg} />
      </View>
    </SvgErrorBoundary>
  );
}
