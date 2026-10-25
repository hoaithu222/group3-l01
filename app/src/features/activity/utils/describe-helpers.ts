import type { InboxItem } from '@/core/notifications';

export interface ActivityDescription {
  /** Câu mô tả ("Minh nhắc đến bạn trong #frontend"). */
  title: string;
  /** Trích đoạn nội dung — CHỈ khi còn quyền xem. */
  excerpt?: string;
}

/** Tuỳ chọn dựng câu — `workspaceNames`: tra tên nhóm theo id khi BE không kèm tên trong mục (`useActivityWorkspaceNames`). */
export interface DescribeOptions {
  workspaceNames?: ReadonlyMap<string, string>;
}

/** Chuỗi không rỗng trong `refs` (hoặc số → chuỗi); còn lại `undefined`. */
export function refText(item: InboxItem, key: string): string | undefined {
  const value = item.refs?.[key];
  if (typeof value === 'number') return String(value);
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : undefined;
}

/**
 * Tên người thực hiện, hoặc `undefined` khi BE không cấp. ⚠️ BE chỉ điền `actor` cho mục THUỘC TIN NHẮN (kênh/hội thoại,
 * `inbox-context.service.ts`); mục nhóm/thẻ/họp/… luôn không có — nên câu của các loại đó phải đọc được cả khi thiếu người.
 */
export function actorName(item: InboxItem): string | undefined {
  return item.actor?.name?.trim() || undefined;
}

/** Tên phạm vi hiển thị: kênh có `#`, còn lại nguyên tên. Trả `undefined` khi BE không cấp (mất quyền / không có). */
export function scopeLabel(item: InboxItem): string | undefined {
  const name = item.context?.scopeName;
  if (!name) return undefined;
  return item.scopeType === 'CHANNEL' && !name.startsWith('#') ? `#${name}` : name;
}

export function inScope(item: InboxItem): string {
  const scope = scopeLabel(item);
  return scope ? ` trong ${scope}` : '';
}

/**
 * Tên nhóm làm việc của mục: `refs.workspaceName` (lời mời/duyệt/thêm trực tiếp/khách hết hạn) → `context.scopeName` khi phạm vi là
 * nhóm → tra theo id trong danh sách nhóm của tôi. `undefined` nếu không biết (câu tự bỏ đoạn "nhóm …", không in "undefined").
 * ⛔ Chỉ gọi SAU nhánh "mất quyền" của `describeActivity` — mục không khả dụng không được lộ tên nhóm cũ.
 */
export function workspaceLabel(item: InboxItem, options?: DescribeOptions): string | undefined {
  const fromRefs = refText(item, 'workspaceName');
  if (fromRefs) return fromRefs;
  if (item.scopeType === 'WORKSPACE' && item.context?.scopeName) return item.context.scopeName;
  const id = item.workspaceId ?? refText(item, 'workspaceId');
  return id ? options?.workspaceNames?.get(id) : undefined;
}
