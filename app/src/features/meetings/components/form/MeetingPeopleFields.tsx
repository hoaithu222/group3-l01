import { useState } from 'react';
import { type Control, Controller, useController, useWatch } from 'react-hook-form';
import { Text, View } from 'react-native';

import { Chip } from '@/shared/ui/chip';
import { Toggle } from '@/shared/ui/toggle';

import { ATTENDEES_MAX, COHOSTS_MAX } from '../../constants/meetings.constants';
import type { MeetingFormValues } from '../../schemas/meeting-form.schema';
import { MemberPickList } from './MemberPickList';

/**
 * Chọn người tham dự + đồng chủ trì khi TẠO (BE nhận `attendeeIds`/`coHostIds` trong body tạo). Đồng chủ trì là tập con người
 * tham dự: bỏ mời ai thì gỡ luôn vai trò của họ. Danh sách "Đã chọn" giữ TÊN người đã chọn (lưu cục bộ theo lần chọn) nên đổi từ
 * khoá tìm kiếm không làm họ biến mất khỏi màn. Sửa danh sách SAU khi tạo đi qua màn chi tiết (`/attendees`). Công tắc "Tạo nhóm chat"
 * nằm cuối khối vì nó là chuyện về NHỮNG NGƯỜI này (thêm họ vào nhóm để trao đổi), và chỉ có nghĩa lúc tạo — nên khối này chỉ dựng khi tạo.
 */
export function MeetingPeopleFields({ control }: { control: Control<MeetingFormValues> }) {
  const workspaceId = useWatch({ control, name: 'workspaceId' });
  const attendees = useController({ control, name: 'attendeeIds' });
  const coHosts = useController({ control, name: 'coHostIds' });
  const [names, setNames] = useState<Record<string, string>>({});
  const selected = attendees.field.value;
  const hosts = coHosts.field.value;

  const toggleAttendee = (userId: string, name: string) => {
    if (selected.includes(userId)) {
      attendees.field.onChange(selected.filter((id) => id !== userId));
      coHosts.field.onChange(hosts.filter((id) => id !== userId));
    } else if (selected.length < ATTENDEES_MAX) {
      setNames((prev) => ({ ...prev, [userId]: name }));
      attendees.field.onChange([...selected, userId]);
    }
  };
  const toggleHost = (userId: string) =>
    coHosts.field.onChange(
      hosts.includes(userId) ? hosts.filter((id) => id !== userId) : [...hosts, userId],
    );

  return (
    <View className="gap-md">
      {workspaceId ? (
        <View className="gap-xs">
          <Text className="text-label-md font-semibold text-fg-1">
            Người tham dự ({selected.length}/{ATTENDEES_MAX})
          </Text>
          <MemberPickList selected={selected} workspaceId={workspaceId} onToggle={toggleAttendee} />
          {selected.length > 0 ? (
            <View className="gap-2xs">
              <Text className="text-label-md font-semibold text-fg-1">Đã chọn — chạm để bỏ</Text>
              <View className="flex-row flex-wrap gap-xs">
                {selected.map((userId) => (
                  <Chip
                    key={userId}
                    label={names[userId] ?? 'Thành viên'}
                    role="checkbox"
                    selected
                    onPress={() => toggleAttendee(userId, names[userId] ?? 'Thành viên')}
                  />
                ))}
              </View>
              <Text className="text-label-md font-semibold text-fg-1">
                Đồng chủ trì ({hosts.length}/{COHOSTS_MAX})
              </Text>
              <View className="flex-row flex-wrap gap-xs">
                {selected.map((userId) => (
                  <Chip
                    key={userId}
                    disabled={!hosts.includes(userId) && hosts.length >= COHOSTS_MAX}
                    label={names[userId] ?? 'Thành viên'}
                    role="checkbox"
                    selected={hosts.includes(userId)}
                    onPress={() => toggleHost(userId)}
                  />
                ))}
              </View>
            </View>
          ) : null}
        </View>
      ) : (
        // Chưa chọn nhóm thì chưa có danh sách để chọn — nói thẳng thay vì để khối này trống trơn dưới tiêu đề.
        <Text className="text-body-md text-fg-2">Chọn nhóm ở trên để mời người tham dự.</Text>
      )}
      <Controller
        control={control}
        name="createChatGroup"
        render={({ field }) => (
          <Toggle
            description="Người tham dự được thêm vào nhóm để trao đổi trước và sau buổi họp."
            label="Tạo nhóm chat cho cuộc họp"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
    </View>
  );
}
