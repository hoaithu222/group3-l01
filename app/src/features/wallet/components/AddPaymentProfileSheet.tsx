import { useState } from 'react';
import { Controller } from 'react-hook-form';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { useZodForm } from '@/shared/form/useZodForm';
import { Alert } from '@/shared/ui/alert';
import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';
import { Toggle } from '@/shared/ui/toggle';
import { showToast } from '@/shared/utils/toast.utils';

import { toAccountName } from '../domain/account-name';
import { usePaymentProfileMutations } from '../queries/settlement.mutations';
import {
  paymentProfileFormSchema,
  type PaymentProfileFormValues,
} from '../schemas/wallet-forms.schemas';
import { VN_BANKS } from '../utils/banks';
import { OptionSelect } from './OptionSelect';

export interface AddPaymentProfileSheetProps {
  /** Chưa có tài khoản nào ⇒ tài khoản đầu tiên mặc định là mặc định. */
  firstProfile: boolean;
  visible: boolean;
  onClose: () => void;
}

const OTHER = '__other__';
const BANK_OPTIONS = [
  ...VN_BANKS.map((bank) => ({ label: bank.shortName, value: bank.bin })),
  {
    description: 'Nhập mã BIN 6 số nếu ngân hàng không có trong danh sách',
    label: 'Ngân hàng khác',
    value: OTHER,
  },
];

/**
 * Thêm tài khoản nhận tiền (tối đa 3 — `WALLET_009`). Chọn ngân hàng bằng ô tìm theo tên (UNCONTROLLED,
 * không mất dấu khi gõ Telex); ngân hàng ngoài bảng BIN thì nhập tay mã BIN. Tên chủ TK tự IN HOA + bỏ dấu
 * ngay lúc gõ để người dùng thấy đúng cái sẽ lưu (quy ước NAPAS). Số tài khoản chỉ nhận chữ số.
 */
export function AddPaymentProfileSheet({
  firstProfile,
  onClose,
  visible,
}: AddPaymentProfileSheetProps) {
  const { create } = usePaymentProfileMutations();
  const [manualBin, setManualBin] = useState(false);
  // Ô số tài khoản/BIN là uncontrolled (không nhận `value`) nên `form.reset()` không xoá chữ trên màn hình — dựng lại bằng `key`.
  const [resetKey, setResetKey] = useState(0);
  const form = useZodForm<PaymentProfileFormValues, PaymentProfileFormValues>(
    paymentProfileFormSchema,
    {
      defaultValues: { accountName: '', accountNumber: '', bankBin: '', isDefault: firstProfile },
    },
  );

  const close = () => {
    form.reset();
    create.reset();
    setManualBin(false);
    setResetKey((value) => value + 1);
    onClose();
  };

  const submit = form.handleSubmit((values) => {
    create.mutate(values, {
      onSuccess: () => {
        showToast('success', 'Đã lưu tài khoản nhận tiền.');
        close();
      },
    });
  });

  return (
    <BottomSheet
      // ✅ Lỗi lưu (`WALLET_009` đủ 3 tài khoản…) ở khe `alert`: đứng yên dưới tiêu đề. ❌ Đặt đầu thân CUỘN thì người dùng bấm
      // "Lưu" ở đáy lúc đã cuộn xuống ô tên chủ TK — lỗi hiện ở chỗ đã cuộn khuất, tưởng nút không phản hồi.
      alert={
        create.error ? <Alert description={toErrorMessage(create.error)} tone="error" /> : undefined
      }
      footer={
        <Button fullWidth label="Lưu tài khoản" loading={create.isPending} onPress={submit} />
      }
      scrollable
      title="Thêm tài khoản nhận tiền"
      visible={visible}
      onClose={close}
    >
      <View key={resetKey} className="gap-md pt-xs">
        <Controller
          control={form.control}
          name="bankBin"
          render={({ field, fieldState }) => (
            <View className="gap-md">
              <OptionSelect
                label="Ngân hàng"
                message={manualBin ? undefined : fieldState.error?.message}
                options={BANK_OPTIONS}
                placeholder="Chọn ngân hàng"
                searchable
                searchPlaceholder="Tìm ngân hàng"
                value={manualBin ? OTHER : field.value}
                onChange={(value) => {
                  setManualBin(value === OTHER);
                  field.onChange(value === OTHER ? '' : value);
                }}
              />
              {manualBin ? (
                <Input
                  digitsOnly
                  label="Mã BIN ngân hàng (6 số)"
                  maxLength={6}
                  message={fieldState.error?.message}
                  messageTone="error"
                  placeholder="Ví dụ: 970436"
                  required
                  onChangeText={(text) => field.onChange(text.replace(/\D/g, ''))}
                />
              ) : null}
            </View>
          )}
        />

        <Controller
          control={form.control}
          name="accountNumber"
          render={({ field, fieldState }) => (
            <Input
              digitsOnly
              label="Số tài khoản"
              maxLength={19}
              message={fieldState.error?.message}
              messageTone="error"
              placeholder="Ví dụ: 0123456789"
              required
              onChangeText={(text) => field.onChange(text.replace(/\D/g, ''))}
            />
          )}
        />

        <Controller
          control={form.control}
          name="accountName"
          render={({ field, fieldState }) => (
            <Input
              autoCapitalize="characters"
              hint="Viết HOA không dấu, đúng như trên thẻ/ứng dụng ngân hàng"
              label="Tên chủ tài khoản"
              maxLength={50}
              message={fieldState.error?.message}
              messageTone="error"
              placeholder="Ví dụ: NGUYEN VAN A"
              required
              value={field.value}
              onChangeText={(text) => field.onChange(toAccountName(text))}
            />
          )}
        />

        <Controller
          control={form.control}
          name="isDefault"
          render={({ field }) => (
            <Toggle
              description="Bạn bè sẽ thấy tài khoản này khi trả tiền cho bạn."
              disabled={firstProfile}
              label="Đặt làm mặc định"
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />
      </View>
    </BottomSheet>
  );
}
