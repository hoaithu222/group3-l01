import { memo } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { mentionsToPlainText } from '@/features/chat';
import { ActionMenu, type ActionMenuItem } from '@/shared/ui/action-menu';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { cn } from '@/shared/utils/style/cn';

import type { ScheduledMessageView } from '../../api/chat-extensions.types';
import { formatWhen } from '../../utils/local-time';
import { failReasonText } from '../../utils/schedule-fail-reasons.constants';

export type ScheduledActionKind = 'reschedule' | 'edit' | 'sendNow' | 'cancel' | 'resend';

export interface ScheduledMessageRowProps {
  row: ScheduledMessageView;
  /** Dòng vừa được mở từ thông báo (`?id=`) — nền nhạt để tìm thấy ngay. */
  highlighted?: boolean;
  onAction: (kind: ScheduledActionKind, row: ScheduledMessageView) => void;
}

/** Trạng thái → icon + tông ô icon + chữ. Chữ luôn có (màu/hình không phải tín hiệu duy nhất); lỗi gửi tô `danger` như mọi khối lỗi. */
const STATUS: Record<'PENDING' | 'FAILED' | 'SENT', { icon: IconName; text: string; tone: IconTileTone }> = {
  PENDING: { icon: 'timer', text: 'Đang chờ gửi', tone: 'info' },
  FAILED: { icon: 'alert-warning', text: 'Không gửi được', tone: 'danger' },
  SENT: { icon: 'checkmark-circle', text: 'Đã gửi', tone: 'success' },
};

/** Hành động theo trạng thái (app.md §3): đang chờ — Sửa giờ · Sửa nội dung · Gửi ngay · Huỷ; lỗi — Gửi lại; đã gửi — không có. */
function actionsOf(row: ScheduledMessageView, onAction: ScheduledMessageRowProps['onAction']): ActionMenuItem[] {
  const run = (kind: ScheduledActionKind) => () => onAction(kind, row);
  return [
    { key: 'reschedule', icon: 'clock', label: 'Sửa giờ gửi', hidden: row.status !== 'PENDING', onPress: run('reschedule') },
    {
      key: 'edit',
      icon: 'edit',
      label: 'Sửa nội dung',
      // Tin có nhắc tên mang marker `@{u:…}` trong nội dung — sửa chữ thô ở đây dễ làm lệch marker/`mentions` (BE `MSG_008`); chỉ cho sửa giờ, muốn đổi nội dung thì huỷ và soạn lại.
      hidden: row.status !== 'PENDING' || row.mentions.length > 0,
      onPress: run('edit'),
    },
    { key: 'sendNow', icon: 'arrow-up', label: 'Gửi ngay', hidden: row.status !== 'PENDING', onPress: run('sendNow') },
    { key: 'resend', icon: 'reload', label: 'Gửi lại', hidden: row.status !== 'FAILED', onPress: run('resend') },
    { key: 'cancel', icon: 'delete', label: 'Huỷ tin hẹn giờ', tone: 'danger', hidden: row.status !== 'PENDING', onPress: run('cancel') },
  ];
}

/** Một tin hẹn giờ: nơi gửi · trích nội dung · giờ gửi (giờ máy) · trạng thái (chữ + icon) · lý do khi lỗi · menu "⋯". Ngoại tuyến ⇒ ẩn menu (chỉ xem, cache). */
export const ScheduledMessageRow = memo(function ScheduledMessageRow({ row, highlighted = false, onAction }: ScheduledMessageRowProps) {
  const offline = useConnectionState() === 'offline';
  const plain = mentionsToPlainText(row.content ?? '', []).trim();
  const preview = plain || (row.attachments.length > 0 ? `${row.attachments.length} tệp đính kèm` : 'Tin trống');
  // `SENDING`/`CANCELLED` không có tab riêng; `SENDING` (thoáng qua) coi như đang chờ.
  const statusKey = row.status === 'FAILED' || row.status === 'SENT' ? row.status : 'PENDING';
  const status = STATUS[statusKey];
  const items = offline ? [] : actionsOf(row, onAction);

  return (
    <View className={cn('flex-row items-start gap-sm border-b border-divider-1 px-md py-sm', highlighted && 'bg-action-tint')}>
      {/* Ô icon trạng thái đầu hàng (hẹn giờ · lỗi · đã gửi) — quét danh sách là thấy ngay tin nào cần xử lý. */}
      <IconTile className="mt-3xs" name={status.icon} size="sm" tone={status.tone} />
      <View className="flex-1 gap-2xs">
        <View className="flex-row items-center gap-xs">
          <Text className="flex-1 text-label-md font-semibold text-fg-1" numberOfLines={1}>
            {row.scopeLabel ?? 'Cuộc trò chuyện không còn khả dụng'}
          </Text>
          <ActionMenu accessibilityLabel={`Tuỳ chọn cho tin hẹn giờ gửi ${formatWhen(row.sendAt)}`} items={items} />
        </View>
        <Text className="text-body-md text-fg-1" numberOfLines={2}>
          {preview}
        </Text>
        <Text className="text-caption-sm text-fg-2">{`${status.text} · ${formatWhen(row.sendAt)}`}</Text>
        {row.status === 'FAILED' ? (
          <Text className="text-caption-sm text-error">{failReasonText(row.failReason)}</Text>
        ) : null}
      </View>
    </View>
  );
});
