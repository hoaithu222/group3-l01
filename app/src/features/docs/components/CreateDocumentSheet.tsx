import { View, Text } from 'react-native';

import { useIdempotencyKey, shouldRotateIdempotencyKey } from '@/shared/hooks/useIdempotencyKey';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { Radio, RadioGroup } from '@/shared/ui/radio';
import { Section } from '@/shared/ui/section';
import { showToast } from '@/shared/utils/toast.utils';

import type { DocumentVisibility } from '../api/docs.types';
import { DOCS_LIMITS, VISIBILITY_HINT, VISIBILITY_LABEL } from '../constants/docs.constants';
import { useCreateDocument } from '../queries/docs.mutations';
import { createDocumentSchema, type CreateDocumentValues } from '../schemas/docs.schemas';
import { docsErrorMessage } from '../utils/docs-errors';

export interface CreateDocumentSheetProps {
  visible: boolean;
  wsId: string;
  onClose: () => void;
  /** Tạo xong — nơi gọi mở thẳng tài liệu mới. */
  onCreated: (docId: string) => void;
}

/**
 * Tạo tài liệu (app.md §3): tiêu đề + ai xem được ("Mọi người trong nhóm" mặc định / "Chỉ người được mời"). Lỗi server (`DOC_001` đủ số tài
 * liệu, 404 khách/nhóm lưu trữ…) hiện NGAY TRONG tấm — người dùng còn đang điền, toast tự tắt sau 4 giây. `Idempotency-Key` gắn với nội dung
 * form: bấm hai lần / thử lại sau mất mạng chỉ tạo MỘT tài liệu; sau khi BE đã chốt câu trả lời (thành công hay lỗi 4xx) thì đổi khoá.
 */
export function CreateDocumentSheet({
  onClose,
  onCreated,
  visible,
  wsId,
}: CreateDocumentSheetProps) {
  const create = useCreateDocument(wsId);
  const form = useZodForm<CreateDocumentValues, CreateDocumentValues>(createDocumentSchema, {
    defaultValues: { title: '', visibility: 'WORKSPACE' },
  });
  const values = form.watch();
  const idempotency = useIdempotencyKey(
    'doc-create',
    `${values.title.trim()}|${values.visibility}`,
  );

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
        onSuccess: (doc) => {
          idempotency.rotate();
          showToast('success', 'Đã tạo tài liệu');
          form.reset();
          close();
          onCreated(doc.id);
        },
      },
    ),
  );

  return (
    <BottomSheet
      // Lỗi máy chủ ghim dưới tiêu đề (khe `alert`) — cuối vùng cuộn thì bàn phím của ô tiêu đề che mất.
      alert={
        create.error ? (
          <Alert description={docsErrorMessage(create.error)} tone="error" />
        ) : undefined
      }
      footer={<Button fullWidth label="Tạo tài liệu" loading={create.isPending} onPress={submit} />}
      scrollable
      title="Tạo tài liệu"
      visible={visible}
      onClose={close}
    >
      {/* ⛔ Không `py-*`: thân tấm và vùng `footer` đã tự cách nhau — đệm thêm là nút tụt xa trường cuối. */}
      <View className="gap-md">
        <FormInput<CreateDocumentValues>
          control={form.control}
          label="Tiêu đề"
          maxLength={DOCS_LIMITS.titleMax}
          name="title"
          placeholder="Ví dụ: Báo cáo tuần 3"
          required
          returnKeyType="done"
        />
        {/* `Section tone="default"` = đúng kiểu chữ nhãn của ô "Tiêu đề" ngay trên (16 semibold) — nhãn cũ nhỏ hơn một bậc. */}
        <Section title="Ai xem được" tone="default">
          <RadioGroup
            accessibilityLabel="Ai xem được tài liệu"
            value={values.visibility}
            onChange={(next) => form.setValue('visibility', next as DocumentVisibility)}
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
