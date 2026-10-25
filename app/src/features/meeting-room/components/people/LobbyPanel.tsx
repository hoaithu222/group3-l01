import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';
import { formatTime } from '@/shared/utils/format/date.utils';

import type { LobbyEntry } from '../../api/meeting-room.types';
import { PeopleSection } from './PeopleSection';

export interface LobbyPanelProps {
  /** Đang gọi "Cho tất cả vào" — nút khoá + vòng quay. */
  admitAllPending?: boolean;
  entries: readonly LobbyEntry[];
  /** `userId` đang có thao tác cho vào/từ chối chạy — hai nút của HÀNG đó khoá, hàng khác vẫn bấm được. */
  pendingUserIds?: readonly string[];
  onAdmit: (userId: string) => void;
  onAdmitAll: () => void;
  onDeny: (userId: string) => void;
}

/**
 * Danh sách chờ vào phòng cho chủ trì/đồng chủ trì (app.md p2-05 §3.2 `LobbyPanel`): tên + giờ xin vào + "Cho vào"/"Từ chối" từng người,
 * và "Cho tất cả vào" khi có từ hai người. Rỗng ⇒ "Chưa có ai chờ" (không ẩn cả khối: chủ trì cần biết khối này tồn tại và đang trống).
 *
 * Nhãn a11y nêu TÊN ("Cho Lan vào") vì đọc lần lượt các hàng thì nhiều nút cùng tên "Cho vào" không phân biệt được. Kết quả cho vào tranh
 * chấp (hai chủ trì bấm cùng lúc) do server quyết (`HDEL` nguyên tử) — component không tự loại hàng, chờ `meeting:lobby` của cha.
 */
export function LobbyPanel({ admitAllPending = false, entries, pendingUserIds = [], onAdmit, onAdmitAll, onDeny }: LobbyPanelProps) {
  return (
    // Cùng khuôn tiêu đề "Tên nhóm (n)" + hành động với các nhóm người trong phòng (`PeopleSection`) — một tấm, một nhịp.
    <PeopleSection
      action={
        entries.length >= 2 ? (
          <Button label="Cho tất cả vào" loading={admitAllPending} size="xs" variant="tertiary" onPress={onAdmitAll} />
        ) : null
      }
      count={entries.length}
      glyph={<Icon color="fg-2" name="clock" size="sm" />}
      title="Đang chờ vào"
    >
      {entries.length === 0 ? (
        <Text className="text-body-md text-fg-2">Chưa có ai chờ</Text>
      ) : null}

      {entries.map((entry) => {
        const pending = pendingUserIds.includes(entry.userId);
        return (
          <View key={entry.userId} className="gap-xs py-2xs">
            <View className="flex-row items-center gap-sm">
              <Avatar name={entry.displayName} size="sm" />
              <View className="flex-1">
                <Text className="text-body-md text-fg-1" numberOfLines={1}>
                  {entry.displayName}
                </Text>
                <Text className="text-caption-sm text-fg-2">{`Xin vào lúc ${formatTime(entry.requestedAt)}`}</Text>
              </View>
            </View>
            <View className="flex-row gap-xs">
              <Button
                accessibilityLabel={`Cho ${entry.displayName} vào`}
                iconLeft="checkmark-circle"
                label="Cho vào"
                loading={pending}
                size="sm"
                onPress={() => onAdmit(entry.userId)}
              />
              <Button
                accessibilityLabel={`Từ chối ${entry.displayName}`}
                disabled={pending}
                iconLeft="cancel"
                label="Từ chối"
                size="sm"
                variant="secondary"
                onPress={() => onDeny(entry.userId)}
              />
            </View>
          </View>
        );
      })}
    </PeopleSection>
  );
}
