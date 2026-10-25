import { Controller, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';

import type { IconName } from '@/shared/ui/icon';

import type { MeetingNotifyVia } from '../../api/meetings.types';
import { NOTIFY_LABEL } from '../../constants/meetings.constants';
import { ChipField } from './ChipField';
import type { MeetingFormApi } from './meeting-form.types';

const NOTIFIES: readonly MeetingNotifyVia[] = ['APP', 'CHAT', 'BOTH'];
/** "Cả hai" = dấu tích đôi (ứng dụng + nhóm chat) — nghĩa đọc được ngay mà không cần icon riêng cho "kết hợp". */
const NOTIFY_ICONS: Record<MeetingNotifyVia, IconName> = {
  APP: 'notification',
  BOTH: 'tick-double-01',
  CHAT: 'chat-bubble',
};

export interface MeetingNotifyFieldProps {
  form: MeetingFormApi;
  /** Nhóm chat họp ĐÃ có (mở form sửa) — BE chỉ tạo nhóm chat lúc tạo cuộc họp. */
  hasChatGroup?: boolean;
  mode: 'create' | 'edit';
}

/**
 * "Gửi nhắc qua" (Ứng dụng / Nhóm chat / Cả hai) — thuộc khối NHẮC LỊCH chứ không phải "Cài đặt": nó chỉ trả lời "nhắc mốc trên bằng kênh
 * nào". Nhắc qua nhóm chat mà không có nhóm chat ⇒ BE rơi về nhắc qua ứng dụng (MT-16) — form nói trước điều đó thay vì để người dùng
 * ngạc nhiên. Mở form sửa: cho biết cuộc họp đã có nhóm chat (công tắc "Tạo nhóm chat" chỉ có lúc tạo).
 */
export function MeetingNotifyField({ form, hasChatGroup = false, mode }: MeetingNotifyFieldProps) {
  const { control } = form;
  const notifyVia = useWatch({ control, name: 'notifyVia' });
  const createChatGroup = useWatch({ control, name: 'createChatGroup' });
  const willHaveGroup = mode === 'create' ? createChatGroup : hasChatGroup;

  return (
    <View className="gap-2xs">
      <Controller
        control={control}
        name="notifyVia"
        render={({ field }) => (
          <ChipField
            icons={NOTIFY_ICONS}
            label="Gửi nhắc qua"
            labels={NOTIFY_LABEL}
            options={NOTIFIES}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {notifyVia !== 'APP' && !willHaveGroup ? (
        <Text className="text-caption-lg text-fg-2">
          Cuộc họp chưa có nhóm chat nên nhắc sẽ gửi qua ứng dụng.
        </Text>
      ) : null}
      {mode === 'edit' && hasChatGroup ? (
        <Text className="text-caption-lg text-fg-2">Cuộc họp này đã có nhóm chat.</Text>
      ) : null}
    </View>
  );
}
