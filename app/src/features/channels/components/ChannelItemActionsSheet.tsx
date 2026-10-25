import { BottomSheet, SheetList } from '@/shared/ui/bottom-sheet';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';

import type { ChannelListItem } from '../api';

interface ChannelAction {
  /** Lý do hàng bị khoá (hết chỗ lên/xuống) — hàng khoá mà không nói vì sao thì người dùng tưởng app hỏng. */
  description?: string;
  disabled?: boolean;
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  tone: IconTileTone;
}

export interface ChannelItemActionsSheetProps {
  canMoveDown: boolean;
  canMoveUp: boolean;
  channel: ChannelListItem | null;
  onClose: () => void;
  onMove: (direction: 'down' | 'up') => void;
  onToggleMute: () => void;
  onTogglePin: () => void;
}

/**
 * Nhấn giữ một kênh trong "Kênh của bạn" (app.md §3): Ghim/Lên-xuống/Tắt tiếng.
 *
 * ✅ Hàng là `ListItem` (tiêu đề `emphasis="title"`, kẻ ngăn, phản hồi chạm, cờ khoá cho trình đọc màn hình) trong `SheetList`
 * (lề 16 như tiêu đề tấm) — thay cho hàng `Pressable` tự dựng: cùng dáng với mọi menu hành động khác của app.
 * ⛔ KHÔNG dùng `ActionMenuSheet`: nó đóng tấm TRƯỚC rồi mới chạy việc (sau hiệu ứng đóng), mà các việc ở đây đọc
 * `actionsChannel` + `useChannelMe(…, actionsChannel.id)` của màn cha — tới lúc chạy thì kênh đã về `null`, lệnh gửi nhầm đích.
 */
export function ChannelItemActionsSheet({
  canMoveDown,
  canMoveUp,
  channel,
  onClose,
  onMove,
  onToggleMute,
  onTogglePin,
}: ChannelItemActionsSheetProps) {
  const muted = channel?.notifyMode === 'MUTED';
  const actions: ChannelAction[] = [
    {
      icon: 'favorite',
      key: 'pin',
      label: channel?.pinned ? 'Bỏ ghim' : 'Ghim kênh',
      onPress: onTogglePin,
      tone: 'warning',
    },
    {
      description: canMoveUp ? undefined : 'Kênh đã ở đầu danh sách',
      disabled: !canMoveUp,
      icon: 'arrow-up',
      key: 'up',
      label: 'Chuyển lên',
      onPress: () => onMove('up'),
      tone: 'neutral',
    },
    {
      description: canMoveDown ? undefined : 'Kênh đã ở cuối danh sách',
      disabled: !canMoveDown,
      icon: 'arrow-down',
      key: 'down',
      label: 'Chuyển xuống',
      onPress: () => onMove('down'),
      tone: 'neutral',
    },
    {
      icon: muted ? 'noti' : 'noti-off',
      key: 'mute',
      label: muted ? 'Bật lại thông báo' : 'Tắt tiếng',
      onPress: onToggleMute,
      tone: 'info',
    },
  ];

  return (
    /* `padded={false}` + `SheetList`: hàng dính nhau, ngăn bằng kẻ — thân `padded` mặc định chèn khe 8 giữa hai hàng (kẻ và
       hàng kế tiếp hở ra); `SheetList` giữ lề 16 cho icon và chữ. */
    <BottomSheet
      padded={false}
      title={channel?.name ?? ''}
      visible={channel !== null}
      onClose={onClose}
    >
      <SheetList accessibilityRole="menu" className="pb-md">
        {actions.map((action, index) => (
          <ListItem
            key={action.key}
            description={action.description}
            disabled={action.disabled}
            divider={index < actions.length - 1}
            emphasis="title"
            label={action.label}
            labelNumberOfLines={2}
            // Hàng khoá hạ ô icon về `neutral` — nhãn đã chuyển màu khoá (`ListItem disabled`), ô icon giữ tông thì trông vẫn bấm được.
            leading={
              <IconTile
                name={action.icon}
                size="sm"
                tone={action.disabled ? 'neutral' : action.tone}
              />
            }
            onPress={action.onPress}
          />
        ))}
      </SheetList>
    </BottomSheet>
  );
}
