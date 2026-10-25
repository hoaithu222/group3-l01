import { Text, View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Checkbox } from '@/shared/ui/checkbox';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';
import { hapticSelection } from '@/shared/utils/haptics';
import { skipReasonLabel } from '@/shared/workspace-templates';

import type { TemplateChannel } from '../api';
import {
  CHANNEL_TYPE_ART,
  CHANNEL_TYPE_LABEL,
  CHANNEL_VISIBILITY_LABEL,
  POSTING_POLICY_LABEL,
} from '../constants/workspace-templates.constants';
import type { SkipPlan } from '../utils/skip-plan';

export interface TemplateChannelListProps {
  channels: readonly TemplateChannel[];
  /** Khoá các kênh đang tick. */
  checkedKeys: readonly string[];
  disabled: boolean;
  /** Kênh dự kiến bị bỏ qua (chỉ màn áp mẫu có dữ liệu để tính; BE là chuẩn). */
  skips?: SkipPlan;
  onToggle: (key: string, checked: boolean) => void;
}

function channelMeta(channel: TemplateChannel): string {
  return [
    CHANNEL_TYPE_LABEL[channel.type],
    CHANNEL_VISIBILITY_LABEL[channel.visibility],
    channel.postingPolicy === 'ADMINS_ONLY' ? POSTING_POLICY_LABEL.ADMINS_ONLY : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/**
 * Kênh của mẫu đã chọn, MỖI KÊNH MỘT Ô TICK (app.md p5-04 §3): tên · loại · công khai/riêng tư · quyền đăng · mô tả — chính là
 * phần xem trước những gì sẽ được tạo. Tick sẵn theo `defaultSelected` (do nơi gọi khởi tạo `checkedKeys`). Kênh dự kiến bị bỏ
 * qua vẫn tick được (BE mới quyết định) nhưng có dòng cảnh báo bằng CHỮ, nằm trong nhãn trợ năng của ô.
 */
export function TemplateChannelList({
  channels,
  checkedKeys,
  disabled,
  skips,
  onToggle,
}: TemplateChannelListProps) {
  const checked = new Set(checkedKeys);

  return (
    <Section icon="chat-bubble" title={`Kênh sẽ tạo (${checkedKeys.length}/${channels.length})`}>
      <Card>
        <View className="gap-md">
          {channels.map((channel) => {
            const skip = skips?.[channel.key];
            const meta = channelMeta(channel);
            const skipText = skip ? `Có thể bị bỏ qua — ${skipReasonLabel(skip)}` : null;
            const art = CHANNEL_TYPE_ART[channel.type];

            return (
              <Checkbox
                key={channel.key}
                accessibilityLabel={[`Kênh ${channel.name}`, meta, channel.description, skipText]
                  .filter(Boolean)
                  .join(', ')}
                checked={checked.has(channel.key)}
                disabled={disabled}
                label={
                  // Ô icon theo LOẠI kênh (trang trí — loại đã nằm ở dòng `meta` và nhãn trợ năng của ô tick).
                  <View className="flex-row items-start gap-sm">
                    <IconTile name={art.icon} size="sm" tone={art.tone} />
                    <View className="flex-1 gap-3xs">
                      <Text className="text-label-lg font-semibold text-fg-1">{`#${channel.name}`}</Text>
                      <Text className="text-caption-sm text-fg-2">{meta}</Text>
                      {channel.description ? (
                        <Text className="text-body-md text-fg-2">{channel.description}</Text>
                      ) : null}
                      {skipText ? (
                        <Text className="text-caption-sm font-semibold text-warning">{skipText}</Text>
                      ) : null}
                    </View>
                  </View>
                }
                onChange={(next) => {
                  hapticSelection(); // tick/bỏ tick = đổi lựa chọn
                  onToggle(channel.key, next);
                }}
              />
            );
          })}
        </View>
      </Card>
    </Section>
  );
}
