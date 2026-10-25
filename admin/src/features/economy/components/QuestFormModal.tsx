import { memo } from 'react';

import {
  FormModal,
  NumberField,
  SelectField,
  TextareaField,
  TextField,
  ToggleField,
  useZodForm,
} from '@/shared/ui';

import { COIN_LIMITS, COIN_QUEST_METRIC_OPTIONS } from '../constants/economy.constants';
import { questFormSchema, type QuestFormValues } from '../schemas/quest.schema';
import { useCreateQuest, useUpdateQuest } from '../service/economy.mutations';
import type { AdminCoinQuest } from '../types/economy-catalog.types';
import { isVersionConflict } from '../utils/economy-errors';
import { applyServerErrors } from '../utils/form-errors.utils';
import {
  emptyQuestValues,
  hasQuestChanges,
  questToValues,
  toCreateQuestPayload,
  toUpdateQuestPayload,
} from '../utils/quest-form.utils';

export interface QuestFormModalProps {
  /** `null` = tạo mới; có giá trị = sửa (mã khoá). */
  quest: AdminCoinQuest | null;
  onClose: () => void;
}

/**
 * Form tạo/sửa nhiệm vụ ngày (admin.md p7-02 §2.1). Nơi dùng CHỈ dựng modal khi đang mở (mount mới mỗi lần mở). Chỉ số đếm chọn từ danh sách cố định của BE
 * (đếm từ XP thật nên thừa hưởng chống farm của XP). Sửa chỉ gửi trường ĐÃ ĐỔI kèm `expectedVersion`; `RES_003` → đóng modal, danh sách tự tải lại;
 * trùng mã → lỗi gắn vào ô mã. Lý do (10–500) bắt buộc, vào nhật ký.
 */
const QuestFormModal = memo(function QuestFormModal({ quest, onClose }: QuestFormModalProps) {
  const form = useZodForm<QuestFormValues>(questFormSchema, {
    defaultValues: quest ? questToValues(quest) : emptyQuestValues(),
  });
  const create = useCreateQuest();
  const update = useUpdateQuest();
  const unchanged = !!quest && !hasQuestChanges(quest, form.watch());

  const handleConfirm = async (data?: QuestFormValues) => {
    if (!data) return;
    try {
      if (quest) await update.mutateAsync(toUpdateQuestPayload(quest, data));
      else await create.mutateAsync(toCreateQuestPayload(data));
    } catch (err) {
      if (isVersionConflict(err)) return;
      applyServerErrors(
        form,
        err,
        {
          code: 'code',
          title: 'title',
          description: 'description',
          metric: 'metric',
          target: 'target',
          coins: 'coins',
          order: 'order',
          reason: 'reason',
        },
        quest ? undefined : 'code',
      );
      throw err;
    }
  };

  return (
    <FormModal<QuestFormValues>
      confirmDisabled={unchanged}
      confirmLabel={quest ? 'Lưu thay đổi' : 'Tạo nhiệm vụ'}
      form={form}
      open
      scrollable
      size="sm"
      title={quest ? 'Sửa nhiệm vụ ngày' : 'Tạo nhiệm vụ ngày'}
      onConfirm={handleConfirm}
      onOpenChange={(open) => !open && onClose()}
    >
      <TextField
        description={
          quest ? 'Mã không đổi được sau khi tạo.' : 'Chữ thường, số, dấu gạch ngang (2–40 ký tự).'
        }
        disabled={!!quest}
        label="Mã"
        name="code"
        required
      />
      <TextField label="Tiêu đề" maxLength={COIN_LIMITS.questTitleMax} name="title" required />
      <TextareaField
        label="Mô tả"
        maxLength={COIN_LIMITS.questDescriptionMax}
        name="description"
        required
        rows={2}
        showCount
      />
      <SelectField
        description="Đếm từ XP thật của người dùng; đổi chỉ tác dụng từ ngày sau cho tiến độ chưa nhận."
        label="Đếm theo"
        name="metric"
        options={COIN_QUEST_METRIC_OPTIONS}
        required
      />
      <NumberField
        label="Mục tiêu"
        max={COIN_LIMITS.questTargetMax}
        min={1}
        name="target"
        required
      />
      <NumberField
        label="Thưởng (xu)"
        max={COIN_LIMITS.questCoinsMax}
        min={1}
        name="coins"
        required
      />
      <NumberField
        label="Thứ tự hiển thị"
        max={COIN_LIMITS.questOrderMax}
        min={0}
        name="order"
        required
      />
      <ToggleField label="Đang bật" name="isActive" />
      <TextareaField
        label="Lý do"
        maxLength={500}
        name="reason"
        placeholder="Ghi rõ lý do — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
});

export default QuestFormModal;
