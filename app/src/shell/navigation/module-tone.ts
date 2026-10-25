import type { IconTileTone } from '@/shared/ui/icon-tile';

/**
 * Tông màu của từng phân hệ — cho `IconTile` ở Trang chủ và tấm chọn phân hệ, để mỗi phân hệ có MỘT màu nhận ra được
 * (Trang chủ trước đây toàn ô tím nhạt giống hệt nhau nên phải đọc chữ mới phân biệt được).
 *
 * ⚠️ Tông ở đây CHỈ để phân biệt cho sinh động, không mang nghĩa trạng thái: `danger` (đỏ) cố ý KHÔNG có mặt — đỏ dành
 * cho việc phá huỷ/cảnh báo. Hai phân hệ đứng cạnh nhau trong lưới (thứ tự registry) không trùng tông.
 * Phân hệ mới chưa khai ở đây rơi về `FALLBACK_TONES` theo mã băm của `id` (ổn định giữa các lần mở app).
 */
const TONE_BY_MODULE: Readonly<Record<string, IconTileTone>> = {
  achievements: 'accent',
  activity: 'warning',
  calls: 'brand',
  me: 'accent',
  meetings: 'info',
  mentor: 'warning',
  messages: 'brand',
  study: 'success',
  workspace: 'info',
};

const FALLBACK_TONES: readonly IconTileTone[] = ['brand', 'info', 'success', 'warning', 'accent'];

export function moduleTone(moduleId: string): IconTileTone {
  const known = TONE_BY_MODULE[moduleId];
  if (known) return known;
  let hash = 0;
  for (const char of moduleId) hash = (hash + char.charCodeAt(0)) % FALLBACK_TONES.length;
  return FALLBACK_TONES[hash] ?? 'brand';
}
