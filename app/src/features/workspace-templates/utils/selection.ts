import type { TemplateSelection } from '@/shared/workspace-templates';

import type { WorkspaceTemplate } from '../api';

/** Khoá các kênh mẫu tick sẵn (`defaultSelected`) theo thứ tự khai báo của mẫu. */
export function defaultChannelKeys(template: WorkspaceTemplate): string[] {
  return template.channels
    .filter((channel) => channel.defaultSelected)
    .map((channel) => channel.key);
}

/** Chọn một mẫu → lựa chọn ban đầu: đúng các kênh `defaultSelected`. */
export function selectTemplate(template: WorkspaceTemplate): TemplateSelection {
  return { channelKeys: defaultChannelKeys(template), code: template.code };
}

/** Bật/tắt MỘT kênh. Kết quả luôn theo thứ tự khai báo của mẫu (không theo thứ tự người dùng tick) — chữ ký/khoá không nhảy. */
export function toggleChannelKey(
  template: WorkspaceTemplate,
  selection: TemplateSelection,
  key: string,
  checked: boolean,
): TemplateSelection {
  const next = new Set(selection.channelKeys);
  if (checked) next.add(key);
  else next.delete(key);
  return {
    channelKeys: template.channels
      .map((channel) => channel.key)
      .filter((channelKey) => next.has(channelKey)),
    code: selection.code,
  };
}

/** Chữ ký body để `useIdempotencyKey`: cùng mẫu + cùng tập kênh ⇒ cùng chữ ký, bất kể thứ tự. */
export function selectionSignature(selection: TemplateSelection | null): string {
  return selection ? `${selection.code}:${[...selection.channelKeys].sort().join(',')}` : '';
}
