import type { ThemeColorKey } from '@/shared/theme';

/**
 * Bản sắc MÀU của một bộ học khi chưa có ảnh bìa — suy TẤT ĐỊNH từ tiêu đề, nên cùng một bộ luôn cùng một màu (ở danh sách,
 * ở hộp chọn bộ, ở đầu trang tổng quan) và không phải lưu thêm trường nào lên server.
 *
 * ── Vì sao chỉ năm tông ─────────────────────────────────────────────────────────────────────────────────────────────
 * Cùng bảng tông đã đo tương phản của `IconTile` (`surface-*` + màu ngữ nghĩa cùng họ, cả sáng lẫn tối). ⛔ Không có `danger`
 * (dành riêng cho lỗi/phá huỷ) và không có `neutral` (xám = "không có bản sắc", đúng thứ ta đang cố tránh). Bốn tông chế độ học
 * ở `STUDY_MODE_META` cũng lấy từ bảng này — nên màu bìa của một bộ có thể TRÙNG tông với một chế độ; chấp nhận, vì ô bìa luôn
 * có icon `book` + tiêu đề bên cạnh, không ai đọc màu bìa như "chế độ".
 *
 * ⚠️ `IconTile` không xuất bảng tông → ô bìa (nền lớn hơn ô icon, có lớp ảnh chồng lên) cần đủ NỀN lẫn MÀU NÉT ở đây. Nếu
 * bảng của `IconTile` đổi (vd đổi cặp màu của tông `accent`) thì đổi theo ở hai bảng dưới.
 */
const COVER_TONES = ['brand', 'info', 'success', 'warning', 'accent'] as const;

export type CoverTone = (typeof COVER_TONES)[number];

/** Băm chuỗi bằng phép nhân-cộng modulo số nguyên tố nhỏ — đủ rải đều 5 tông, và luôn ra cùng kết quả cho cùng chuỗi. */
export function coverToneFor(title: string): CoverTone {
  const hash = [...title.trim()].reduce(
    (acc, char) => (acc * 31 + (char.codePointAt(0) ?? 0)) % 65_521,
    7,
  );
  return COVER_TONES[hash % COVER_TONES.length] ?? 'brand';
}

/** Nền của ô bìa — cùng họ `surface-*` với nền `IconTile` cùng tông. */
export const COVER_SURFACE: Record<CoverTone, string> = {
  accent: 'bg-surface-secondary',
  brand: 'bg-surface-primary',
  info: 'bg-surface-info',
  success: 'bg-surface-success',
  warning: 'bg-surface-warning',
};

/** Màu nét của icon trên ô bìa (icon là hình phi văn bản, ngưỡng 3:1 — đạt ở mọi tông, cả hai chế độ). */
export const COVER_INK: Record<CoverTone, ThemeColorKey> = {
  accent: 'action-accent',
  brand: 'fg-brand',
  info: 'info',
  success: 'success',
  warning: 'warning',
};
