import { useState } from 'react';
import { View } from 'react-native';

import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { MENTOR_LIMITS } from '../constants/mentor.constants';
import { useApplyToPost } from '../queries/mentor.mutations';
import { applyFormSchema, type ApplyFormValues } from '../schemas/mentor.schemas';
import { mentorErrorMessage } from '../utils/mentor-errors';
import { newIdempotencyKey } from '../utils/mentor-format';

export interface ApplySheetProps {
  postId: string;
  visible: boolean;
  onClose: () => void;
}

/**
 * Ứng tuyển cố vấn (app.md §3): lời nhắn 20–1000 ký tự + link hồ sơ `https` (không bắt buộc). Lỗi server (`MENTOR_003/004/006`,
 * 429…) hiện NGAY TRONG tấm — người dùng còn đang điền. `Idempotency-Key` sinh một lần mỗi lần mở tấm.
 */
export function ApplySheet({ onClose, postId, visible }: ApplySheetProps) {
  const apply = useApplyToPost(postId);
  const [idempotencyKey] = useState(() => newIdempotencyKey('mentor-apply'));
  const form = useZodForm<ApplyFormValues, ApplyFormValues>(applyFormSchema, {
    defaultValues: { message: '', portfolioUrl: '' },
  });

  const submit = form.handleSubmit((values) =>
    apply.mutate(
      {
        idempotencyKey,
        payload: { message: values.message, portfolioUrl: values.portfolioUrl || undefined },
      },
      {
        onSuccess: () => {
          // Rung "xong" khi server đã nhận đơn — tấm đóng ngay nên cú rung + toast là hai tín hiệu duy nhất của việc vừa thành.
          hapticSuccess();
          showToast('success', 'Đã gửi đơn ứng tuyển');
          form.reset();
          onClose();
        },
      },
    ),
  );

  return (
    <BottomSheet
      // Lỗi server đứng yên dưới tiêu đề: lời nhắn nhiều dòng + bàn phím mở thì dòng lỗi ở cuối thân cuộn nằm khuất.
      alert={
        apply.error ? (
          <Alert description={mentorErrorMessage(apply.error)} tone="error" />
        ) : undefined
      }
      description="Nhóm chỉ thấy tên, lời nhắn và link hồ sơ của bạn (không thấy email)."
      footer={
        <Button
          fullWidth
          iconLeft="direct"
          label="Gửi đơn"
          loading={apply.isPending}
          onPress={submit}
        />
      }
      scrollable
      title="Ứng tuyển cố vấn"
      visible={visible}
      onClose={onClose}
    >
      <View className="gap-md py-xs">
        <FormInput<ApplyFormValues>
          control={form.control}
          label="Lời nhắn"
          maxLength={MENTOR_LIMITS.messageMax}
          multiline
          name="message"
          placeholder="Giới thiệu kinh nghiệm và cách bạn có thể giúp nhóm"
          required
        />
        <FormInput<ApplyFormValues>
          autoCapitalize="none"
          control={form.control}
          keyboardType="url"
          label="Link hồ sơ (không bắt buộc)"
          name="portfolioUrl"
          placeholder="https://github.com/ten-ban"
        />
      </View>
    </BottomSheet>
  );
}
