import type { InboxItem } from '@/core/notifications';

/** Một dòng của danh sách Hoạt động: nhãn nhóm ngày hoặc một mục. */
export type ActivityRow =
  { key: string; label: string; type: 'header' } | { item: InboxItem; key: string; type: 'item' };

const DAY_MS = 24 * 60 * 60 * 1000;

/** 0h00 (giờ máy) của ngày chứa `date` — so sánh THEO NGÀY LỊCH, không theo "24 giờ trước" (23h hôm qua vẫn là "Hôm qua"). */
function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
}

function bucketOf(createdAt: string, today: number): { key: string; label: string } {
  const time = new Date(createdAt).getTime();
  if (Number.isNaN(time)) return { key: 'older', label: 'Cũ hơn' };
  const days = Math.round((today - startOfDay(new Date(time))) / DAY_MS);
  if (days <= 0) return { key: 'today', label: 'Hôm nay' };
  if (days === 1) return { key: 'yesterday', label: 'Hôm qua' };
  if (days < 7) return { key: 'week', label: '7 ngày qua' };
  return { key: 'older', label: 'Cũ hơn' };
}

/**
 * Chèn nhãn nhóm ngày (Hôm nay · Hôm qua · 7 ngày qua · Cũ hơn) vào danh sách ĐÃ sắp mới → cũ. Chỉ có nhãn cho nhóm CÓ mục; hộp thư ít mục
 * (thường chỉ "Hôm nay") thì chỉ một nhãn. Mỗi mục giữ nguyên thứ tự server trả — hàm này KHÔNG sắp lại, chỉ cắt ở chỗ đổi nhóm, nên phân trang
 * cursor nối tiếp trang sau vẫn đúng (trang sau bắt đầu bằng nhóm cũ hơn hoặc cùng nhóm với mục cuối, không lặp nhãn).
 */
export function buildActivityRows(items: InboxItem[], now: Date = new Date()): ActivityRow[] {
  const today = startOfDay(now);
  const rows: ActivityRow[] = [];
  let current: string | null = null;
  for (const item of items) {
    const bucket = bucketOf(item.createdAt, today);
    if (bucket.key !== current) {
      current = bucket.key;
      // `rows.length` trong khoá: nếu server từng trả lộn thứ tự mà một nhóm xuất hiện hai lần thì khoá vẫn duy nhất.
      rows.push({
        key: `header:${bucket.key}:${rows.length}`,
        label: bucket.label,
        type: 'header',
      });
    }
    rows.push({ item, key: item.id, type: 'item' });
  }
  return rows;
}
