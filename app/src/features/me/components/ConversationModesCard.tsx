import { Text, View } from 'react-native';

import type {
  AccountNotificationPreference,
  UpdateAccountNotificationPreferencePayload,
} from '@/core/notifications';
import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Chip } from '@/shared/ui/chip';
import { IconTile } from '@/shared/ui/icon-tile';
import { Section } from '@/shared/ui/section';
import { hapticSelection } from '@/shared/utils/haptics';

import {
  CONVERSATION_MODE_GROUPS,
  DEFAULT_TAG,
  MODES_INTRO,
  MODES_MUTED_NOTE,
} from '../constants/notification.messages';
import { MeToggleRow } from './MeToggleRow';

export interface ConversationModesCardProps {
  data: AccountNotificationPreference;
  disabled: boolean;
  onChange: (patch: UpdateAccountNotificationPreferencePayload) => void;
}

/**
 * Chế độ thông báo theo loại cuộc trò chuyện ở CẤP TÀI KHOẢN + âm thanh trong app (p1-07 `app.md` §3): Tin nhắn 1-1 · Nhóm
 * chat · Kênh. Giá trị là HIỆU LỰC (BE đã điền mặc định hệ thống); `isDefault` → gắn nhãn "Mặc định" để người dùng biết
 * mình chưa chọn. Đổi lạc quan, lỗi hoàn lại (`useUpdateAccountNotificationPreference`).
 */
export function ConversationModesCard({ data, disabled, onChange }: ConversationModesCardProps) {
  return (
    <Section icon="chat-bubble" title="Thông báo tin nhắn">
      <Card>
        <Text className="text-body-md text-fg-2">{MODES_INTRO}</Text>

        {CONVERSATION_MODE_GROUPS.map((group) => (
          <View key={group.field} className="gap-xs border-t border-t-divider-1 pt-sm">
            <View className="flex-row items-center gap-sm">
              <IconTile name={group.icon} size="sm" tone={group.tone} />
              <Text className="text-label-lg font-semibold text-fg-1">{group.title}</Text>
              {data.isDefault[group.field] ? (
                <Badge label={DEFAULT_TAG} size="sm" variant="neutral" />
              ) : null}
            </View>
            {/* Chip `role="radio"` = chọn MỘT trong nhiều (2–3 lựa chọn ngắn nằm gọn một hàng thay vì ba hàng Radio). Khung
                `radiogroup` mang tên nhóm cho trình đọc màn hình; `flex-wrap` cho chip xuống dòng khi máy hẹp/chữ to. */}
            <View
              accessibilityLabel={group.title}
              accessibilityRole="radiogroup"
              className="flex-row flex-wrap gap-xs"
            >
              {group.options.map((option) => (
                <Chip
                  key={option.value}
                  disabled={disabled}
                  label={option.label}
                  role="radio"
                  selected={data[group.field] === option.value}
                  size="sm"
                  onPress={() => {
                    if (data[group.field] !== option.value) {
                      hapticSelection();
                      onChange({
                        [group.field]: option.value,
                      } as UpdateAccountNotificationPreferencePayload);
                    }
                  }}
                />
              ))}
            </View>
          </View>
        ))}

        <Text className="text-caption-sm text-fg-2">{MODES_MUTED_NOTE}</Text>
      </Card>

      {/* Âm thanh là công tắc riêng, không thuộc loại cuộc trò chuyện nào nên đứng thẻ riêng ngay dưới. */}
      <Card className="gap-0 px-md py-2xs" padded={false}>
        <MeToggleRow
          description="Phát âm ngắn khi có tin mới trong lúc bạn đang mở ứng dụng"
          disabled={disabled}
          divider={false}
          icon="audio"
          label="Âm thanh trong ứng dụng"
          tone="brand"
          value={data.sound}
          onChange={(value) => onChange({ sound: value })}
        />
      </Card>
    </Section>
  );
}
