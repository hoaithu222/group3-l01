import type { TaskActivityDto } from '../api/task-detail.types';
import { pickText, type Json } from './json-pick';

/**
 * Câu của activity chấm chéo (p4-05 be.md §5): `REVIEW_REQUESTED` (hệ thống giao người chấm khi thẻ vào REVIEW), `REVIEW_SUBMITTED`
 * (một người nộp — KHÔNG mang điểm/nhận xét), `REVIEW_WAIVED` (OWNER/ADMIN miễn chấm), `REVIEW_REASSIGNED` (giao lại, có `before.userId` →
 * `after.userId`). Hàm THUẦN, đọc mềm như `activity-text.ts`: BE đổi tên khoá thì câu chỉ NHẠT đi chứ không vỡ.
 */
type ResolveName = (userId: string) => string | undefined;

const nameOf = (source: Json, resolveName?: ResolveName): string | undefined => {
  const userId = pickText(source, 'userId');
  return pickText(source, 'name') ?? (userId ? resolveName?.(userId) : undefined);
};

function reviewerCount(after: Json): number | undefined {
  const ids = after?.reviewerIds;
  return Array.isArray(ids) ? ids.length : undefined;
}

export function reviewActionText(activity: TaskActivityDto, resolveName?: ResolveName): string {
  const { after, before } = activity;
  switch (activity.type) {
    case 'REVIEW_REQUESTED': {
      if (after?.autoApproved === true) return 'đã tự duyệt thẻ vì nhóm không đủ người chấm';
      const count = reviewerCount(after);
      return count ? `đã giao thẻ cho ${count} người chấm` : 'đã giao thẻ cho người chấm';
    }
    case 'REVIEW_SUBMITTED':
      return after?.status === 'REQUEST_CHANGES' ? 'đã yêu cầu sửa thẻ' : 'đã duyệt thẻ';
    case 'REVIEW_WAIVED':
      return 'đã miễn chấm cho thẻ';
    case 'REVIEW_REASSIGNED': {
      const from = nameOf(before, resolveName) ?? 'một người chấm';
      const to = nameOf(after, resolveName);
      return to ? `đã giao lại lượt chấm từ ${from} sang ${to}` : `đã bỏ lượt chấm của ${from}`;
    }
    default:
      return 'đã cập nhật chấm chéo';
  }
}
