import { memo, useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { BoxPanel, Button, Callout, ConfirmWithReasonModal, Form, MultiSelectField, NumberField, Text, TextareaField, useZodForm } from '@/shared/ui';
import { useDisclosure } from '@/shared/hooks';

import { CODE_LANGUAGE_OPTIONS, PLAGIARISM_LIMITS, plagiarismConfigFormSchema, toFormValues, toPayload, type PlagiarismConfigFormValues } from '../schemas/plagiarism-config.schema';
import { useUpdatePlagiarismConfig } from '../service/plagiarism.queries';
import type { PlagiarismConfig } from '../service/plagiarism.types';

export interface PlagiarismConfigFormProps {
  canEdit: boolean;
  config: PlagiarismConfig;
}

const SAVE_IMPACT =
  'Áp dụng cho lượt quét TẠO SAU khi lưu — lượt cũ giữ nguyên cấu hình lúc quét (đã lưu trong ảnh chụp của từng lượt). ' +
  'Cụm câu mẫu mới cần lập chỉ mục lại (nút bên dưới) mới có hiệu lực với các tệp đã lập chỉ mục từ trước.';

/**
 * Form cấu hình quét trùng lặp (admin.md §2.2): ngưỡng Trung bình/Cao, độ dài đoạn tối thiểu, tỉ lệ câu chữ phổ biến,
 * số lượt quét/ngày, ngôn ngữ mã nguồn, cụm câu mẫu loại trừ. Lưu → hộp thoại lý do → `PUT /admin/plagiarism/config`
 * với `expectedVersion`; 409 `RES_003` → interceptor toast lỗi, modal giữ mở (dữ liệu form không mất).
 */
const PlagiarismConfigForm = memo(function PlagiarismConfigForm({ canEdit, config }: PlagiarismConfigFormProps) {
  const saveModal = useDisclosure();
  const defaultValues = useMemo(() => toFormValues(config), [config]);
  const form = useZodForm<PlagiarismConfigFormValues>(plagiarismConfigFormSchema, {
    defaultValues,
    values: defaultValues,
    resetOptions: { keepDirtyValues: true },
  });
  const values = useWatch({ control: form.control }) as PlagiarismConfigFormValues | undefined;
  const update = useUpdatePlagiarismConfig();

  return (
    <BoxPanel
      border="hairline"
      headerRight={
        canEdit ? (
          <div className="flex items-center gap-2">
            <Button
              disabled={!form.formState.isDirty}
              size="sm"
              variant="ghost"
              onClick={() => form.reset(defaultValues)}
            >
              Bỏ thay đổi
            </Button>
            <Button
              disabled={!form.formState.isDirty}
              size="sm"
              onClick={form.handleSubmit(() => saveModal.open())}
            >
              Lưu cấu hình
            </Button>
          </div>
        ) : undefined
      }
      title="Cấu hình"
    >
      <div className="flex flex-col gap-3 p-3">
        <Form form={form} readOnly={!canEdit} onSubmit={() => undefined}>
          <div className="grid grid-cols-1 gap-x-4 gap-y-3 md:grid-cols-2">
            <NumberField description="1-99, phải nhỏ hơn ngưỡng Cao" label="Ngưỡng Trung bình (%)" max={99} min={1} name="thresholdMedium" />
            <NumberField description="2-100" label="Ngưỡng Cao (%)" max={100} min={2} name="thresholdHigh" />
            <NumberField
              label="Độ dài đoạn trùng tối thiểu (token)"
              max={PLAGIARISM_LIMITS.minSectionTokensMax}
              min={PLAGIARISM_LIMITS.minSectionTokensMin}
              name="minSectionTokens"
            />
            <NumberField
              description="Hash xuất hiện ở ≥ tỉ lệ này số tài liệu bị coi là câu chữ mẫu, loại khỏi điểm"
              label="Tỉ lệ tài liệu để coi là câu chữ phổ biến (%)"
              max={100}
              min={5}
              name="commonDocFrequencyPercent"
            />
            <NumberField
              description={`Trần hệ thống: ${PLAGIARISM_LIMITS.scansPerWorkspacePerDayMax}/ngày`}
              label="Số lượt quét tối đa / nhóm / ngày"
              max={PLAGIARISM_LIMITS.scansPerWorkspacePerDayMax}
              min={1}
              name="scansPerWorkspacePerDay"
            />
            <MultiSelectField label="Ngôn ngữ mã nguồn được quét" name="codeLanguages" options={CODE_LANGUAGE_OPTIONS} selectAll />
          </div>
          <TextareaField
            description={`Mỗi dòng một cụm, ${PLAGIARISM_LIMITS.boilerplatePhraseMin}-${PLAGIARISM_LIMITS.boilerplatePhraseMax} ký tự, tối đa ${PLAGIARISM_LIMITS.boilerplatePhrasesMax} dòng. Phần trùng với các cụm này không tính vào điểm.`}
            label="Cụm câu mẫu loại trừ (mỗi dòng một cụm)"
            name="boilerplatePhrasesText"
            rows={6}
          />
        </Form>
        {config.updatedAt && (
          <Text size="tiny" skin="muted">
            Phiên bản {config.version} · sửa lần cuối {new Date(config.updatedAt).toLocaleString('vi-VN')}
          </Text>
        )}
        <Callout description={SAVE_IMPACT} intent="info" variant="ghost" />
      </div>

      <ConfirmWithReasonModal
        confirmLabel="Lưu cấu hình"
        impact={SAVE_IMPACT}
        open={saveModal.isOpen}
        title="Lưu cấu hình quét trùng lặp"
        onConfirm={async (reason) => {
          if (!values) return;
          await update.mutateAsync(toPayload(values, config.version, reason));
          saveModal.close();
        }}
        onOpenChange={(open) => (open ? saveModal.open() : saveModal.close())}
      />
    </BoxPanel>
  );
});

export default PlagiarismConfigForm;
