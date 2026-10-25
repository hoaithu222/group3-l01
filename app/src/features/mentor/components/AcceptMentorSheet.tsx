import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Chip } from '@/shared/ui/chip';
import { Toggle } from '@/shared/ui/toggle';

import type { AcceptPayload } from '../api/mentor.types';
import { DEFAULT_DURATION_DAYS, DURATION_CHOICES } from '../constants/mentor.constants';
import { useAcceptOptions } from '../queries/mentor.queries';
import { AcceptChannelList, AcceptMemberList } from './AcceptOptionLists';

export interface AcceptMentorSheetProps {
  applicantName: string;
  busy?: boolean;
  errorMessage?: string | null;
  /** Kênh BE báo không hợp lệ (`MENTOR_008.details.channelIds`) — đánh dấu ngay trong danh sách. */
  invalidChannelIds?: string[];
  postVersion: number;
  visible: boolean;
  wsId: string;
  onClose: () => void;
  onSubmit: (payload: AcceptPayload) => void;
}

/**
 * Chấp nhận cố vấn (app.md §3 `AcceptMentorSheet`): thời hạn 7/14/30/60 ngày (mặc định 30), kênh chỉ định (mặc định kênh
 * "Chung" — `isDefault`), bật/tắt nhóm chat với cố vấn (mặc định BẬT) + thành viên kèm theo, tóm tắt quyền. Chưa chạm vào
 * danh sách kênh thì dùng mặc định (`picked === null`) — không cần effect đồng bộ khi dữ liệu kênh về.
 */
export function AcceptMentorSheet(props: AcceptMentorSheetProps) {
  const {
    applicantName,
    busy,
    errorMessage,
    invalidChannelIds = [],
    onClose,
    onSubmit,
    postVersion,
    visible,
    wsId,
  } = props;
  const { channels, members } = useAcceptOptions(wsId, visible);
  const [days, setDays] = useState<number>(DEFAULT_DURATION_DAYS);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [withChat, setWithChat] = useState(true);
  const [included, setIncluded] = useState<string[]>([]);

  const defaults = (channels.data ?? []).filter((c) => c.isDefault).map((c) => c.id);
  const channelIds = picked ?? defaults;

  const submit = () =>
    onSubmit({
      channelIds,
      createConversation: withChat,
      durationDays: days,
      expectedPostVersion: postVersion,
      includeMemberIds: withChat ? included : [],
    });

  return (
    <BottomSheet
      // Lỗi server đứng yên dưới tiêu đề — cuối thân cuộn (sau kênh + thành viên + ghi chú quyền) thì bấm xong không thấy gì.
      alert={errorMessage ? <Alert description={errorMessage} tone="error" /> : undefined}
      footer={
        <Button
          disabled={channelIds.length === 0}
          fullWidth
          label="Chấp nhận cố vấn"
          loading={busy}
          onPress={submit}
        />
      }
      scrollable
      title={`Chấp nhận ${applicantName}`}
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md py-xs">
        <View className="gap-xs">
          <Text className="text-label-md font-semibold text-fg-1">Thời hạn</Text>
          {/* Chip vai `radio` ⇒ nhóm `radiogroup` có tên, để trình đọc màn hình biết đang chọn cái gì. */}
          <View
            accessibilityLabel="Thời hạn"
            accessibilityRole="radiogroup"
            className="flex-row flex-wrap gap-xs"
          >
            {DURATION_CHOICES.map((d) => (
              <Chip
                key={d}
                label={`${d} ngày`}
                role="radio"
                selected={days === d}
                size="sm"
                onPress={() => setDays(d)}
              />
            ))}
          </View>
        </View>
        <AcceptChannelList
          invalidIds={invalidChannelIds}
          loading={channels.isLoading}
          options={channels.data ?? []}
          selected={channelIds}
          onChange={setPicked}
        />
        <Toggle
          description="Nhóm chat riêng gồm cố vấn, người đăng bài và thành viên bạn chọn."
          label="Tạo nhóm chat với cố vấn"
          value={withChat}
          onChange={setWithChat}
        />
        {withChat ? (
          <AcceptMemberList
            loading={members.isLoading}
            options={members.data ?? []}
            selected={included}
            onChange={setIncluded}
          />
        ) : null}
        <Alert
          description="Cố vấn sẽ xem được lịch sử các kênh đã chọn; không thấy danh sách thành viên, tài liệu, bảng công việc hay ví nhóm."
          tone="info"
        />
      </View>
    </BottomSheet>
  );
}
