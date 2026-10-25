/**
 * Dock — kiểu dữ liệu của một mục.
 *
 * ⛔ GENERIC: widget KHÔNG đọc registry module nghiệp vụ nào. Tầng `app/` dựng
 *    danh sách rồi truyền vào `<Dock items={…} />`, nhờ vậy Dock tái dùng được
 *    cho bất kỳ bộ module nào và không phụ thuộc `@/app/**` hay `@/features/**`.
 */
import type { SystemIconName } from '@/shared/ui';

export interface DockItemConfig {
  /** Khoá ổn định — dùng làm React key. */
  id: string;
  /** Tên hiển thị trong tooltip + `aria-label`. */
  label: string;
  /** Icon từ registry (`npm run generate:icons`). */
  icon: SystemIconName;
  /** URL đích THẬT — Dock render `<Link>` để chuột phải mở được tab mới. */
  href: string;
  /** Số việc đang chờ (vd báo cáo chưa xử lý) — hiện chấm số ở góc ô; `0`/bỏ trống = không hiện. */
  badge?: number;
  /**
   * Câu đọc cho trình đọc màn hình khi có `badge` ("12 báo cáo chờ xử lý"). Chấm số chỉ là hình —
   * thiếu câu này thì `aria-label` chỉ có tên mục và người dùng không nghe được có việc chờ.
   */
  badgeLabel?: string;
}
