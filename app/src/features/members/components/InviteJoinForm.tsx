import { useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { useZodForm } from '@/shared/form/useZodForm';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';

import { JOIN_REQUEST_MESSAGE_MAX } from '../api/invitations.constants';
import { joinRequestSchema, type JoinRequestFormValues } from '../schemas/join-request.schemas';

export interface InviteJoinFormProps {
  accepting: boolean;
  /** Lời nhắn ĐÃ cắt khoảng trắng, hoặc `undefined` khi để trống (không gửi body). */
  onAccept: (requestMessage?: string) => void;
}

/**
 * Nhánh "Tham gia" của link mời (p3-04): ô lời nhắn cho quản trị viên (TUỲ CHỌN, đếm ký tự, ≤ 500) + nút Tham gia.
 *
 * ⚠️ Ô hiện ở MỌI nhóm, không chỉ nhóm cần duyệt: xem trước lời mời (`GET /invites/:token`) không trả `joinPolicy`, và luật là không dựng
 * API mới một phía — nên client không biết trước. Câu gợi ý dưới ô nói rõ "chỉ gửi đi nếu nhóm cần duyệt" để người dùng không hiểu nhầm là
 * bắt buộc; nhóm mở thì BE bỏ qua lời nhắn. Khi BE thêm cờ vào preview thì ẩn ô ở nhóm mở (đổi ở `InviteJoinActions`).
 *
 * Form RHF + Zod (`joinRequestSchema`): ô trống HỢP LỆ, quá 500 hiện lỗi NGAY DƯỚI ô (`maxLength` đã chặn gõ, còn dán dài thì bị cắt).
 */
export function InviteJoinForm({ accepting, onAccept }: InviteJoinFormProps) {
  const form = useZodForm<JoinRequestFormValues, JoinRequestFormValues>(joinRequestSchema, {
    defaultValues: { requestMessage: '' },
  });
  const requestMessage = useWatch({ control: form.control, name: 'requestMessage' });

  const submit = form.handleSubmit((values) => onAccept(values.requestMessage || undefined));

  return (
    <View className="gap-md">
      <FormInput<JoinRequestFormValues>
        control={form.control}
        hint={`${requestMessage.length}/${JOIN_REQUEST_MESSAGE_MAX}`}
        label="Lời nhắn cho quản trị viên (tuỳ chọn)"
        labelInside
        maxLength={JOIN_REQUEST_MESSAGE_MAX}
        message="Chỉ gửi đi nếu nhóm cần quản trị viên duyệt thành viên mới."
        messageTone="hint"
        multiline
        name="requestMessage"
        placeholder="Giới thiệu ngắn về bạn hoặc lý do muốn tham gia"
      />
      <Button fullWidth label="Tham gia" loading={accepting} onPress={submit} />
    </View>
  );
}
