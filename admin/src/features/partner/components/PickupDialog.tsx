import type { AxiosError } from 'axios';
import { memo, useState } from 'react';

import { extractErrorMessage } from '@/core/api/error.handler';
import { Callout, CheckboxField, FormModal, MaskedField, Text, useZodForm } from '@/shared/ui';
import { formatCurrency } from '@/shared/utils/format';
import { showToast } from '@/shared/utils/toast.utils';

import { PIN_LENGTH } from '../constants/partner.constants';
import { useCountdown } from '../hooks/useCountdown';
import { pickupFormSchema, type PickupFormValues } from '../schemas/pickup.schema';
import { usePartnerPickup } from '../service/partner.queries';
import type { PartnerOrder } from '../types/partner.types';
import {
  classifyPickupError,
  formatCountdown,
  type PickupFailure,
} from '../utils/pickup-error.utils';

export interface PickupDialogProps {
  order: PartnerOrder;
  onClose: () => void;
}

/**
 * Hộp thoại GIAO HÀNG bằng PIN (admin.md p6-05 §2.4): nhập PIN 6 số khách đưa + tick "Đã thu tiền" (mặc định tick khi đơn chưa thu
 * — BE cũng mặc định `markPaid: true`) → `POST …/pickup`. Lỗi hiện NGAY TRONG hộp thoại, không toast:
 *  - `O2O_007` sai PIN → "Còn N lần thử" (`details.attemptsLeft`), xoá ô PIN để nhập lại;
 *  - `O2O_008` (423) / 429 khoá → ĐẾM NGƯỢC `retryAfterSeconds`, khoá nút xác nhận tới hết giờ;
 *  - `O2O_004` đơn vừa đổi trạng thái → báo và gợi ý xem lại hàng đợi (hàng đợi đã tự làm mới).
 * Nơi gọi chỉ mount khi mở nên form/đếm ngược luôn mới. Quét QR bằng camera: chưa làm (xem báo cáo p6-05).
 */
const PickupDialog = memo(function PickupDialog({ order, onClose }: PickupDialogProps) {
  const form = useZodForm<PickupFormValues>(pickupFormSchema, {
    defaultValues: { pin: '', markPaid: order.payment.status !== 'PAID' },
  });
  const pickup = usePartnerPickup();
  const [failure, setFailure] = useState<PickupFailure | null>(null);
  const { remaining, start } = useCountdown();
  const locked = remaining > 0;
  const alreadyPaid = order.payment.status === 'PAID';

  const handleConfirm = async (values?: PickupFormValues) => {
    if (!values) return;
    setFailure(null);
    try {
      await pickup.mutateAsync({
        id: order.id,
        pin: values.pin,
        // Đã thu rồi thì KHÔNG gửi lại `markPaid` — BE sẽ ghi đè người/thời điểm thu tiền cũ.
        markPaid: values.markPaid && !alreadyPaid,
      });
    } catch (err) {
      const f = classifyPickupError(err);
      setFailure(f);
      if (f.kind === 'locked') start(f.retryAfterSeconds);
      if (f.kind === 'rate-limited') start(f.retryAfterSeconds ?? 60);
      if (f.kind === 'wrong-pin') form.resetField('pin', { defaultValue: '' });
      if (f.kind === 'other') showToast('error', extractErrorMessage(err as AxiosError));
      throw err; // FormModal giữ hộp thoại mở để nhập lại
    }
  };

  const showLock = locked && (failure?.kind === 'locked' || failure?.kind === 'rate-limited');

  return (
    <FormModal<PickupFormValues>
      confirmDisabled={locked}
      confirmLabel="Xác nhận giao hàng"
      form={form}
      open
      size="sm"
      title={`Giao hàng ${order.code}`}
      onConfirm={handleConfirm}
      onOpenChange={(next) => !next && onClose()}
    >
      <Text size="small" skin="muted">
        Khách {order.customer.name}
        {order.quote ? ` · cần thu ${formatCurrency(order.quote.total)}` : ''}. Hỏi mã PIN 6 số trên
        vé của khách.
      </Text>
      {failure?.kind === 'wrong-pin' ? (
        <Callout
          description={
            failure.attemptsLeft !== null
              ? `Còn ${failure.attemptsLeft} lần thử trước khi bị khoá tạm thời.`
              : 'Kiểm tra lại mã PIN với khách.'
          }
          intent="error"
          title="Mã PIN không đúng"
        />
      ) : null}
      {showLock ? (
        <Callout
          description={`Thử lại sau ${formatCountdown(remaining)}.`}
          intent="error"
          title="Nhập sai quá nhiều lần"
        />
      ) : null}
      {failure?.kind === 'state' ? (
        <Callout
          description="Đơn vừa đổi trạng thái (khách huỷ hoặc hết hạn). Đóng hộp thoại và xem lại hàng đợi."
          intent="warning"
          title="Không giao được đơn này"
        />
      ) : null}
      <MaskedField
        disabled={locked}
        format={'#'.repeat(PIN_LENGTH)}
        label="Mã PIN"
        name="pin"
        placeholder="______"
        required
      />
      {alreadyPaid ? (
        <Text size="small" skin="muted">
          Đơn đã được ghi nhận thu tiền.
        </Text>
      ) : (
        <CheckboxField checkboxLabel="Đã thu tiền tại quầy" name="markPaid" />
      )}
    </FormModal>
  );
});

export default PickupDialog;
