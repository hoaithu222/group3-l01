import { memo } from 'react';

import { Button, Form, TextareaField, useZodForm } from '@/shared/ui';

import { OFFER_LIMITS } from '../constants/portal.constants';
import { offerMessageFormSchema, type OfferMessageFormValues } from '../schemas/offer.schema';
import { useSendMessage } from '../service/offer.queries';
import { makeClientId } from '../utils/client-id';

export interface OfferThreadComposerProps {
  offerId: string;
}

/**
 * Ô soạn tin trong thread lời mời — CHỈ được dựng khi lời mời `threadOpen` (INTERESTED, chưa khoá, doanh nghiệp còn duyệt); còn lại `OfferThread` không render nó (ẩn hẳn chứ không
 * vô hiệu hoá, để không ai hiểu nhầm là lỗi). Chỉ chữ, 1–2000 ký tự. Mỗi tin có `clientMessageId` MỚI (BE idempotent theo `(người gửi, clientMessageId)`); thất bại thì GIỮ nội dung để gửi lại.
 * Nội dung tin KHÔNG bao giờ nằm trong socket — tin mới (của cả hai bên) về qua `offer:message-created` rồi tải lại bằng REST.
 */
const OfferThreadComposer = memo(function OfferThreadComposer({ offerId }: OfferThreadComposerProps) {
  const send = useSendMessage();
  const form = useZodForm<OfferMessageFormValues>(offerMessageFormSchema, {
    defaultValues: { content: '' },
  });

  const handleSubmit = async (values: OfferMessageFormValues) => {
    try {
      await send.mutateAsync({ offerId, content: values.content, clientMessageId: makeClientId() });
      form.reset({ content: '' });
    } catch {
      // Interceptor đã toast (`RECR_008`…); giữ nguyên nội dung đang soạn để gửi lại.
    }
  };

  return (
    <Form form={form} onSubmit={handleSubmit}>
      <TextareaField
        label="Tin nhắn"
        maxLength={OFFER_LIMITS.threadMessageMax}
        name="content"
        placeholder="Nhập tin nhắn gửi ứng viên…"
        rows={3}
        showCount
      />
      <div className="flex justify-end">
        <Button loading={send.isPending} size="sm" type="submit">
          Gửi tin
        </Button>
      </div>
    </Form>
  );
});

export default OfferThreadComposer;
