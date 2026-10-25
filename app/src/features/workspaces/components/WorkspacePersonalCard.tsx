import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { Select } from '@/shared/ui/select';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection } from '@/shared/utils/haptics';

export interface WorkspacePersonalCardProps {
  isFavorite: boolean;
  notifyLabel: string | undefined;
  onFavoriteChange: (value: boolean) => void;
  onNotifyPress: () => void;
}

/** Khối "Cá nhân" (tiêu đề nằm NGOÀI thẻ, cùng kiểu mọi khối của màn) trong `WorkspaceSettingsScreen` — tách riêng để giữ màn dưới trần 200 dòng. */
export function WorkspacePersonalCard({
  isFavorite,
  notifyLabel,
  onFavoriteChange,
  onNotifyPress,
}: WorkspacePersonalCardProps) {
  return (
    <Section icon="user" title="Cá nhân">
      <Card>
        <View className="gap-md">
          <Toggle
            label="Yêu thích"
            value={isFavorite}
            onChange={(value) => {
              hapticSelection(); // bật/tắt một thiết lập = đổi lựa chọn (xem `shared/utils/haptics`)
              onFavoriteChange(value);
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
