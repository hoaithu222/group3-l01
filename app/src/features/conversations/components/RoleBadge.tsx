import { Badge, type BadgeVariant } from '@/shared/ui/badge';

import type { ConversationRole } from '../api/conversations.types';

/**
 * Vai trò bằng CHỮ trên huy hiệu `Badge` (app.md §7 "vai trò hiển thị bằng chữ"): Chủ nhóm tông thương hiệu, Quản trị viên tông
 * `info` — hai tông khác nhau để mắt quét nhanh ai là ai trong danh sách dài, nhưng chữ vẫn là dấu hiệu chính (không chỉ màu).
 * MEMBER không có huy hiệu — vai trò mặc định không cần nhấn thêm.
 *
 * Bản cũ là icon `fg-3` (2.96:1 — dưới ngưỡng 3:1 của hình phi văn bản) + chữ xám, đọc lẫn vào dòng trạng thái bên cạnh.
 */
const ROLE_META: Partial<Record<ConversationRole, { label: string; variant: BadgeVariant }>> = {
  OWNER: { label: 'Chủ nhóm', variant: 'brand' },
  ADMIN: { label: 'Quản trị viên', variant: 'info' },
};

export function RoleBadge({ role }: { role: ConversationRole }) {
  const meta = ROLE_META[role];
  if (!meta) return null;

  return (
    <Badge accessibilityLabel={meta.label} label={meta.label} size="sm" variant={meta.variant} />
  );
}
