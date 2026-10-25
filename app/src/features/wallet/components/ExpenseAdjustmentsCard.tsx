import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';

import type { ExpenseView } from '../api';
import { ExpenseRow } from './ExpenseRow';

export interface ExpenseAdjustmentsCardProps {
  adjustments: readonly ExpenseView[];
  meId: string | undefined;
  nameOf: (userId: string) => string;
  onOpen: (expense: ExpenseView) => void;
}

/** Các khoản điều chỉnh đã tạo cho khoản này (mới nhất hiệu lực). Rỗng thì không vẽ gì. */
export function ExpenseAdjustmentsCard({
  adjustments,
  meId,
  nameOf,
  onOpen,
}: ExpenseAdjustmentsCardProps) {
  if (adjustments.length === 0) return null;

  return (
    <Card title="Điều chỉnh">
      {adjustments.map((item, index) => (
        <View key={item.id}>
          {index > 0 ? <Divider /> : null}
          <ExpenseRow
            expense={item}
            meId={meId}
            payerName={item.paidBy === meId ? 'Bạn' : nameOf(item.paidBy)}
            onPress={onOpen}
          />
        </View>
      ))}
    </Card>
  );
}
