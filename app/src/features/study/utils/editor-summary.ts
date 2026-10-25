import { STUDY_ITEM_TYPES, type StudyItemType } from '../api/study.types';
import type { DraftItem } from './editor-draft';
import { ITEM_TYPE_SHORT } from './editor-type-meta';
import type { ItemProblem } from './item-validation';
import type { ItemErrors } from './map-bulk-errors';

export interface TypeCount {
  count: number;
  type: StudyItemType;
}

export interface DraftSummary {
  /** Theo thứ tự cố định của `STUDY_ITEM_TYPES`, bỏ dạng chưa có mục nào. */
  byType: TypeCount[];
  total: number;
  typeCount: number;
}

/** Đếm mục theo dạng cho thanh tóm tắt của trình soạn ("12 mục · 3 dạng"). Thuần, O(số mục). */
export function summarizeDraft(
  items: Readonly<Record<string, DraftItem>>,
  order: readonly string[],
): DraftSummary {
  const counts = new Map<StudyItemType, number>();
  for (const key of order) {
    const item = items[key];
    if (item) counts.set(item.type, (counts.get(item.type) ?? 0) + 1);
  }
  const byType = STUDY_ITEM_TYPES.flatMap((type) => {
    const count = counts.get(type) ?? 0;
    return count > 0 ? [{ count, type }] : [];
  });
  return {
    byType,
    total: byType.reduce((sum, entry) => sum + entry.count, 0),
    typeCount: byType.length,
  };
}

export function describeSummary({ total, typeCount }: DraftSummary): string {
  return total === 0 ? 'Chưa có mục nào' : `${total} mục · ${typeCount} dạng`;
}

/** Dòng phụ liệt kê từng dạng ("5 thẻ ghi nhớ · 4 trắc nghiệm"); rỗng khi chỉ có một dạng (dòng chính đã đủ nghĩa). */
export function describeBreakdown({ byType }: DraftSummary): string {
  if (byType.length < 2) return '';
  return byType.map(({ count, type }) => `${count} ${ITEM_TYPE_SHORT[type]}`).join(' · ');
}

/**
 * Số mục còn "Cần sửa": còn lỗi kiểm cục bộ HOẶC được server gắn lỗi (`STUDY_001`). Chỉ đếm mục còn trong danh sách — lỗi của
 * mục đã xoá không được làm thanh tóm tắt báo oan.
 */
export function countNeedsFix(
  order: readonly string[],
  problems: Readonly<Record<string, readonly ItemProblem[]>>,
  serverErrors: Readonly<Record<string, ItemErrors>>,
): number {
  return order.filter((key) => (problems[key]?.length ?? 0) > 0 || key in serverErrors).length;
}
