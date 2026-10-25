import { Pressable, Text, View } from 'react-native';

import { useFeature } from '@/shell/capabilities';
import type { IconName } from '@/shared/ui/icon';
import { IconTile, type IconTileTone } from '@/shared/ui/icon-tile';
import { showToast } from '@/shared/utils/toast.utils';

import type { MemberCard } from '../api';
import { canOpenDirectMessage, openDirectMessage } from '../utils/member-direct-message';

interface QuickAction {
  hidden: boolean;
  icon: IconName;
  key: string;
  label: string;
  onPress: () => void;
  tone: IconTileTone;
}

export interface MemberQuickActionsProps {
  card: MemberCard;
  /** Đóng thẻ TRƯỚC khi điều hướng (`<Modal>` còn mở thì màn kế bị che một nhịp). */
  onClose: () => void;
  /** Chỉ có khi mở từ màn KÊNH — app.md §3: "khi mở từ màn kênh". */
  onMention?: () => void;
}

/**
 * Hàng nút nhanh dưới đầu thẻ thành viên — Nhắn tin · Gọi · Nhắc tên (kiểu hồ sơ của Slack/Discord: việc HAY làm nhất nằm ngay dưới
 * ảnh, việc quản trị xếp hàng bên dưới). Cùng điều kiện và cùng hành động như các hàng cũ của `MemberCardActions`: "Nhắn tin" mở DM
 * thật (`openDirectMessage`, p1-05); "Gọi" (`canCall` + cờ `voice`) vẫn là Phase 2 nên chỉ báo "sắp có".
 *
 * Mỗi nút: ô icon có tông (cùng tông với `MemberActionRow`) + nhãn chữ bên dưới, cột `flex-1` chia đều (1–3 nút đều cân), cao ≥ 64dp.
 * Không nút nào hiện (thẻ của chính mình, người bị chặn) ⇒ không vẽ cả hàng.
 */
export function MemberQuickActions({ card, onClose, onMention }: MemberQuickActionsProps) {
  const voiceEnabled = useFeature('voice');

  const actions: QuickAction[] = [
    {
      hidden: !canOpenDirectMessage(card),
      icon: 'chat-bubble',
      key: 'message',
      label: 'Nhắn tin',
      onPress: () => {
        onClose();
        openDirectMessage(card);
      },
      tone: 'brand',
    },
    {
      hidden: !(voiceEnabled && card.actions.canCall),
      icon: 'phone',
      key: 'call',
      label: 'Gọi',
      onPress: () => showToast('info', 'Gọi thoại/video sẽ có ở bản cập nhật tới.'),
      tone: 'success',
    },
    {
      hidden: !onMention,
      icon: 'notification',
      key: 'mention',
      label: 'Nhắc tên',
      onPress: () => onMention?.(),
      tone: 'info',
    },
  ];
  const shown = actions.filter((action) => !action.hidden);
  if (shown.length === 0) return null;

  return (
    <View className="flex-row gap-sm pb-sm">
      {shown.map((action) => (
        <Pressable
          key={action.key}
          accessibilityLabel={action.label}
          accessibilityRole="button"
          // `active:opacity-70`: phản hồi chạm cho cả ô (icon + nhãn); `min-h-16` = 64dp, dư ngưỡng chạm 44.
          className="min-h-16 flex-1 items-center justify-center gap-2xs rounded-sm bg-bg-2 px-2xs py-xs active:opacity-70"
          onPress={action.onPress}
        >
          <IconTile name={action.icon} size="sm" tone={action.tone} />
          <Text className="text-label-sm text-fg-1" maxFontSizeMultiplier={1.3} numberOfLines={1}>
            {action.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}
