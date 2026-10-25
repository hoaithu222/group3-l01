import { memo, useMemo } from 'react';

import { CheckboxField, FormModal, NumberField, TextareaField, useZodForm } from '@/shared/ui';
import { formatNumber } from '@/shared/utils/format';

import { COIN_LIMITS } from '../constants/economy.constants';
import { useIdempotencyKey } from '../hooks';
import {
  ADJUST_DEFAULTS,
  buildAdjustSchema,
  type AdjustFormValues,
} from '../schemas/adjust.schema';
import { useAdjustCoins } from '../service/economy.mutations';
import {
  adjustAmountError,
  serverFieldMessages,
  shouldRotateIdempotencyKey,
} from '../utils/economy-errors';

export interface AdjustCoinsModalProps {
  userId: string;
  /** Tên hiển thị (hoặc "người dùng …abc123") cho tiêu đề và câu xác nhận. */
  userLabel: string;
  /** Số dư đang hiển thị — chặn TRƯỚC khi gửi việc trừ quá số dư. */
  balance: number;
  onClose: () => void;
}

/**
 * Điều chỉnh xu thủ công — `POST /admin/economy/users/:userId/adjust` (`gamification:update`; BE: nguyên ≠ 0, ≤ ±100 000 mỗi lần, 60 lần/giờ/admin, lý do 10–500 vào nhật ký).
 * Nơi dùng CHỈ dựng modal khi đang mở (`{open && <AdjustCoinsModal …/>}`) — mỗi lần mở là một lần mount mới nên form và `Idempotency-Key` luôn sạch.
 * Khoá GIỮ khi thử lại sau lỗi mạng/5xx và ĐỔI sau kết luận 4xx (BE lưu 4xx theo khoá 24 giờ). Lỗi `COIN_001`/`COIN_009`/`VAL_001` gắn thẳng vào ô số xu.
 * Từ 10 000 xu trở lên phải tích ô xác nhận "điều chỉnh lớn".
 */
const AdjustCoinsModal = memo(function AdjustCoinsModal({
  userId,
  userLabel,
  balance,
  onClose,
}: AdjustCoinsModalProps) {
  const schema = useMemo(() => buildAdjustSchema(balance), [balance]);
  const form = useZodForm<AdjustFormValues>(schema, { defaultValues: ADJUST_DEFAULTS });
  const adjust = useAdjustCoins();
  const { key, rotate } = useIdempotencyKey();
  const amount: number | undefined = form.watch('amount');
  // Số lớn cần tích xác nhận; `null` = chưa nhập hoặc chưa tới ngưỡng.
  const largeAmount =
    typeof amount === 'number' && Math.abs(amount) >= COIN_LIMITS.adjustLargeConfirm
      ? amount
      : null;

  const handleConfirm = async (data?: AdjustFormValues) => {
    if (!data) return;
    try {
      await adjust.mutateAsync({
        userId,
        amount: data.amount,
        reason: data.reason,
        idempotencyKey: key,
      });
    } catch (err) {
      if (shouldRotateIdempotencyKey(err)) rotate();
      const amountError = adjustAmountError(err);
      if (amountError) form.setError('amount', { type: 'server', message: amountError });
      const reasonError = serverFieldMessages(err).reason;
      if (reasonError) form.setError('reason', { type: 'server', message: reasonError });
      throw err; // FormModal giữ modal mở để sửa và gửi lại
    }
  };

  return (
    <FormModal<AdjustFormValues>
      confirmLabel="Điều chỉnh xu"
      form={form}
      open
      size="sm"
      title={`Điều chỉnh xu — ${userLabel}`}
      onConfirm={handleConfirm}
      onOpenChange={(open) => !open && onClose()}
    >
      <div className="text-body-14 text-fg-2">Số dư hiện tại: {formatNumber(balance)} xu</div>
      <NumberField
        description={`Số dương để cộng, số âm để trừ (tối đa ±${formatNumber(COIN_LIMITS.adjustMax)} xu mỗi lần, không được làm số dư âm).`}
        label="Số xu điều chỉnh"
        max={COIN_LIMITS.adjustMax}
        min={-COIN_LIMITS.adjustMax}
        name="amount"
        required
      />
      {largeAmount !== null && (
        <CheckboxField
          checkboxLabel={`Tôi xác nhận ${largeAmount > 0 ? 'cộng' : 'trừ'} ${formatNumber(Math.abs(largeAmount))} xu ${largeAmount > 0 ? 'vào' : 'khỏi'} ví của ${userLabel}`}
          name="confirmLarge"
        />
      )}
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
});

export default AdjustCoinsModal;
