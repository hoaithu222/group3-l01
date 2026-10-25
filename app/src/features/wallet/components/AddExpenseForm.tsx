import { router } from 'expo-router';
import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { WalletMember } from '../api';
import { useExpenseForm } from '../hooks/useExpenseForm';
import { useIdempotencyKey } from '../hooks/useIdempotencyKey';
import { useIsOffline } from '../hooks/useIsOffline';
import { useReceiptUpload } from '../hooks/useReceiptUpload';
import { useCreateExpense } from '../queries/expense.mutations';
import { buildCreatePayload } from '../utils/expense-payload';
import { invalidUserIdsOf, isDefinitiveRejection } from '../utils/wallet-errors';
import { expenseHref } from '../utils/wallet-routes';
import { ExpenseFormFields } from './ExpenseFormFields';
import { ExpenseSaveBar } from './ExpenseSaveBar';

export interface AddExpenseFormProps {
  meId: string | undefined;
  members: readonly WalletMember[];
  wsId: string;
}

/**
 * Form THÊM khoản chi. Tách khỏi `AddExpenseScreen` vì `useExpenseForm` chỉ đọc
 * `defaultValues` MỘT lần — component này chỉ được mount khi danh sách thành viên ĐÃ tải.
 *
 * Nháp giữ trong state màn, KHÔNG persist (app.md §5: dữ liệu tài chính). Thoát màn là mất nháp
 * — chấp nhận, đổi lại không có số tiền/mô tả nằm lại trên đĩa.
 */
export function AddExpenseForm({ meId, members, wsId }: AddExpenseFormProps) {
  const { eligible, form, preview } = useExpenseForm({ meId, members });
  const [formKey] = useState(() => `wallet-expense-${Date.now().toString(36)}`);
  const receipt = useReceiptUpload(formKey);
  const create = useCreateExpense(wsId);
  const offline = useIsOffline();
  const [invalidIds, setInvalidIds] = useState<string[]>([]);

  const watched = useWatch({ control: form.control });
  const signature = JSON.stringify([
    watched.amount,
    watched.description,
    watched.category,
    watched.paidBy,
    watched.occurredAt ? new Date(watched.occurredAt).toDateString() : '',
    watched.split,
    receipt.assetId,
  ]);
  const idempotency = useIdempotencyKey('wallet-expense', signature);

  const submit = form.handleSubmit((values) => {
    create.mutate(
      { idempotencyKey: idempotency.key, payload: buildCreatePayload(values, receipt.assetId) },
      {
        onError: (error) => {
          setInvalidIds(invalidUserIdsOf(error));
          // BE lưu cả phản hồi 4xx theo khoá — bấm lại phải là lượt MỚI (xem `useIdempotencyKey`).
          if (isDefinitiveRejection(error)) idempotency.rotate();
        },
        onSuccess: (expense) => {
          hapticSuccess();
          showToast('success', 'Đã ghi khoản chi.');
          router.replace(expenseHref(wsId, expense.id));
        },
      },
    );
  });

  const descriptionFilled = (watched.description ?? '').trim().length > 0;
  const canSave = preview.valid && descriptionFilled && !receipt.pending;

  return (
    <Screen
      footer={
        <ExpenseSaveBar
          busy={create.isPending}
          canSave={canSave}
          offline={offline}
          onSave={submit}
        />
      }
      header={<AppBar title="Thêm khoản chi" onBack={router.back} />}
      keyboardAware
    >
      <View className="gap-lg py-xs">
        {create.error ? <Alert description={toErrorMessage(create.error)} tone="error" /> : null}
        {receipt.pending ? (
          <Alert description="Đang tải ảnh hoá đơn — đợi ảnh xong rồi mới lưu được." tone="info" />
        ) : null}

        <ExpenseFormFields
          disabled={create.isPending}
          form={form}
          invalidUserIds={invalidIds}
          members={eligible}
          mode="create"
          preview={preview}
          receipt={receipt}
        />
      </View>
    </Screen>
  );
}
