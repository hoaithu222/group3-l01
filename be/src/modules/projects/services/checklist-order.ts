import type { ChecklistItem } from "../entities/task.interface";

/** Khoảng cách mặc định giữa hai mục liền kề khi thêm vào đầu/cuối danh sách. */
export const CHECKLIST_ORDER_STEP = 1024;

/** `order` cho mục nằm giữa `prev` và `next` (`null` = không có hàng xóm phía đó): trung bình cộng, hoặc ±bước ở mép. */
export function orderBetween(prev: number | null, next: number | null): number {
  if (prev === null && next === null) return CHECKLIST_ORDER_STEP;
  if (prev === null) return (next as number) - CHECKLIST_ORDER_STEP;
  if (next === null) return prev + CHECKLIST_ORDER_STEP;
  return (prev + next) / 2;
}

/** `value` nằm THẬT SỰ giữa hai hàng xóm — sai khi số thực đã cạn độ chính xác (chèn liên tiếp vào cùng một chỗ). */
export function isStrictlyBetween(value: number, prev: number | null, next: number | null): boolean {
  return (prev === null || value > prev) && (next === null || value < next);
}

/** Hàng xóm quanh vị trí "ngay sau `afterId`" (`null` = đầu danh sách, `undefined`/không thấy = cuối) — bỏ mục `excludeId`. */
export function neighborsAfter(
  items: ChecklistItem[],
  afterId: string | null | undefined,
  excludeId?: string
): { prev: number | null; next: number | null } {
  const rest = items.filter((i) => i.id !== excludeId);
  if (afterId === null) return { prev: null, next: rest.length > 0 ? rest[0].order : null };
  const index = afterId === undefined ? -1 : rest.findIndex((i) => i.id === afterId);
  // Mốc không còn (xoá đồng thời) → cuối danh sách thay vì lỗi: thao tác vẫn hợp lý với người dùng.
  if (index < 0) return { prev: rest.length > 0 ? rest[rest.length - 1].order : null, next: null };
  return { prev: rest[index].order, next: index + 1 < rest.length ? rest[index + 1].order : null };
}
