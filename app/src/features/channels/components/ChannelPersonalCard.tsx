import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { Select } from '@/shared/ui/select';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection } from '@/shared/utils/haptics';

export interface ChannelPersonalCardProps {
  notifyLabel: string | undefined;
  onNotifyPress: () => void;
  onPinnedChange: (value: boolean) => void;
  pinned: boolean;
}

/**
 * Khối "Cá nhân" — thông báo (INHERIT/ALL/MENTIONS/MUTED) + ghim (app.md §3). Tiêu đề nằm NGOÀI thẻ (`Section`), cùng kiểu mọi
 * khối của màn Thông tin kênh và Cài đặt nhóm.
 */
export function ChannelPersonalCard({
  notifyLabel,
  onNotifyPress,
  onPinnedChange,
  pinned,
}: ChannelPersonalCardProps) {
  return (
    <Section icon="user" title="Cá nhân">
      <Card>
        <View className="gap-md">
          <Toggle
            label="Ghim kênh"
            value={pinned}
            onChange={(value) => {
              hapticSelection(); // bật/tắt một thiết lập = đổi lựa chọn
              onPinnedChange(value);
            }}
          />
          <Select
            label="Thông báo"
            placeholder="Chọn chế độ thông báo"
            value={notifyLabel}
            onPress={onNotifyPress}
          />
        </View>
      </Card>
    </Section>
  );
}
