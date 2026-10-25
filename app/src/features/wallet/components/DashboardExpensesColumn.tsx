import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';
import { EmptyState } from '@/shared/ui/empty-state';
import { Section } from '@/shared/ui/section';
import { LinkButton } from '@/shared/ui/button';
import { Skeleton } from '@/shared/ui/skeleton';

import type { ExpenseView } from '../api';
import type { MemberDirectory } from '../hooks/useMemberDirectory';
import { ExpenseRow } from './ExpenseRow';

export interface DashboardExpensesColumnProps {
  directory: MemberDirectory;
  expenses: readonly ExpenseView[] | undefined;
  onOpen: (expense: ExpenseView) => void;
  onSeeAll: () => void;
}

/**
 * Cột "khoản chi": 5 khoản gần nhất + "Xem tất cả" (cột PHẢI trên máy tính bảng).
 *
 * ✅ Trạng thái rỗng KHÔNG có nút "Thêm khoản chi" riêng: màn đã có nút chính dính đáy cùng nhãn (`BottomActionBar` ở
 * `WalletDashboardScreen`) — hai nút y hệt trên cùng một màn là lặp lối vào.
 */
export function DashboardExpensesColumn({
  directory,
  expenses,
  onOpen,
  onSeeAll,
}: DashboardExpensesColumnProps) {
  return (
    <Section
      // "Xem tất cả" chỉ có nghĩa khi có gì để xem: khối rỗng thì không mời người dùng sang một danh sách rỗng.
      action={
        expenses && expenses.length > 0 ? (
          <LinkButton label="Xem tất cả" size="sm" onPress={onSeeAll} />
        ) : undefined
      }
      icon="bill"
      title="Khoản chi gần đây"
    >
      <Card>
        {expenses === undefined ? (
          <View className="gap-sm">
            <Skeleton className="h-14 rounded-sm" />
            <Skeleton className="h-14 rounded-sm" />
          </View>
        ) : expenses.length === 0 ? (
          <EmptyState
            description="Ghi khoản chi đầu tiên để cả nhóm cùng theo dõi và chia tiền."
            icon="wallet-add"
            size="compact"
            title="Chưa có khoản chi nào"
            tone="success"
          />
        ) : (
          expenses.map((expense, index) => (
            <View key={expense.id}>
              {index > 0 ? <Divider /> : null}
              <ExpenseRow
                expense={expense}
                meId={directory.meId}
                payerName={
                  directory.isMe(expense.paidBy) ? 'Bạn' : directory.nameOf(expense.paidBy)
                }
                onPress={onOpen}
              />
            </View>
          ))
        )}
      </Card>
    </Section>
  );
}
