import { useMemo, useState } from 'react';
import { Controller } from 'react-hook-form';
import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { newClientMessageId } from '@/features/chat';
import type { ChatScopeRef } from '@/features/chat';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSuccess } from '@/shared/utils/haptics';
import { serverNowMs } from '@/shell/store/slices/clock/clock.store';

import { useChatExtLimits } from '../../hooks/useChatSubFeatures';
import { useCreatePoll } from '../../hooks/useCreatePoll';
import {
  createPollFormSchema,
  EMPTY_POLL_FORM,
  toCreatePollInput,
  type PollFormValues,
} from '../../schemas/poll.schemas';
import { describeChatExtError } from '../../utils/error-info';
import { PollDeadlineFields } from './PollDeadlineFields';
import { PollOptionsEditor } from './PollOptionsEditor';

export interface CreatePollSheetProps {
  scope: ChatScopeRef;
  visible: boolean;
  onClose: () => void;
}

/**
 * Tấm "Tạo khảo sát" (p7-04 app.md §3): câu hỏi · các lựa chọn · "Cho chọn nhiều" · "Ẩn danh" · "Đặt hạn chốt". Giới hạn theo `capabilities.limits.poll`, KHÔNG hard-code.
 *
 * ── Lỗi ─────────────────────────────────────────────────────────────────────
 *  · Kiểm ở client (`poll.schemas.ts`) gắn vào ĐÚNG ô. Lỗi từ BE hiện trong tấm (không toast — tấm còn mở để sửa): `POLL_002` dưới ô giờ hạn chốt, `POLL_001`/mã khác trong khối cảnh
 *    báo phía trên; `MSG_004`/mất quyền (403/404) cũng ở khối đó — màn cha (kênh/hội thoại) tự xử lý tiếp khi người dùng đóng tấm.
 *  · Ngoại tuyến ⇒ nút "Tạo" tắt + nhãn "Kết nối lại để gửi" (cùng luật `announcements`); nháp KHÔNG mất vì state nằm trong form của tấm.
 *
 * `clientMessageId` sinh MỘT lần mỗi lượt mở (state khởi tạo lười; host đổi `key` mỗi lần mở): bấm lại/thử lại không sinh hai khảo sát. Lựa chọn giữ state cục bộ của tấm, mất khi đóng (không lưu nháp — app.md §5).
 */
export function CreatePollSheet({ scope, visible, onClose }: CreatePollSheetProps) {
  const limits = useChatExtLimits().poll;
  const offline = useConnectionState() === 'offline';
  // Sinh MỘT lần mỗi lần dựng tấm (state khởi tạo lười, không phải ref: đọc ref trong handler submit bị `react-hooks/refs` chặn).
  const [clientMessageId] = useState(newClientMessageId);
  const create = useCreatePoll(scope);
  const schema = useMemo(() => createPollFormSchema(limits, serverNowMs), [limits]);
  const form = useZodForm(schema, { defaultValues: EMPTY_POLL_FORM });

  const submit = form.handleSubmit((values: PollFormValues) => {
    // Rung "đã xong" khi khảo sát được tạo (server xác nhận) — tấm đóng ngay sau đó, thẻ khảo sát hiện trong cuộc trò chuyện.
    create.mutate(toCreatePollInput(values, clientMessageId), {
      onSuccess: () => {
        hapticSuccess();
        onClose();
      },
    });
  });

  const error = create.isError ? describeChatExtError(create.error) : undefined;
  const timeError = error?.timeField ? error.message : undefined;

  return (
    <BottomSheet
      // Lỗi chung (không thuộc ô nào) ghim dưới tiêu đề — ở đầu vùng cuộn thì cuộn xuống sửa hạn chốt là lỗi trôi mất. Lỗi giờ hạn chốt vẫn ở ĐÚNG ô.
      alert={
        error && !error.timeField ? <Alert description={error.message} tone="error" /> : undefined
      }
      dismissOnBackdrop={!create.isPending}
      footer={
        <Button
          disabled={offline}
          fullWidth
          label={offline ? 'Kết nối lại để gửi' : 'Tạo'}
          loading={create.isPending}
          onPress={() => void submit()}
        />
      }
      scrollable
      title="Tạo khảo sát"
      visible={visible}
      onClose={onClose}
    >
      {/* ⛔ Không `pb-*` cuối thân: vùng `footer` tự cách nội dung 12dp. */}
      <View className="gap-md">
        <FormInput
          control={form.control}
          label="Câu hỏi"
          maxLength={limits.questionMax * 4}
          multiline
          name="question"
          placeholder="Bạn muốn hỏi điều gì?"
        />
        <PollOptionsEditor
          control={form.control}
          max={limits.optionsMax}
          min={limits.optionsMin}
          optionMax={limits.optionMax}
        />
        <Controller
          control={form.control}
          name="multi"
          render={({ field }) => (
            <Toggle
              description="Mỗi người chọn được nhiều lựa chọn"
              label="Cho chọn nhiều"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <Controller
          control={form.control}
          name="anonymous"
          render={({ field }) => (
            <Toggle
              description="Không ai thấy bạn chọn gì, kể cả người tạo"
              label="Ẩn danh"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
        <PollDeadlineFields
          control={form.control}
          maxDays={limits.closesInMaxDays}
          serverTimeError={timeError}
          setValue={form.setValue}
        />
      </View>
    </BottomSheet>
  );
}
