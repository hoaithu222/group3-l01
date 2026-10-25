import type { MessageActionRowsProps } from '@/shared/message-extensions';
import { Icon } from '@/shared/ui/icon';
import { ListItem } from '@/shared/ui/list';
import { useFeature } from '@/shell/capabilities';

import { useIsExpired } from '../hooks/useIsExpired';
import { useAnnouncement } from '../queries/announcements.queries';
import { useAnnouncementIntentStore } from '../store/announcement-intent.store';
import { canManageAnnouncements, isAnnounceable } from '../utils/announcement-scope';
import { openReceipts } from '../utils/open-receipts';

/**
 * Dòng thao tác thêm vào menu nhấn giữ tin (khe `actionRows` của `chat`):
 *  · "Yêu cầu xác nhận đã đọc" / "Yêu cầu xác nhận lại" — kênh `ADMINS_ONLY` + người quản lý + tin gốc; "lại" khi yêu cầu
 *    cũ đã HẾT HẠN (BE khôi phục yêu cầu). Đang còn hiệu lực thì không hiện (BE idempotent nhưng bấm lại vô nghĩa).
 *  · "Xem người đã xác nhận" — người yêu cầu/quản trị kênh (`view.canViewReceipts`).
 *  · "Huỷ yêu cầu xác nhận" — người quản lý, khi tin có yêu cầu.
 * Bấm "Yêu cầu"/"Huỷ" chỉ GHI ý định vào store (`AnnouncementHost` dựng tấm/hộp thoại) — menu tự dỡ khi đóng.
 */
export function AnnouncementActionRows({ message, onDone, scope }: MessageActionRowsProps) {
  const enabled = useFeature('readConfirm') === true;
  const view = useAnnouncement(scope.scopeId, message.id);
  const expired = useIsExpired(view);
  const requestConfirm = useAnnouncementIntentStore((state) => state.requestConfirm);
  const requestCancel = useAnnouncementIntentStore((state) => state.requestCancel);

  if (!enabled || !isAnnounceable(message, scope)) return null;

  const target = { channelId: scope.scopeId, messageId: message.id };
  const manage = canManageAnnouncements(scope);
  const { workspaceId } = scope;
  const act = (fn: () => void) => () => {
    onDone();
    fn();
  };

  return (
    <>
      {manage && (!view || expired) ? (
        <ListItem
          divider
          label={view ? 'Yêu cầu xác nhận lại' : 'Yêu cầu xác nhận đã đọc'}
          leading={<Icon name="checkmark-circle" />}
          onPress={act(() => requestConfirm(target))}
        />
      ) : null}
      {view?.canViewReceipts && workspaceId ? (
        <ListItem
          divider
          label="Xem người đã xác nhận"
          leading={<Icon name="contact-list" />}
          onPress={act(() => openReceipts({ ...target, workspaceId }))}
        />
      ) : null}
      {manage && view ? (
        <ListItem
          divider
          label="Huỷ yêu cầu xác nhận"
          leading={<Icon name="cancel-2" />}
          onPress={act(() => requestCancel(target))}
        />
      ) : null}
    </>
  );
}
