import { Pressable, Text, View } from 'react-native';

import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { useFeature } from '@/shell/capabilities';
import { hapticSelection } from '@/shared/utils/haptics';
import { cn } from '@/shared/utils/style/cn';

import type { ChannelType } from '../../api';
import {
  CHANNEL_TYPE_ICON,
  CHANNEL_TYPE_LABEL,
  CHANNEL_TYPE_TONE,
} from '../../utils/channel-type-art';
import type { ChannelDraft } from './create-channel-draft.types';

const TYPE_DESCRIPTION: Record<ChannelType, string> = {
  POMODORO: 'Không gian học/làm cùng nhau theo phiên Pomodoro.',
  TEXT: 'Trò chuyện bằng tin nhắn văn bản.',
  VOICE: 'Phòng thoại — chạm để mở xem trước, không tự bật mic (CH-05).',
};

export interface TypeStepProps {
  draft: ChannelDraft;
  onChange: (patch: Partial<ChannelDraft>) => void;
}

/**
 * Bước 2/5 — TEXT luôn có; VOICE/POMODORO chỉ hiện khi cờ phân hệ bật (app.md §3, §8).
 *
 * Mỗi lựa chọn là một thẻ có ô icon theo LOẠI (cùng icon + tông với dòng kênh ở danh sách — người dùng thấy trước kênh sẽ trông
 * ra sao). Thẻ đang chọn: viền + nền thương hiệu VÀ dấu tích — không để màu là dấu hiệu duy nhất.
 */
export function TypeStep({ draft, onChange }: TypeStepProps) {
  const voiceEnabled = useFeature('voice');
  const pomodoroEnabled = useFeature('pomodoro');
  const types: ChannelType[] = [
    'TEXT',
    ...(voiceEnabled ? (['VOICE'] as const) : []),
    ...(pomodoroEnabled ? (['POMODORO'] as const) : []),
  ];

  return (
    <View className="gap-sm">
      {types.map((type) => {
        const selected = draft.type === type;
        return (
          <Pressable
            key={type}
            accessibilityLabel={`${CHANNEL_TYPE_LABEL[type]}. ${TYPE_DESCRIPTION[type]}`}
            accessibilityRole="radio"
            accessibilityState={{ checked: selected, selected }}
            className={cn(
              'flex-row items-center gap-sm rounded-md border-hairline p-sm active:opacity-80',
              selected ? 'border-border-brand bg-action-tint' : 'border-border-1',
            )}
            onPress={() => {
              if (!selected) hapticSelection();
              onChange({ type });
            }}
          >
            <IconTile name={CHANNEL_TYPE_ICON[type]} tone={CHANNEL_TYPE_TONE[type]} />
            <View className="flex-1 gap-3xs">
              <Text
                className={cn(
                  'text-label-lg font-semibold',
                  selected ? 'text-fg-brand' : 'text-fg-1',
                )}
              >
                {CHANNEL_TYPE_LABEL[type]}
              </Text>
              <Text className="text-caption-sm text-fg-2">{TYPE_DESCRIPTION[type]}</Text>
            </View>
            {selected ? <Icon color="fg-brand" name="checkmark-circle" size="sm" /> : null}
          </Pressable>
        );
      })}
    </View>
  );
}
