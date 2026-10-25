import { useQueryClient } from '@tanstack/react-query';
import { router } from 'expo-router';
import { useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { useZodForm } from '@/shared/form/useZodForm';
import { Button } from '@/shared/ui/button';
import { FormInput } from '@/shared/ui/input';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess, hapticTap } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { WALLET_LIMITS } from '../constants/wallet.constants';
import { formatMoney } from '../domain/money';
import { useIdempotencyKey } from '../hooks/useIdempotencyKey';
import { useIsOffline } from '../hooks/useIsOffline';
import { useReceiptUpload } from '../hooks/useReceiptUpload';
import { useCreateSettlement } from '../queries/settlement.mutations';
import { usePaymentInfo } from '../queries/wallet.queries';
import { walletKeys } from '../queries/wallet.keys';
import {
  settleFormSchema,
  type SettleFormInput,
  type SettleFormValues,
} from '../schemas/wallet-forms.schemas';
import { isDefinitiveRejection } from '../utils/wallet-errors';
import { MoneyInput } from './MoneyInput';
import { PayeeInfoSection } from './PayeeInfoSection';
import { ReceiptPicker } from './ReceiptPicker';
import { SettleErrorAlert } from './SettleErrorAlert';
import { SettleMethodField } from './SettleMethodField';
import { SettlePartiesCard, type SettleParty } from './SettlePartiesCard';

export interface SettleFormProps {
  initialAmount: number | null;
  /** Trần theo `maxSettleAmount`; `null` = chưa biết. `0` = không trả được (khoá nút). */
  maxAmount: number | null;
  payeeAvatarUrl?: string | null;
  payeeName: string;
  /** Tôi (người trả) — cho khối "ai → ai" ở đầu màn. */
  payer: SettleParty;
  toId: string;
  wsId: string;
}

/**
 * Form TRẢ NỢ: số tiền (≤ nợ) · phương thức · QR (chuyển khoản) · ảnh chứng từ · ghi chú.
 * "Tôi đã chuyển" chỉ TẠO settlement PENDING — tiền chưa đổi sổ cho tới khi NGƯỜI NHẬN xác nhận.
 * Không optimistic: số dư chỉ đổi theo server.
 */
export function SettleForm({
  initialAmount,
  maxAmount,
  payeeAvatarUrl,
  payeeName,
  payer,
  toId,
  wsId,
}: SettleFormProps) {
  const queryClient = useQueryClient();
  const form = useZodForm<SettleFormInput, SettleFormValues>(settleFormSchema, {
    defaultValues: { amount: initialAmount, method: 'BANK', note: '' },
  });
  const watched = useWatch({ control: form.control });
  const method = watched.method ?? 'BANK';
  const amount = watched.amount ?? null;

  const payee = usePaymentInfo(wsId, toId, method === 'BANK');
  const [formKey] = useState(() => `wallet-proof-${Date.now().toString(36)}`);
  const proof = useReceiptUpload(formKey);
  const create = useCreateSettlement(wsId);
  const offline = useIsOffline();
  const idempotency = useIdempotencyKey(
    'wallet-settle',
    JSON.stringify([toId, amount, method, watched.note, proof.assetId, payee.data?.reference]),
  );

  const overLimit = maxAmount !== null && amount !== null && amount > maxAmount;
  const canSubmit =
    !offline &&
    !proof.pending &&
    amount !== null &&
    amount >= 1 &&
    !overLimit &&
    (maxAmount === null || maxAmount > 0);

  const submit = form.handleSubmit((values) => {
    hapticTap();
    create.mutate(
      {
        idempotencyKey: idempotency.key,
        payload: {
          amount: values.amount,
          method: values.method,
          toId,
          ...(values.note ? { note: values.note } : {}),
          ...(proof.assetId ? { proofAssetId: proof.assetId } : {}),
          ...(values.method === 'BANK' && payee.data ? { reference: payee.data.reference } : {}),
        },
      },
      {
        onError: (error) => {
          if (isDefinitiveRejection(error)) idempotency.rotate();
        },
        onSuccess: () => {
          hapticSuccess();
          showToast('success', `Đã gửi. Chờ ${payeeName} xác nhận.`);
          router.back();
        },
      },
    );
  });

  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button
            disabled={!canSubmit}
            fullWidth
            label={
              offline ? 'Kết nối lại để gửi' : method === 'BANK' ? 'Tôi đã chuyển' : 'Tôi đã trả'
            }
            loading={create.isPending}
            onPress={submit}
          />
        </BottomActionBar>
      }
      header={<AppBar title={`Trả cho ${payeeName}`} onBack={router.back} />}
      keyboardAware
    >
      <View className="gap-lg py-xs">
        <SettlePartiesCard
          amount={amount}
          payee={{ avatarUrl: payeeAvatarUrl, name: payeeName }}
          payer={payer}
        />
        <SettleErrorAlert
          error={create.error}
          onReload={() => void queryClient.invalidateQueries({ queryKey: walletKeys.ws(wsId) })}
        />

        <Controller
          control={form.control}
          name="amount"
          render={({ field, fieldState }) => (
            <MoneyInput
              hint={
                maxAmount !== null ? `Bạn có thể trả tối đa ${formatMoney(maxAmount)}` : undefined
              }
              label="Số tiền"
              max={maxAmount && maxAmount > 0 ? maxAmount : WALLET_LIMITS.expenseMax}
              message={
                fieldState.error?.message ??
                (maxAmount === 0
                  ? `Hiện bạn không nợ ${payeeName} khoản nào có thể trả.`
                  : undefined)
              }
              messageTone="error"
              required
              value={field.value}
              onChange={field.onChange}
            />
          )}
        />

        <Controller
          control={form.control}
          name="method"
          render={({ field }) => (
            <SettleMethodField value={field.value} onChange={field.onChange} />
          )}
        />

        {method === 'BANK' ? (
          <PayeeInfoSection amount={amount} payeeName={payeeName} query={payee} />
        ) : null}

        <ReceiptPicker receipt={proof} title="Ảnh chứng từ" />

        <FormInput<SettleFormInput>
          control={form.control}
          label="Ghi chú (không bắt buộc)"
          maxLength={WALLET_LIMITS.settlementNoteMax}
          name="note"
          placeholder="Ví dụ: Tiền ăn tối thứ Sáu"
        />
      </View>
    </Screen>
  );
}
