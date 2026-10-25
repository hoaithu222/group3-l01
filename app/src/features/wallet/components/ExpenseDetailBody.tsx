import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import { Alert } from '@/shared/ui/alert';

import type { ExpenseDetailView, ExpenseView } from '../api';
import type { MemberDirectory } from '../hooks/useMemberDirectory';
import { expenseActionState } from '../utils/expense-actions';
import { isExpenseLocked } from '../utils/wallet-errors';
import { ExpenseAdjustmentsCard } from './ExpenseAdjustmentsCard';
import { ExpenseLockedNotice } from './ExpenseLockedNotice';
import { ExpenseSharesCard } from './ExpenseSharesCard';
import { ExpenseSummaryCard } from './ExpenseSummaryCard';

export interface ExpenseDetailBodyProps {
  deleteError: unknown;
  directory: MemberDirectory;
  expense: ExpenseDetailView;
  onAdjust: () => void;
  onOpenExpense: (expense: ExpenseView) => void;
}

/**
 * Chế độ XEM của chi tiết khoản chi. Khoá sửa/xoá khi đã có ai trả (phép chiếu `paidAmount > 0`)
 * và khi BE trả `WALLET_004` (đề phòng client tính lệch) — cả hai cùng dẫn tới MỘT lối ra: "Tạo khoản
 * điều chỉnh" (nút trong thông báo khoá bên dưới). Khoản ĐIỀU CHỈNH không sửa/xoá/điều chỉnh tiếp được.
 *
 * ✅ Các nút Sửa / Xoá / Điều chỉnh KHÔNG còn nằm ở thân màn: chúng ở thanh tiêu đề
 * (`ExpenseHeaderActions`) — thân màn chỉ đọc + thông báo khoá/lỗi xoá.
 */
export function ExpenseDetailBody({
  deleteError,
  directory,
  expense,
  onAdjust,
  onOpenExpense,
}: ExpenseDetailBodyProps) {
  const { isMe, meId, nameOf } = directory;
  const { locked, manageable } = expenseActionState(expense, deleteError);

  return (
    <View className="gap-xl py-xs">
      <ExpenseSummaryCard
        expense={expense}
        payerName={isMe(expense.paidBy) ? 'Bạn' : nameOf(expense.paidBy)}
      />
      <ExpenseSharesCard
        avatarOf={(userId) => directory.memberOf(userId)?.avatarUrl}
        expense={expense}
        meId={meId}
        nameOf={nameOf}
      />
      <ExpenseAdjustmentsCard
        adjustments={expense.adjustments}
        meId={meId}
        nameOf={nameOf}
        onOpen={onOpenExpense}
      />

      {manageable && (locked || deleteError) ? (
        <View className="gap-sm">
          {locked ? <ExpenseLockedNotice onAdjust={onAdjust} /> : null}
          {deleteError && !isExpenseLocked(deleteError) ? (
            <Alert description={toErrorMessage(deleteError)} tone="error" />
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
