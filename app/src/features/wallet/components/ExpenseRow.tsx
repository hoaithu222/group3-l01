import { Pressable, Text, View } from 'react-native';

import { Badge } from '@/shared/ui/badge';
import { IconTile } from '@/shared/ui/icon-tile';
import { formatDate } from '@/shared/utils/format/date.utils';
import { cn } from '@/shared/utils/style/cn';

import type { ExpenseView } from '../api';
import { categoryLabel, categoryVisual } from '../constants/wallet.constants';
import { describeExpenseAmount, describeMyShare } from '../domain/expense-text';

export interface ExpenseRowProps {
  expense: ExpenseView;
  meId: string | undefined;
  payerName: string;
  onPress: (expense: ExpenseView) => void;
}

/**
 * Một dòng khoản chi: ô icon danh mục · mô tả · danh mục · ngày · ai trả · số tiền · phần của tôi.
 * Cả dòng là MỘT ô bấm (mở chi tiết) với nhãn đọc đủ nghĩa — không để trình đọc
 * màn hình đọc rời số tiền không ngữ cảnh. Ô icon theo danh mục (`categoryVisual`) chỉ bổ trợ — chữ danh mục nằm ở dòng phụ;
 * khoản ĐIỀU CHỈNH dùng ô `reload` tông cảnh báo, khớp huy hiệu "Điều chỉnh".
 * `active:opacity-70`: phản hồi nhấn (hàng trần không có nền để đổi).
 */
export function ExpenseRow({ expense, meId, onPress, payerName }: ExpenseRowProps) {
  const myShare = describeMyShare(expense, meId);
  const amountText = describeExpenseAmount(expense);
  const isAdjustment = expense.kind === 'ADJUSTMENT';
  const meta = `${categoryLabel(expense.category)} · ${formatDate(expense.occurredAt)} · ${payerName} trả`;
  const visual = isAdjustment
    ? { icon: 'reload' as const, tone: 'warning' as const }
    : categoryVisual(expense.category);

  return (
    <Pressable
      accessibilityLabel={`${isAdjustment ? 'Điều chỉnh: ' : ''}${expense.description}, ${amountText}. ${meta}${myShare ? `. ${myShare.text}` : ''}`}
      accessibilityRole="button"
      className="min-h-14 flex-row items-center gap-sm py-xs active:opacity-70"
      onPress={() => onPress(expense)}
    >
      <IconTile name={visual.icon} size="sm" tone={visual.tone} />

      <View className="flex-1 gap-3xs">
        <View className="flex-row items-center gap-xs">
          <Text className="shrink text-body-lg font-semibold text-fg-1" numberOfLines={1}>
            {expense.description}
          </Text>
          {isAdjustment ? <Badge label="Điều chỉnh" size="sm" variant="warning" /> : null}
        </View>
        <Text className="text-caption-lg text-fg-2" numberOfLines={1}>
          {meta}
        </Text>
      </View>

      <View className="items-end gap-3xs">
        <Text className="text-label-lg font-semibold text-fg-1">{amountText}</Text>
        {myShare ? (
          <Text
            className={cn('text-caption-lg', myShare.tone === 'debt' ? 'text-error' : 'text-fg-2')}
          >
            {myShare.text}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}
