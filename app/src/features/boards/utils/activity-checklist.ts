import type { TaskActivityDto } from '../api/task-detail.types';
import { pickText } from './json-pick';

const quote = (text: string | undefined): string => (text ? ` "${text}"` : '');

/** Nhiều mục checklist gộp (`groupKey`, 60 s): `after.items = [{ text, done }]` (giả định). */
function checklistItems(activity: TaskActivityDto): { done: boolean; text: string }[] {
  const items = activity.after?.items;
  if (!Array.isArray(items)) return [];
  return items.flatMap((item: unknown) => {
    if (!item || typeof item !== 'object') return [];
    const { done, text } = item as { done?: unknown; text?: unknown };
    return typeof text === 'string' ? [{ done: done === true, text }] : [];
  });
}

/**
 * BE gộp các lần tick liên tiếp (cùng người, 60 s) thành MỘT bản ghi: `type` = của lần bấm CUỐI, `after.items` =
 * trạng thái cuối của MỌI mục đã chạm (be.md p3-03 §14 mục 8, 16b). Nên chỉ đếm mục có `done` KHỚP `type` — mục
 * bị bấm rồi bấm lại về trạng thái cũ (`done` ngược `type`) không thuộc câu "đã hoàn thành N việc nhỏ".
 */
export function checklistToggleText(activity: TaskActivityDto, done: boolean): string {
  const items = checklistItems(activity);
  const verb = done ? 'đã hoàn thành' : 'đã bỏ hoàn thành';
  const matching = items.filter((item) => item.done === done);
  if (matching.length > 1) return `${verb} ${matching.length} việc nhỏ`;
  const text =
    matching[0]?.text ??
    items[0]?.text ??
    pickText(activity.after, 'text') ??
    pickText(activity.before, 'text');
  return `${verb} việc nhỏ${quote(text)}`;
}

/**
 * `CHECKLIST_REMOVED` có hai nghĩa: xoá thẳng, hoặc chuyển thành thẻ (p3-03 P1 `POST …/convert`: BE ghi cùng loại này nhưng kèm
 * `after.convertedTaskId`). Đọc mềm như phần còn lại — thiếu khoá thì rơi về câu "đã xoá việc nhỏ" cũ.
 */
export function checklistRemovedText(activity: TaskActivityDto): string {
  const converted = typeof activity.after?.convertedTaskId === 'string';
  return `${converted ? 'đã chuyển việc nhỏ thành thẻ' : 'đã xoá việc nhỏ'}${quote(pickText(activity.before, 'text'))}`;
}
