import { normalizeSearch } from '@/shared/utils/format/string.utils';
import type { TemplateSkipReason } from '@/shared/workspace-templates';

import type { TemplateChannelType, WorkspaceTemplate } from '../api';

/** khoá kênh của mẫu → lý do dự kiến bị bỏ qua. Kênh không có trong bảng = sẽ được tạo. */
export type SkipPlan = Readonly<Record<string, TemplateSkipReason>>;

/**
 * Báo TRƯỚC kênh nào của mẫu sẽ bị bỏ qua (app.md p5-04 §3 "kênh sẽ bị bỏ qua vì trùng tên, tính trước ở client — BE là
 * chuẩn"): trùng tên với kênh đã có (so khớp không dấu như BE `normalizeSearch`) hoặc loại kênh đang tắt. Chỉ là DỰ ĐOÁN —
 * kênh riêng tư mình không thấy, hay kênh vừa tạo song song, client không biết; kết quả thật do BE trả về sau khi áp.
 */
export function planSkips(
  template: WorkspaceTemplate,
  existingNames: readonly string[],
  disabledTypes: ReadonlySet<TemplateChannelType>,
): SkipPlan {
  const existing = new Set(existingNames.map(normalizeSearch));
  const plan: Record<string, TemplateSkipReason> = {};
  for (const channel of template.channels) {
    if (existing.has(normalizeSearch(channel.name))) plan[channel.key] = 'NAME_EXISTS';
    else if (disabledTypes.has(channel.type)) plan[channel.key] = 'TYPE_UNAVAILABLE';
  }
  return plan;
}
