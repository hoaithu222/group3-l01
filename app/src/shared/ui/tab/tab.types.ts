import type { IconName } from '@/shared/ui/icon';

/**
 * Kiểu dùng chung của nhóm `tab`.
 *
 * Tách khỏi `Tabs.tsx` để `TabItem` nhập được mà không tạo vòng
 * (`Tabs → TabItem → Tabs`) — `import/no-cycle` chặn cứng.
 */

/**
 * · `pill`      — Figma gọi là **BGR**: cả hàng nằm trong một khay bo tròn, tab
 *                 đang chọn là viên nén nền xanh. Dùng ngay dưới thanh tiêu đề.
 * · `underline` — chỉ có vạch nhấn dưới tab đang chọn. Dùng khi cần phân nhiều
 *                 cấp (bản vẽ ghi rõ: "khi cần chia nhiều cấp độ").
 */
export type TabsVariant = 'pill' | 'underline';

export interface TabItemData {
  /**
   * Nhãn RIÊNG cho trình đọc màn hình khi chữ nhìn thấy chưa đủ nghĩa ("Tin nhắn, có kết quả").
   * Bỏ trống thì trình đọc tự ghép từ nhãn + badge.
   */
  accessibilityLabel?: string;
  /**
   * Số/chữ nhỏ nằm sau nhãn. ⚠️ `0` VẪN hiện — chỉ `undefined` mới ẩn badge;
   * "0 thông báo chưa đọc" và "chưa biết có bao nhiêu" là hai chuyện khác nhau.
   */
  badge?: number | string;
  icon?: IconName;
  /** Khoá định danh tab, cũng là giá trị của `value`/`onChange`. */
  key: string;
  label: string;
}
