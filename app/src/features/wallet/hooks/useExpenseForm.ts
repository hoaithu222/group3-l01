import { useMemo } from 'react';
import { useWatch } from 'react-hook-form';

import { useZodForm } from '@/shared/form/useZodForm';

import type { WalletMember } from '../api';
import { createSplitDraft, draftToParticipants } from '../domain/split-draft';
import { previewSplit } from '../domain/split-preview';
import {
  expenseFormSchema,
  type ExpenseFormInput,
  type ExpenseFormValues,
} from '../schemas/wallet-forms.schemas';

export interface UseExpenseFormArgs {
  /** Ghi đè giá trị mặc định (màn Sửa/Điều chỉnh dựng từ khoản chi có sẵn). */
  initial?: Partial<ExpenseFormInput>;
  meId: string | undefined;
  members: readonly WalletMember[];
}

/**
 * Form khoản chi = RHF + Zod (`useZodForm`) + BẢN XEM TRƯỚC chia tính lại mỗi lần đổi.
 *
 * `preview` là nguồn DUY NHẤT cho cả dòng tóm tắt của `SplitEditor` lẫn việc khoá nút
 * Lưu — hai nơi đọc cùng một giá trị nên không thể có lúc nút bật mà dòng đang báo thiếu.
 * GUEST không được tham gia khoản chi (`WALLET_001`) nên bị loại khỏi danh sách chọn.
 *
 * ⚠️ `defaultValues` chỉ đọc MỘT lần lúc dựng form — màn phải chờ danh sách thành viên tải xong
 * rồi mới mount component gọi hook này (nếu không, "tất cả được chọn sẵn" chọn danh sách rỗng).
 */
export function useExpenseForm({ initial, meId, members }: UseExpenseFormArgs) {
  const eligible = useMemo(() => members.filter((member) => member.role !== 'GUEST'), [members]);

  const form = useZodForm<ExpenseFormInput, ExpenseFormValues>(expenseFormSchema, {
    defaultValues: {
      amount: null,
      category: 'FOOD',
      description: '',
      occurredAt: new Date(),
      paidBy: meId ?? eligible[0]?.userId ?? '',
      split: createSplitDraft(eligible.map((member) => member.userId)),
      ...initial,
    },
  });

  const watched = useWatch({ control: form.control });
  const preview = useMemo(
    () =>
      previewSplit({
        amount: watched.amount ?? 0,
        paidBy: watched.paidBy ?? '',
        participants: watched.split
          ? draftToParticipants(watched.split as NonNullable<ExpenseFormInput['split']>)
          : [],
        splitType: watched.split?.splitType ?? 'EQUAL',
      }),
    [watched.amount, watched.paidBy, watched.split],
  );

  return { eligible, form, preview };
}
