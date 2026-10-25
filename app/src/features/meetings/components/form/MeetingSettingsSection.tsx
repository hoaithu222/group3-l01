import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon, type IconName } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Toggle } from '@/shared/ui/toggle';

import type { MeetingLobbyMode, MeetingVisibility } from '../../api/meetings.types';
import { LOBBY_LABEL, VISIBILITY_LABEL } from '../../constants/meetings.constants';
import { ChipField } from './ChipField';
import type { MeetingFormApi } from './meeting-form.types';

const VISIBILITIES: readonly MeetingVisibility[] = ['ATTENDEES', 'WORKSPACE'];
const LOBBIES: readonly MeetingLobbyMode[] = ['OFF', 'NON_ATTENDEES', 'ALL'];
/** Cùng icon với hàng "ai xem được" ở màn chi tiết (ổ khoá = chỉ người được mời, nhóm = cả nhóm). */
const VISIBILITY_ICONS: Record<MeetingVisibility, IconName> = {
  ATTENDEES: 'lock',
  WORKSPACE: 'add-team',
};

export interface MeetingSettingsSectionProps {
  form: MeetingFormApi;
  /** Họp đang diễn ra: chỉ còn phòng chờ (lobby) sửa được — khớp `LIVE_EDITABLE` của BE. */
  limited?: boolean;
  mode: 'create' | 'edit';
}

/**
 * Tuỳ chọn khác (app.md p2-04 §3 `MeetingSettingsSection`): ai xem được, PHÒNG CHỜ (Tắt / Người ngoài danh sách / Tất cả — chỉ họp nội bộ
 * mới có phòng), cần biên bản, cho phép ghi hình. Cả bốn đều có mặc định dùng được ngay và không có lỗi kiểm tra nào nằm trong đây ⇒ khi
 * TẠO được THU GỌN sau một hàng "Tuỳ chọn khác" (kèm tóm tắt giá trị đang chọn) để form ngắn lại; khi SỬA thì mở sẵn (người mở form sửa
 * thường là để đổi đúng mấy thứ này). "Gửi nhắc qua" thuộc khối Nhắc lịch (`MeetingNotifyField`), "Tạo nhóm chat" thuộc khối Người tham dự.
 */
export function MeetingSettingsSection({ form, limited = false, mode }: MeetingSettingsSectionProps) {
  const { control } = form;
  const platform = useWatch({ control, name: 'platform' });
  const visibility = useWatch({ control, name: 'visibility' });
  const lobbyMode = useWatch({ control, name: 'lobbyMode' });
  const [open, setOpen] = useState(mode === 'edit');
  const internal = platform === 'INTERNAL';

  const fields = (
    <View className="gap-md">
      <Controller
        control={control}
        name="visibility"
        render={({ field }) => (
          <ChipField
            icons={VISIBILITY_ICONS}
            label="Ai xem được cuộc họp"
            labels={VISIBILITY_LABEL}
            locked={limited}
            options={VISIBILITIES}
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {internal ? (
        <Controller
          control={control}
          name="lobbyMode"
          render={({ field }) => (
            <ChipField
              label="Phòng chờ"
              labels={LOBBY_LABEL}
              options={LOBBIES}
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      ) : null}
      <Controller
        control={control}
        name="recapRequired"
        render={({ field }) => (
          <Toggle
            description="Nhắc chủ trì đăng biên bản sau buổi họp."
            disabled={limited}
            label="Cần biên bản"
            value={field.value}
            onChange={field.onChange}
          />
        )}
      />
      {internal ? (
        <Controller
          control={control}
          name="recordingAllowed"
          render={({ field }) => (
            <Toggle
              description="Chủ trì được phép ghi hình buổi họp."
              disabled={limited}
              label="Cho phép ghi hình"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      ) : null}
    </View>
  );

  if (mode === 'edit') return fields;

  const summary = [
    VISIBILITY_LABEL[visibility],
    internal ? `Phòng chờ: ${LOBBY_LABEL[lobbyMode]}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Card>
      {/* Hàng thu gọn có ô icon + tiêu đề đậm: trông như một lối vào bấm được chứ không phải một dòng chữ mô tả lạc giữa form. */}
      <ListItem
        description={summary}
        emphasis="title"
        label="Tuỳ chọn khác"
        leading={<IconTile name="setting" size="sm" tone="neutral" />}
        trailing={<Icon color="fg-2" name={open ? 'arrow-up-small' : 'arrow-down-small'} size="sm" />}
        onPress={() => setOpen((value) => !value)}
      />
      {open ? fields : null}
    </Card>
  );
}
