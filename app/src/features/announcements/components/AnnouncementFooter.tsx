import { Text, View } from 'react-native';

import type { MessageBubbleFooterProps } from '@/shared/message-extensions';
import { formatDateTime } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';
import { useFeature } from '@/shell/capabilities';
import { useAuthStore } from '@/shell/store/slices/auth';

import type { AnnouncementView } from '../api/announcements.types';
import { useIsExpired } from '../hooks/useIsExpired';
import { useAnnouncement } from '../queries/announcements.queries';
import { resolveStatus } from '../utils/announcement-status';
import { AnnouncementBadge } from './AnnouncementBadge';
import { ConfirmReadButton } from './ConfirmReadButton';
import { ReceiptsLink } from './ReceiptsLink';

interface FooterBodyProps {
  isOwn: boolean;
  view: AnnouncementView;
  workspaceId: string | undefined;
}

function AnnouncementFooterBody({ isOwn, view, workspaceId }: FooterBodyProps) {
  const enabled = useFeature('readConfirm') === true;
  const currentUserId = useAuthStore((state) => state.user?.id);
  const expired = useIsExpired(view);
  // Cờ tắt giữa chừng (`config:updated`): Host đã dừng cập nhật cache, nên huy hiệu còn lại trong cache là dữ liệu cũ — ẩn.
  if (!enabled) return null;

  const status = resolveStatus(view, expired);
  // Người yêu cầu KHÔNG nằm trong tập cần xác nhận (BE trừ họ khỏi `audience`) — chỉ thấy tiến độ.
  const canConfirm = status === 'pending' && view.requestedBy !== currentUserId;

  return (
    <View
      className={cn(
        'mt-3xs max-w-[80%] gap-2xs tablet:max-w-[60%]',
        isOwn ? 'items-end' : 'items-start',
      )}
    >
      <View className="flex-row flex-wrap items-center gap-xs">
        <AnnouncementBadge status={status} />
        {view.deadlineAt ? (
          <Text className="text-caption-sm text-fg-2">Hạn {formatDateTime(view.deadlineAt)}</Text>
        ) : null}
      </View>
      {canConfirm ? (
        <ConfirmReadButton channelId={view.channelId} messageId={view.messageId} />
      ) : null}
      {view.canViewReceipts ? (
        <ReceiptsLink
          confirmedCount={view.confirmedCount ?? 0}
          target={{ channelId: view.channelId, messageId: view.messageId, workspaceId }}
        />
      ) : null}
    </View>
  );
}

/**
 * Hàng phụ dưới bong bóng của tin có yêu cầu xác nhận: huy hiệu + hạn, nút "Tôi đã đọc", "N đã xác nhận". Đọc cache danh
 * sách của kênh (không tự tải) — tin không có yêu cầu thì không vẽ gì. Đăng ký vào khe `bubbleFooter` của `chat`.
 * `useFeature` chỉ được gọi ở `Body` (tin CÓ yêu cầu — hiếm) chứ không ở đây: mỗi bong bóng thêm một observer capabilities là thừa.
 */
export function AnnouncementFooter({ isOwn, message, scope }: MessageBubbleFooterProps) {
  const view = useAnnouncement(scope.scopeId, message.id);
  if (!view) return null;
  return <AnnouncementFooterBody isOwn={isOwn} view={view} workspaceId={scope.workspaceId} />;
}
