import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { mentionsToPlainText, type ChatScopeRef } from '@/features/chat';
import type { ComposerDraftSnapshot } from '@/shared/message-extensions';
import { Button } from '@/shared/ui/button';
import { hapticSuccess } from '@/shared/utils/haptics';

import { useChatExtLimits } from '../../hooks/useChatSubFeatures';
import { useScheduleMessage } from '../../hooks/useScheduledMessages';
import { describeChatExtError } from '../../utils/error-info';
import { ME_SCHEDULED_HREF } from '../../utils/chat-ext-routes';
import { currentTimeZone, daysToMs } from '../../utils/local-time';
import { WhenPickerSheet } from '../when/WhenPickerSheet';

export interface ScheduleSendSheetProps {
  scope: ChatScopeRef;
  draft: ComposerDraftSnapshot;
  visible: boolean;
  onClose: () => void;
}

/**
 * Tấm "Hẹn giờ gửi" (p7-04 app.md §3): xem trước nội dung đang soạn (1–2 dòng + số tệp) rồi chọn thời điểm (gợi ý nhanh hoặc ngày/giờ tự chọn). Thành công ⇒ `draft.consume()` (composer
 * xoá chữ/tệp/nháp như sau khi gửi) + đóng tấm + toast "Đã hẹn gửi lúc …"; thất bại thì KHÔNG xoá gì — người dùng không mất chữ đang soạn.
 *
 * Lỗi BE: `SCHED_001` dưới ô giờ; `SCHED_002` (đủ trần tin đang chờ) kèm nút "Xem tin đã hẹn" để tự dọn bớt; `MSG_004` ("Bạn không thể gửi tin ở đây") và mã khác trong khối cảnh báo.
 */
export function ScheduleSendSheet({ scope, draft, visible, onClose }: ScheduleSendSheetProps) {
  const limits = useChatExtLimits().scheduled;
  const schedule = useScheduleMessage(scope);
  const error = schedule.isError ? describeChatExtError(schedule.error) : undefined;
  const plain = mentionsToPlainText(draft.content, []).trim();
  const files = draft.attachmentAssetIds.length;

  const submit = (at: Date) =>
    schedule.mutate(
      {
        ...(draft.content ? { content: draft.content } : {}),
        mentions: draft.mentions,
        attachmentAssetIds: draft.attachmentAssetIds,
        ...(draft.replyToId ? { replyToId: draft.replyToId } : {}),
        sendAt: at.toISOString(),
        timezone: currentTimeZone(),
      },
      {
        onSuccess: () => {
          hapticSuccess(); // đã HẸN xong (server xác nhận) — tấm đóng ngay sau, rung là phản hồi "đã lưu"
          draft.consume();
          onClose();
        },
      },
    );

  return (
    <WhenPickerSheet
      header={
        <View className="gap-3xs rounded-2xs bg-bg-2 p-sm">
          {plain ? (
            <Text className="text-body-md text-fg-1" numberOfLines={2}>
              {plain}
            </Text>
          ) : null}
          {files > 0 ? <Text className="text-caption-sm text-fg-2">{`${files} tệp đính kèm`}</Text> : null}
        </View>
      }
      kind="schedule"
      otherAction={
        error?.code === 'SCHED_002' ? (
          <Button
            label="Xem tin đã hẹn"
            size="xs"
            variant="tertiary"
            onPress={() => {
              onClose();
              router.push(ME_SCHEDULED_HREF);
            }}
          />
        ) : undefined
      }
      otherError={error && !error.timeField ? error.message : undefined}
      pending={schedule.isPending}
      subject="Thời điểm gửi"
      submitLabel="Hẹn gửi"
      summaryPrefix="Gửi lúc"
      timeError={error?.timeField ? error.message : undefined}
      title="Hẹn giờ gửi"
      visible={visible}
      window={{ minLeadMs: limits.minLeadSeconds * 1000, maxMs: daysToMs(limits.sendAtMaxDays) }}
      onClose={onClose}
      onSubmit={submit}
    />
  );
}
