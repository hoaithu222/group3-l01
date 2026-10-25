import { router } from 'expo-router';
import { Pressable, Text } from 'react-native';

import type { ComposerTopProps } from '@/shared/message-extensions';
import { Icon } from '@/shared/ui/icon';

import { useChatSubFeatures } from '../../hooks/useChatSubFeatures';
import { useScheduledCount } from '../../hooks/useScheduledMessages';
import { scheduledOfScopeHref } from '../../utils/chat-ext-routes';

function ScheduledBannerBody({ scope }: ComposerTopProps) {
  const { data } = useScheduledCount(scope, true);
  // Đang tải / lỗi / 0 tin ⇒ ẩn (giữ ô soạn gọn): "0 tin đã hẹn" là nhiễu, và lỗi tải số đếm không đáng báo.
  if (!data || data.count === 0) return null;
  const label = `${data.count}${data.more ? '+' : ''} tin đã hẹn trong cuộc trò chuyện này`;

  return (
    <Pressable
      accessibilityHint="Mở danh sách tin đã hẹn giờ"
      accessibilityLabel={label}
      accessibilityRole="button"
      className="min-h-11 flex-row items-center gap-xs border-t border-divider-1 bg-bg-1 px-md py-xs active:opacity-70"
      onPress={() => router.push(scheduledOfScopeHref(scope.scopeType, scope.scopeId))}
    >
      <Icon color="fg-brand" name="timer" size="sm" variant="twotone" />
      <Text className="flex-1 text-label-md text-fg-1">{label}</Text>
      <Icon color="fg-2" name="arrow-right-small" size="sm" />
    </Pressable>
  );
}

/** Dải "N tin đã hẹn trong cuộc trò chuyện này" ngay trên ô soạn (khe `composerTop`, p7-04 app.md §3): chạm mở "Tin đã hẹn" lọc theo phòng. Cờ `scheduledMessages` tắt ⇒ không vẽ, không gọi API. */
export function ScheduledBanner({ scope }: ComposerTopProps) {
  const { scheduledMessages } = useChatSubFeatures();
  return scheduledMessages ? <ScheduledBannerBody scope={scope} /> : null;
}
