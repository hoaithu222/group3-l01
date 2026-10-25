import { useEffect, useMemo } from 'react';

import { FormModal, NumberField, TextareaField, useZodForm } from '@/shared/ui';

import {
  XP_ADJUST_MAX_ABS,
  xpAdjustSchema,
  type XpAdjustFormValues,
} from '../schemas/xp-adjust.schema';
import { useAdjustXp } from '../service/gamification.queries';

export interface XpAdjustModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
  userName: string;
}

const EMPTY: Partial<XpAdjustFormValues> = { delta: undefined, reason: '' };

/**
 * Điều chỉnh XP thủ công — `POST /admin/users/:id/xp-adjust` (`gamification:update`, lý do
 * 10–500 vào nhật ký). `Idempotency-Key` sinh MỘT lần cho mỗi lần mở modal: bấm lại sau lỗi mạng
 * không cộng trùng; mở lại modal = một lần điều chỉnh mới.
 */
export default function XpAdjustModal({ open, onOpenChange, userId, userName }: XpAdjustModalProps) {
  const adjustXp = useAdjustXp();
  const form = useZodForm<XpAdjustFormValues>(xpAdjustSchema, { defaultValues: EMPTY });
  const idempotencyKey = useMemo(
    () => (open ? crypto.randomUUID() : ''),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- khoá mới theo từng lần mở / từng người
    [open, userId],
  );

  useEffect(() => {
    if (open) form.reset(EMPTY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, userId]);

  return (
    <FormModal<XpAdjustFormValues>
      confirmLabel="Điều chỉnh XP"
      form={form}
      open={open}
      size="sm"
      title={`Điều chỉnh XP — ${userName}`}
      onConfirm={async (data) => {
        if (!data) return;
        await adjustXp.mutateAsync({
          userId,
          delta: data.delta,
          reason: data.reason,
          idempotencyKey,
        });
      }}
      onOpenChange={onOpenChange}
    >
      <NumberField
        description={`Số dương để cộng, số âm để trừ (tối đa ±${XP_ADJUST_MAX_ABS}). Cấp độ tính lại theo XP mới.`}
        label="XP điều chỉnh"
        max={XP_ADJUST_MAX_ABS}
        min={-XP_ADJUST_MAX_ABS}
        name="delta"
        required
      />
      <TextareaField
        label="Lý do"
        maxLength={500}
        name="reason"
        placeholder="Ghi rõ lý do điều chỉnh — sẽ lưu vào nhật ký quản trị"
        required
        rows={3}
        showCount
      />
    </FormModal>
  );
}
