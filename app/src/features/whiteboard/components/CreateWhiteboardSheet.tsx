import { View, Text } from 'react-native';

import { useZodForm } from '@/shared/form/useZodForm';
import { useIdempotencyKey, shouldRotateIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { Radio, RadioGroup } from '@/shared/ui/radio';
import { Section } from '@/shared/ui/section';
import { showToast } from '@/shared/utils/toast.utils';

import type { WhiteboardVisibility } from '../api/whiteboard.types';
import { VISIBILITY_HINT, VISIBILITY_LABEL, WB_UI_LIMITS } from '../constants/whiteboard.constants';
import { useCreateWhiteboard } from '../queries/whiteboard.mutations';
import { createWhiteboardSchema, type CreateWhiteboardValues } from '../schemas/whiteboard.schemas';
import { whiteboardErrorMessage } from '../utils/whiteboard-errors';

export interface CreateWhiteboardSheetProps {
  onClose: () => void;
  /** Tạo xong — nơi gọi mở thẳng bảng mới. */
  onCreated: (wbId: string) => void;
  visible: boolean;
  wsId: string;
}

/**
 * Tạo bảng trắng (app.md §3): tên + ai xem được ("Mọi người trong nhóm" mặc định / "Chỉ người được mời"). Lỗi server (`WB_001` đủ số bảng, 404
 * khách/nhóm lưu trữ…) hiện NGAY TRONG tấm (khe `alert`, đứng yên dưới tiêu đề) — người dùng còn đang điền, toast tự tắt sau 4 giây. `Idempotency-Key`
 * gắn với nội dung form: bấm hai lần / thử lại sau mất mạng chỉ tạo MỘT bảng; sau khi BE đã chốt câu trả lời (thành công hay lỗi 4xx) thì đổi khoá.
 *
 * ⚠️ Thân chỉ `gap-md`, KHÔNG `py-*`: tấm đã có khe 16 dưới tiêu đề và 12 trên hàng nút — thêm `py-xs` là 24/20dp, lệch nhịp với mọi tấm khác.
 */
export function CreateWhiteboardSheet({
  onClose,
  onCreated,
  visible,
  wsId,
}: CreateWhiteboardSheetProps) {
  const create = useCreateWhiteboard(wsId);
  const form = useZodForm<CreateWhiteboardValues, CreateWhiteboardValues>(createWhiteboardSchema, {
    defaultValues: { name: '', visibility: 'WORKSPACE' },
  });
  const values = form.watch();
  const idempotency = useIdempotencyKey('wb-create', `${values.name.trim()}|${values.visibility}`);

  const close = () => {
    create.reset();
    onClose();
  };

  const submit = form.handleSubmit((data) =>
    create.mutate(
      { idempotencyKey: idempotency.key, payload: data },
      {
        onError: (error) => {
          if (shouldRotateIdempotencyKey(error)) idempotency.rotate();
        },
        onSuccess: (board) => {
          idempotency.rotate();
          showToast('success', 'Đã tạo bảng trắng');
          form.reset();
          close();
          onCreated(board.id);
        },
      },
    ),
  );

  return (
    <BottomSheet
      alert={
        create.error ? (
          <Alert description={whiteboardErrorMessage(create.error)} tone="error" />
        ) : undefined
      }
      footer={<Button fullWidth label="Tạo bảng" loading={create.isPending} onPress={submit} />}
      scrollable
      title="Tạo bảng trắng"
      visible={visible}
      onClose={close}
    >
      <View className="gap-md">
        <FormInput<CreateWhiteboardValues>
          control={form.control}
          label="Tên bảng"
          maxLength={WB_UI_LIMITS.nameMax}
          name="name"
          placeholder="Ví dụ: Sơ đồ tư duy đồ án"
          required
          returnKeyType="done"
        />
        {/* ✅ `Section tone="default"` (16 semibold, khe 8): CÙNG cỡ với nhãn "Tên bảng" của ô nhập ngay trên — bản cũ `label-md` 14
            nhỏ hơn nhãn ô nhập, hai nhãn cùng cấp mà khác cỡ; tiêu đề nhóm còn mang vai `header` cho trình đọc màn hình. */}
        <Section title="Ai xem được" tone="default">
          <RadioGroup
            accessibilityLabel="Ai xem được bảng trắng"
            value={values.visibility}
            onChange={(next) => form.setValue('visibility', next as WhiteboardVisibility)}
          >
            <Radio label={VISIBILITY_LABEL.WORKSPACE} value="WORKSPACE" />
            <Radio label={VISIBILITY_LABEL.PRIVATE} value="PRIVATE" />
          </RadioGroup>
          <Text className="text-caption-lg text-fg-2">{VISIBILITY_HINT[values.visibility]}</Text>
        </Section>
      </View>
    </BottomSheet>
  );
}
