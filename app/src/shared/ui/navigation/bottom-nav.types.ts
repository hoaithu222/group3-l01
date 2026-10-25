import type { ReactNode } from 'react';

/**
 * Một mục trên thanh tab. `icon`/`activeIcon` để trống được — khe chờ bộ icon chung.
 *
 * ⚠️ Tách ra file riêng để `BottomNav` và `BottomNavTab` cùng đọc mà không import vòng qua nhau; nơi gọi vẫn nhập
 * `BottomNavItem` từ `./BottomNav` (tái xuất) hoặc từ barrel như cũ.
 */
export interface BottomNavItem {
  /** Gợi ý trợ năng đọc SAU nhãn — dùng khi mục có hành động ẩn (vd giữ để mở danh sách). */
  accessibilityHint?: string;
  activeIcon?: ReactNode;
  /** Số chưa đọc. `0` hoặc bỏ trống ⇒ không vẽ huy hiệu. */
  badge?: number;
  /**
   * Mục nổi bật ở giữa (Trang chủ): icon nằm trong vòng tròn nền trắng mờ, cao 50dp thay vì 44 —
   * đúng số đo mục giữa của Figma. Chỉ NÊN có tối đa MỘT mục, và ở giữa hàng.
   */
  featured?: boolean;
  icon?: ReactNode;
  key: string;
  label: string;
  /** Giữ mục để làm việc phụ (mở danh sách chọn phân hệ). Cú chạm thường vẫn gọi `onSelect`. */
  onLongPress?: () => void;
}
