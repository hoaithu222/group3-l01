import { Text, View } from 'react-native';

import { Avatar } from '@/shared/ui/avatar';
import { Badge, type BadgeProps } from '@/shared/ui/badge';
import { Card } from '@/shared/ui/card';
import { Divider } from '@/shared/ui/divider';

import type { ExpenseDetailView, ShareStatus } from '../api';
import { SHARE_STATUS_LABEL } from '../constants/wallet.constants';
import { formatMoney } from '../domain/money';

export interface ExpenseSharesCardProps {
  /** URL ảnh đại diện theo `userId` — có thì mỗi dòng mở đầu bằng avatar người nợ (không có ảnh ⇒ chữ viết tắt). */
  avatarOf?: (userId: string) => string | null | undefined;
  expense: ExpenseDetailView;
  meId: string | undefined;
  nameOf: (userId: string) => string;
}

/** Tình trạng từng phần: chữ + huy hiệu (không chỉ màu). */
const STATUS_VARIANT: Record<ShareStatus, NonNullable<BadgeProps['variant']>> = {
  PAID: 'success',
  PARTIAL: 'warning',
  UNPAID: 'error',
  VOID: 'neutral',
};

/**
 * Ai nợ bao nhiêu và đã trả chưa (phép chiếu FIFO của BE: "khoản nào đã xong"). Người trả
 * không sinh nợ nên không có dòng riêng — được nói rõ ở cuối để không ai thắc mắc "sao thiếu người".
 */
export function ExpenseSharesCard({ avatarOf, expense, meId, nameOf }: ExpenseSharesCardProps) {
  const name = (userId: string) => (userId === meId ? 'Bạn' : nameOf(userId));
  const avatarSource = (userId: string) => {
    const url = avatarOf?.(userId);
    return url ? { uri: url } : undefined;
  };

  return (
    <Card title="Ai nợ khoản này">
      {expense.shares.length === 0 ? (
        <Text className="text-body-md text-fg-2">Không phát sinh khoản nợ nào.</Text>
      ) : (
        expense.shares.map((share, index) => (
          <View key={share.id}>
            {index > 0 ? <Divider /> : null}
            <View
              accessibilityLabel={`${name(share.debtorId)} nợ ${formatMoney(share.amount)}, ${SHARE_STATUS_LABEL[share.status]}`}
              accessible
              className="min-h-11 flex-row items-center gap-sm py-2xs"
            >
              {/* Tên THẬT cho chữ viết tắt (dòng chữ có thể là "Bạn"); nằm trong ô trợ năng đã gộp của dòng nên không đọc lặp. */}
              <Avatar name={nameOf(share.debtorId)} size="sm" source={avatarSource(share.debtorId)} />
              <Text className="flex-1 text-body-lg text-fg-1" numberOfLines={1}>
                {name(share.debtorId)}
              </Text>
              <Text className="text-label-lg font-semibold text-fg-1">
                {formatMoney(share.amount)}
              </Text>
              <Badge
                label={SHARE_STATUS_LABEL[share.status]}
                size="sm"
                variant={STATUS_VARIANT[share.status]}
              />
            </View>
          </View>
        ))
      )}
      <Text className="pt-sm text-caption-lg text-fg-2">
        Người trả ({name(expense.paidBy)}) không nợ khoản này — phần của người trả và phần lẻ do
        người trả chịu.
      </Text>
    </Card>
  );
}
