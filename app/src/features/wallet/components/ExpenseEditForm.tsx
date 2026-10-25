import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { ExpenseDetailView, ExpenseCategory, WalletMember } from '../api';
import { draftFromParticipants } from '../domain/split-draft';
import { useExpenseForm } from '../hooks/useExpenseForm';
import { useIsOffline } from '../hooks/useIsOffline';
import { useReceiptUpload } from '../hooks/useReceiptUpload';
import { useAdjustExpense, useUpdateExpense } from '../queries/expense.mutations';
import { buildAdjustPayload, buildUpdatePayload } from '../utils/expense-payload';
import { invalidUserIdsOf, isExpenseLocked, isVersionConflict } from '../utils/wallet-errors';
import { ExpenseFormFields } from './ExpenseFormFields';
import { ExpenseLockedNotice } from './ExpenseLockedNotice';
import { ExpenseSaveBar } from './ExpenseSaveBar';

export interface ExpenseEditFormProps {
  expense: ExpenseDetailView;
  members: readonly WalletMember[];
  meId: string | undefined;
  /** `edit` = PATCH khoản gốc · `adjust` = POST khoản điều chỉnh (khi đã có người thanh toán). */
  mode: 'adjust' | 'edit';
  wsId: string;
  onAdjustInstead: () => void;
  onCancel: () => void;
  /** Lưu xong: `edit` → quay về xem; `adjust` → mở khoản điều chỉnh vừa tạo. */
  onDone: (saved: ExpenseDetailView) => void;
  /** Xung đột phiên bản: tải lại bản mới nhất từ server rồi sửa lại trên số đúng. */
  onReload: () => void;
}

/**
 * Form SỬA và ĐIỀU CHỈNH khoản chi. Adjust ghi "bản khai ĐÚNG mới của cả khoản" — số tiền
 * điền sẵn là số HIỆU LỰC hiện tại (gốc + các điều chỉnh trước), cách chia lấy từ khoản gốc; người
 * dùng sửa rồi BE tự tính chênh lệch. ⚠️ Chưa đối chiếu BE về cách hợp nhất điều chỉnh nhiều lần.
 */
export function ExpenseEditForm({
  expense,
  meId,
  members,
  mode,
  onAdjustInstead,
  onCancel,
  onDone,
  onReload,
  wsId,
}: ExpenseEditFormProps) {
  const effectiveAmount =
    expense.amount + expense.adjustments.reduce((sum, item) => sum + item.amount, 0);
  const { eligible, form, preview } = useExpenseForm({
    initial: {
      amount: mode === 'adjust' ? effectiveAmount : expense.amount,
      category: expense.category as ExpenseCategory,
      description: expense.description,
      occurredAt: new Date(expense.occurredAt),
      paidBy: expense.paidBy,
      split: draftFromParticipants(expense.splitType, expense.participants),
    },
    meId,
    members,
  });
  const [formKey] = useState(() => `wallet-expense-edit-${Date.now().toString(36)}`);
  const receipt = useReceiptUpload(formKey);
  const update = useUpdateExpense(wsId, expense.id);
  const adjust = useAdjustExpense(wsId, expense.id);
  const offline = useIsOffline();
  const isAdjust = mode === 'adjust';
  const mutation = isAdjust ? adjust : update;

  const watched = useWatch({ control: form.control });
  const canSave =
    preview.valid && (watched.description ?? '').trim().length > 0 && !receipt.pending;

  const submit = form.handleSubmit((values) => {
    const done = (saved: ExpenseDetailView) => {
      hapticSuccess();
      showToast('success', isAdjust ? 'Đã tạo khoản điều chỉnh.' : 'Đã lưu khoản chi.');
      onDone(saved);
    };
    if (isAdjust) adjust.mutate(buildAdjustPayload(values), { onSuccess: done });
    else update.mutate(buildUpdatePayload(values, expense, receipt.assetId), { onSuccess: done });
  });

  const error = mutation.error;

  return (
    <Screen
      footer={
        <ExpenseSaveBar
          busy={mutation.isPending}
          canSave={canSave}
          label={isAdjust ? 'Tạo khoản điều chỉnh' : 'Lưu thay đổi'}
          offline={offline}
          onSave={submit}
        />
      }
      header={
        <AppBar title={isAdjust ? 'Điều chỉnh khoản chi' : 'Sửa khoản chi'} onBack={onCancel} />
      }
      keyboardAware
    >
      <View className="gap-lg py-xs">
        {isExpenseLocked(error) ? <ExpenseLockedNotice onAdjust={onAdjustInstead} /> : null}
        {isVersionConflict(error) ? (
          <Alert
            actions={<Button label="Tải lại" size="sm" onPress={onReload} />}
            description="Khoản chi vừa được người khác thay đổi. Tải lại để sửa trên số mới nhất."
            tone="warning"
          />
        ) : null}
        {error && !isExpenseLocked(error) && !isVersionConflict(error) ? (
          <Alert description={toErrorMessage(error)} tone="error" />
        ) : null}

        <ExpenseFormFields
          disabled={mutation.isPending}
          form={form}
          invalidUserIds={invalidUserIdsOf(error)}
          members={eligible}
          mode={mode}
          preview={preview}
          receipt={receipt}
        />
      </View>
    </Screen>
  );
}
