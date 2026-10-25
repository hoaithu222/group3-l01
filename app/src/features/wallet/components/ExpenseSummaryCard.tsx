import { Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { formatDate } from '@/shared/utils/format/date.utils';

import type { ExpenseDetailView } from '../api';
import { categoryLabel, categoryVisual, SPLIT_TYPE_LABEL } from '../constants/wallet.constants';
import { describeExpenseAmount } from '../domain/expense-text';
import { WalletAssetImage } from './WalletAssetImage';

export interface ExpenseSummaryCardProps {
  expense: ExpenseDetailView;
  payerName: string;
}

/** Đầu trang chi tiết: mô tả, số tiền, người trả, danh mục, ngày, kiểu chia, ảnh hoá đơn (URL ký). */
export function ExpenseSummaryCard({ expense, payerName }: ExpenseSummaryCardProps) {
  const isAdjustment = expense.kind === 'ADJUSTMENT';
  // Cùng ô icon với dòng khoản chi ở danh sách (danh mục · hoặc `reload` cho điều chỉnh) — mở chi tiết vẫn nhận ra "khoản nào".
  const visual = isAdjustment
    ? { icon: 'reload' as const, tone: 'warning' as const }
    : categoryVisual(expense.category);

  return (
    <Card>
      <View className="flex-row items-start gap-sm pb-sm">
        <IconTile name={visual.icon} size="lg" tone={visual.tone} />
        <View className="flex-1 gap-xs">
          {/* Chỉ dựng hàng huy hiệu khi CÓ huy hiệu: hàng rỗng vẫn cộng thêm một khe `gap-xs` (8dp) trên đầu thẻ. */}
          {isAdjustment ? (
            <View className="flex-row items-center gap-xs">
              <Badge label="Điều chỉnh" size="sm" variant="warning" />
            </View>
          ) : null}
          <Text className="text-header-sm font-semibold text-fg-1">{expense.description}</Text>
          <Text className="text-header-md font-bold text-fg-1">{describeExpenseAmount(expense)}</Text>
        </View>
      </View>

      <View className="gap-sm">
        <ListItem label="Người trả" value={payerName} />
        <ListItem label="Danh mục" value={categoryLabel(expense.category)} />
        <ListItem label="Ngày chi" value={formatDate(expense.occurredAt)} />
        <ListItem label="Cách chia" value={SPLIT_TYPE_LABEL[expense.splitType]} />
      </View>

      {expense.receiptAssetId ? (
        <View className="pt-md">
          <WalletAssetImage alt="Ảnh hoá đơn" assetId={expense.receiptAssetId} />
        </View>
      ) : null}
    </Card>
  );
}
