import type { ChecklistItemDto } from '../api/task-detail.types';

/** Sắp theo `order` (số thực) — ổn định với hai mục trùng `order` nhờ so `id`. */
export function sortChecklist(items: readonly ChecklistItemDto[]): ChecklistItemDto[] {
  return [...items].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
}

export function checklistCounts(items: readonly ChecklistItemDto[]): { done: number; total: number } {
  return { done: items.filter((item) => item.done).length, total: items.length };
}

/** % hoàn thành làm tròn; 0 khi chưa có mục (đừng chia cho 0 ra `NaN%`). */
export function checklistPercent(done: number, total: number): number {
  if (total <= 0) return 0;
  return Math.min(100, Math.round((done / total) * 100));
}

/** "2/4 · 50 %" — nhãn tiến độ của checklist (app.md §2 `ChecklistSection`). */
export function checklistProgressLabel(done: number, total: number): string {
  return `${done}/${total} · ${checklistPercent(done, total)} %`;
}

/**
 * Chuyển mục lên/xuống MỘT bậc → `moveAfterItemId` gửi BE (be.md §3: `null` = lên đầu, chuỗi =
 * id mục đứng ngay TRƯỚC vị trí mới). `null` trả về khi đã ở biên (không có gì để chuyển).
 */
export function planChecklistMove(
  sorted: readonly ChecklistItemDto[],
  itemId: string,
  direction: 'down' | 'up',
): { moveAfterItemId: string | null } | null {
  const index = sorted.findIndex((item) => item.id === itemId);
  if (index < 0) return null;
  if (direction === 'up') {
    if (index === 0) return null;
    return { moveAfterItemId: sorted[index - 2]?.id ?? null };
  }
  const after = sorted[index + 1];
  return after ? { moveAfterItemId: after.id } : null;
}

/**
 * Áp lệnh chuyển lên bản cục bộ (optimistic): `order` mới = trung bình hai hàng xóm — cùng công
 * thức BE (`between(afterItem.order, next.order)`) nên khi phản hồi về thứ tự không nhảy.
 */
export function applyChecklistMove(
  items: readonly ChecklistItemDto[],
  itemId: string,
  moveAfterItemId: string | null,
): ChecklistItemDto[] {
  const sorted = sortChecklist(items);
  const moving = sorted.find((item) => item.id === itemId);
  if (!moving) return sorted;
  const rest = sorted.filter((item) => item.id !== itemId);
  const afterIndex = moveAfterItemId === null ? -1 : rest.findIndex((item) => item.id === moveAfterItemId);
  if (moveAfterItemId !== null && afterIndex < 0) return sorted;

  const before = afterIndex >= 0 ? rest[afterIndex] : undefined;
  const next = rest[afterIndex + 1];
  let order: number;
  if (before && next) order = (before.order + next.order) / 2;
  else if (before) order = before.order + 1;
  else order = next ? next.order - 1 : moving.order;
  return sortChecklist([...rest, { ...moving, order }]);
}
