import { formatDate } from '@/shared/utils/format/date.utils';

import type { TaskActivityDto } from '../api/task-detail.types';
import { checklistRemovedText, checklistToggleText } from './activity-checklist';
import { dependencyActionText, rescheduledActionText, type ResolveTask } from './activity-dependency';
import { reviewActionText } from './activity-review';
import { pickNumber, pickText, type Json } from './json-pick';

/**
 * `type` + `before`/`after` → câu tiếng Việt (app.md §2 `utils/activity-text.ts`). Hàm THUẦN.
 *
 * ⚠️ `before`/`after` là JSON TUỲ LOẠI mà be.md chưa đặc tả (chỉ ghi "before/after"): dưới đây đọc
 * MỀM nhiều tên khoá có thể có (`dueDate`/`value`/`date`…) và luôn có câu rơi về khi thiếu, để BE đổi
 * tên khoá thì câu chỉ NHẠT đi chứ không vỡ. Khi BE chốt DTO, thu gọn `pick(...)` về đúng tên khoá.
 * `type` lạ (BE thêm sau) → "đã cập nhật thẻ".
 */
const quote = (text: string | undefined): string => (text ? ` "${text}"` : '');

function dateText(activity: TaskActivityDto, label: string, keys: string[]): string {
  const next = pickText(activity.after, ...keys);
  const previous = pickText(activity.before, ...keys);
  if (!next) return `đã bỏ ${label}`;
  const formatted = formatDate(next, next);
  return previous ? `đã dời ${label} sang ${formatted}` : `đã đặt ${label} là ${formatted}`;
}

/** Tên người được giao: ưu tiên tên trong bản ghi, rồi tra theo id, cuối cùng là cách gọi chung. */
function personName(
  activity: TaskActivityDto,
  source: Json,
  resolveName?: (userId: string) => string | undefined,
): string {
  const userId = pickText(source, 'userId', 'assigneeId', 'id');
  return (
    pickText(source, 'name', 'assigneeName', 'userName') ??
    (userId ? resolveName?.(userId) : undefined) ??
    (userId && userId === activity.actor?.id ? activity.actor.name : undefined) ??
    'một thành viên'
  );
}

/**
 * Phần hành động của câu — KHÔNG gồm tên người thực hiện. `resolveColumn` tra tên cột theo `columnId`: BE (p3-02)
 * chỉ ghi `{ columnId, columnKind }` cho `MOVED`, không ghi tên cột (be.md p3-03 §14 mục 16c). `resolveTask` tra tiêu đề thẻ
 * theo id cho activity phụ thuộc/dời lịch (p4-04) — BE chỉ ghi id.
 */
export function activityAction(
  activity: TaskActivityDto,
  resolveName?: (userId: string) => string | undefined,
  resolveColumn?: (columnId: string) => string | undefined,
  resolveTask?: ResolveTask,
): string {
  const { after, before } = activity;
  switch (activity.type) {
    case 'CREATED':
      return 'đã tạo thẻ';
    case 'RENAMED': {
      const from = pickText(before, 'title');
      const to = pickText(after, 'title');
      return from && to ? `đã đổi tên thẻ từ "${from}" thành "${to}"` : 'đã đổi tên thẻ';
    }
    case 'DESCRIPTION':
      return 'đã cập nhật mô tả';
    case 'MOVED': {
      const titleOf = (source: Json) => {
        const columnId = pickText(source, 'columnId');
        return (
          pickText(source, 'columnTitle') ?? (columnId ? resolveColumn?.(columnId) : undefined)
        );
      };
      const from = titleOf(before);
      const to = titleOf(after);
      if (from && to) return `đã chuyển thẻ từ "${from}" sang "${to}"`;
      return to ? `đã chuyển thẻ sang cột "${to}"` : 'đã chuyển thẻ sang cột khác';
    }
    case 'ASSIGNED': {
      const name = personName(activity, after, resolveName);
      return pickText(after, 'userId', 'assigneeId') === activity.actor?.id
        ? 'đã nhận làm thẻ này'
        : `đã giao thẻ cho ${name}`;
    }
    case 'UNASSIGNED': {
      const name = personName(activity, before ?? after, resolveName);
      return pickText(before ?? after, 'userId', 'assigneeId') === activity.actor?.id
        ? 'đã bỏ nhận thẻ này'
        : `đã bỏ ${name} khỏi người làm`;
    }
    case 'LABELS':
      return 'đã cập nhật nhãn của thẻ';
    case 'START_CHANGED':
      return dateText(activity, 'ngày bắt đầu', ['startDate', 'value', 'date']);
    case 'DUE_CHANGED':
      return dateText(activity, 'hạn chót', ['dueDate', 'value', 'date']);
    case 'POINTS': {
      const from = pickNumber(before, 'storyPoints', 'points', 'value');
      const to = pickNumber(after, 'storyPoints', 'points', 'value');
      if (to === undefined) return 'đã bỏ điểm ước lượng';
      return from === undefined ? `đã đặt điểm là ${to}` : `đã đổi điểm từ ${from} sang ${to}`;
    }
    case 'CHECKLIST_ADDED':
      return `đã thêm việc nhỏ${quote(pickText(after, 'text'))}`;
    case 'CHECKLIST_DONE':
      return checklistToggleText(activity, true);
    case 'CHECKLIST_UNDONE':
      return checklistToggleText(activity, false);
    case 'CHECKLIST_EDITED':
      return `đã sửa việc nhỏ${quote(pickText(after, 'text'))}`;
    case 'CHECKLIST_REMOVED':
      return checklistRemovedText(activity);
    case 'ATTACHMENT_ADDED':
      return `đã đính kèm${quote(pickText(after, 'name', 'originalName', 'fileName'))}`;
    case 'ATTACHMENT_REMOVED':
      return `đã gỡ tệp${quote(pickText(before, 'name', 'originalName', 'fileName'))}`;
    case 'COMMENT_DELETED_BY_ADMIN':
      return 'đã xoá một bình luận';
    case 'DELETED':
      return 'đã xoá thẻ';
    case 'RESTORED':
      return 'đã khôi phục thẻ';
    case 'DEPENDENCY_ADDED':
      return dependencyActionText(activity, true, resolveTask);
    case 'DEPENDENCY_REMOVED':
      return dependencyActionText(activity, false, resolveTask);
    case 'RESCHEDULED':
      return rescheduledActionText(activity, resolveTask);
    // p4-05: chấm chéo — không mang điểm/nhận xét (chỉ có ở khối Chấm chéo, đã lọc theo người xem).
    case 'REVIEW_REQUESTED':
    case 'REVIEW_SUBMITTED':
    case 'REVIEW_WAIVED':
    case 'REVIEW_REASSIGNED':
      return reviewActionText(activity, resolveName);
    default:
      return 'đã cập nhật thẻ';
  }
}

/** Câu đầy đủ "Lan đã dời hạn chót sang 15/09/2026" — `actor: null` là hệ thống (job dời lịch…). */
export function activitySentence(
  activity: TaskActivityDto,
  resolveName?: (userId: string) => string | undefined,
  resolveColumn?: (columnId: string) => string | undefined,
  resolveTask?: ResolveTask,
): string {
  return `${activity.actor?.name ?? 'Hệ thống'} ${activityAction(activity, resolveName, resolveColumn, resolveTask)}`;
}
