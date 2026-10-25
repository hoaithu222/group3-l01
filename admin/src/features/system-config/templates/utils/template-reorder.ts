import { ORDER_BASE } from '../constants/templates.constants';
import type { TemplateOrderChange, WorkspaceTemplate } from '../types/templates.types';

/**
 * Chuyển mẫu `activeCode` tới vị trí của mẫu `overCode` (dnd-kit báo theo khoá dòng = mã mẫu). Khoá lạ hoặc trùng nhau
 * → trả nguyên danh sách. Không sửa mảng gốc.
 */
export function moveTemplate(
  templates: readonly WorkspaceTemplate[],
  activeCode: string,
  overCode: string,
): WorkspaceTemplate[] {
  const from = templates.findIndex((t) => t.code === activeCode);
  const to = templates.findIndex((t) => t.code === overCode);
  const next = [...templates];
  if (from === -1 || to === -1 || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/**
 * Thứ tự hiển thị mới = vị trí trong bảng, đánh số từ `ORDER_BASE`. Chỉ trả các mẫu có `order` THAY ĐỔI (mỗi mẫu là
 * một lần `PUT` kèm `expectedVersion` của chính nó) — kéo một hàng sang cạnh thường chỉ đổi 2 mẫu, không phải cả bảng.
 */
export function orderChanges(sequence: readonly WorkspaceTemplate[]): TemplateOrderChange[] {
  return sequence.flatMap((t, index) => {
    const order = index + ORDER_BASE;
    return t.order === order ? [] : [{ code: t.code, order, expectedVersion: t.version }];
  });
}

/** "Nhóm môn học → Đồ án → Nhóm tự học" — hiện trong hộp thoại xác nhận. */
export const describeSequence = (sequence: readonly WorkspaceTemplate[]): string =>
  sequence.map((t) => t.name).join(' → ');
