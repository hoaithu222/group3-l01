import type { AxiosError } from 'axios';
import { memo, useCallback } from 'react';

import { useAuthStore } from '@/app/store';
import { extractErrorCode, getMessageByCode } from '@/core/api/error.handler';
import {
  AsyncSelectField,
  Callout,
  Form,
  FormActions,
  SelectField,
  Text,
  TextareaField,
  useZodForm,
} from '@/shared/ui';

import {
  PUSH_TEST_FIXED_CONTENT,
  PUSH_TEST_INLINE_ERRORS,
  PUSH_TEST_TYPE_OPTIONS,
} from '../constants/notifications.constants';
import { pushTestSchema, type PushTestFormValues } from '../schemas/notifications-config.schema';
import { useSendPushTest } from '../service/notifications-config.queries';
import { notificationsConfigService } from '../service/notifications-config.service';
import type { PushTestResult } from '../types/notifications-config.types';
import { withSelfOption } from '../utils/recipient-options';

/** Gợi ý theo mã lỗi — câu chính lấy từ bảng mã lỗi chung, câu này chỉ chỉ đường. */
const PUSH_ERROR_HINTS: Record<string, string> = {
  PUSH_001: 'Xem “Nhà cung cấp thông báo đẩy” ở trên: cần khoá FCM và cờ “Thông báo đẩy” đang bật.',
  PUSH_002: 'Người nhận cần đăng nhập trên ứng dụng di động và cho phép thông báo.',
};

function summarize(result: PushTestResult): {
  text: string;
  intent: 'success' | 'warning' | 'error';
  title: string;
} {
  const { fcm, voip } = result;
  const text = `FCM: gửi ${fcm.sent} / lỗi ${fcm.failed} · VoIP: gửi ${voip.sent} / lỗi ${voip.failed}`;
  const sent = fcm.sent + voip.sent;
  const failed = fcm.failed + voip.failed;
  if (sent === 0) return { text, intent: 'error', title: 'Không gửi được tới thiết bị nào' };
  if (failed > 0) return { text, intent: 'warning', title: 'Đã gửi push thử, có thiết bị bị lỗi' };
  return { text, intent: 'success', title: 'Đã gửi push thử' };
}

/**
 * Form "Gửi push thử" (admin.md p0-06 §2.2). Chỉ render khi người dùng đã qua cổng
 * `PushTestPanel` (vai `admin` + `system-config:update`).
 *
 * KHÔNG có ô nội dung: BE cố định nội dung push thử ("Đây là thông báo thử từ
 * quản trị") để công cụ không bị lạm dụng gửi tin tuỳ ý. Người nhận để trống =
 * chính người thao tác. Kết quả/lỗi đọc thẳng từ trạng thái mutation nên tự xoá
 * khi gửi lần mới.
 */
const PushTestForm = memo(function PushTestForm() {
  const me = useAuthStore((s) => s.user);
  const sendTest = useSendPushTest();
  const form = useZodForm<PushTestFormValues>(pushTestSchema, {
    defaultValues: { userId: '', type: 'message.new', reason: '' },
  });

  // `AsyncSelectField` giữ bản `fetchOptions` của lần render đầu → đọc người thao
  // tác từ store lúc gọi thay vì đóng gói vào closure.
  const fetchRecipients = useCallback(async (search: string) => {
    const found = await notificationsConfigService.searchUsers(search);
    return withSelfOption(found, useAuthStore.getState().user, search);
  }, []);

  const handleSubmit = (values: PushTestFormValues) => {
    if (!me) return;
    sendTest.mutate(
      { userId: values.userId || me.id, type: values.type, reason: values.reason },
      {
        // Mỗi lần thử cần lý do riêng (audit) — xoá lý do, giữ người nhận/loại để thử lại nhanh.
        onSuccess: () => form.resetField('reason', { defaultValue: '' }),
      },
    );
  };

  const errorCode = sendTest.error ? extractErrorCode(sendTest.error as AxiosError) : null;
  const inlineError = errorCode && PUSH_TEST_INLINE_ERRORS.has(errorCode) ? errorCode : null;
  const summary = sendTest.data ? summarize(sendTest.data.data) : null;

  return (
    <Form className="gap-3" form={form} onSubmit={handleSubmit}>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <AsyncSelectField
          description="Để trống để gửi tới chính bạn."
          fetchOptions={fetchRecipients}
          label="Người nhận"
          name="userId"
          placeholder={me ? `Chính bạn · ${me.name}` : 'Chính bạn'}
        />
        <SelectField label="Loại thông báo" name="type" options={PUSH_TEST_TYPE_OPTIONS} required />
      </div>

      <TextareaField
        description="Ghi vào nhật ký quản trị cùng người nhận và loại thông báo."
        label="Lý do"
        maxLength={500}
        name="reason"
        placeholder="Vì sao cần gửi push thử (tối thiểu 10 ký tự)"
        required
        rows={3}
        showCount
      />

      <Text size="tiny" skin="muted">
        Nội dung push thử được cố định là “{PUSH_TEST_FIXED_CONTENT}” và không thể tuỳ chỉnh.
      </Text>

      {summary && (
        <Callout description={summary.text} intent={summary.intent} title={summary.title} />
      )}
      {inlineError && (
        <Callout
          description={PUSH_ERROR_HINTS[inlineError]}
          intent={inlineError === 'PUSH_001' ? 'error' : 'warning'}
          title={getMessageByCode(inlineError)}
        />
      )}

      <FormActions className="pt-0" isSubmitting={sendTest.isPending} submitLabel="Gửi thử" />
    </Form>
  );
});

export default PushTestForm;
