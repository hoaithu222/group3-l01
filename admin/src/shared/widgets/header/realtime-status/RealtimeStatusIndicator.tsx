/**
 * @file RealtimeStatusIndicator.tsx
 * @description Chấm nhỏ báo trạng thái kết nối Socket.IO — đứng trong dãy
 * action bên phải thanh header, ngay cạnh `<UserMenu>` (`p0-03 admin.md §2`:
 * "chấm trạng thái kết nối realtime nhỏ cạnh avatar"). KHÔNG chặn thao tác
 * nào — chỉ đọc `useConnectionStatus()` (`@/core/socket`, thuần, không đụng
 * store app) nên vẫn ở `shared/widgets/`, giống `CommandPaletteTrigger` (widget
 * khác cũng bơm vào `actions` của `<Header>` mà đọc store CỤC BỘ của chính nó).
 *
 * Dùng thẳng `Badge dot` + `Tooltip` của kit2 — KHÔNG có file `*.theme.ts`
 * riêng vì không tự viết Tailwind chain nào (`widget-composition.md §1` chỉ
 * bắt buộc theme file khi widget CÓ token/`tv()` recipe riêng).
 */
import { memo } from 'react';

import { useConnectionStatus, type ConnectionStatus } from '@/core/socket';
import { Badge, Tooltip, type BadgeColor } from '@/shared/ui';

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  connected: 'Realtime: đã kết nối',
  connecting: 'Realtime: đang kết nối lại',
};

const STATUS_COLOR: Record<ConnectionStatus, BadgeColor> = {
  connected: 'success',
  connecting: 'warning',
};

const RealtimeStatusIndicator = memo(function RealtimeStatusIndicator() {
  const status = useConnectionStatus();
  const label = STATUS_LABEL[status];

  return (
    <Tooltip content={label}>
      <Badge aria-label={label} color={STATUS_COLOR[status]} dot size="xs" />
    </Tooltip>
  );
});

export default RealtimeStatusIndicator;
