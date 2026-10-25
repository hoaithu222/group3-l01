import { useState } from 'react';
import { Text, View } from 'react-native';

import { Divider } from '@/shared/ui/divider';
import { Icon } from '@/shared/ui/icon';
import { TooltipSheet } from '@/shared/ui/tooltip';

import type { WalletSummaryView } from '../api';
import { SuggestionRow } from './SuggestionRow';

type Suggestion = WalletSummaryView['suggestions'][number];

export interface SuggestionListProps {
  /** URL ảnh đại diện theo `userId` (danh bạ thành viên) — có thì mỗi dòng mở đầu bằng cặp avatar "ai → ai". */
  avatarOf?: (userId: string) => string | null | undefined;
  meId: string | undefined;
  nameOf: (userId: string) => string;
  suggestions: readonly Suggestion[];
  onPay: (suggestion: Suggestion) => void;
}

/** Gợi ý liên quan TÔI trước (app.md §3), rồi mới tới phần còn lại của nhóm. */
function sortMineFirst(list: readonly Suggestion[], meId: string | undefined): Suggestion[] {
  const mine = (item: Suggestion) => item.fromId === meId || item.toId === meId;
  return [...list].sort((a, b) => Number(mine(b)) - Number(mine(a)));
}

const WHY_BULLETS = [
  'Các khoản nợ giữa mọi người đã được gộp lại.',
  'Bạn chỉ cần chuyển một lần cho người này thay vì trả từng người.',
  'Số tiền được tính để cả nhóm thanh toán ít lần nhất.',
] as const;

/**
 * "Gợi ý thanh toán" — kết quả GỘP nợ tối giản (greedy min-cash-flow, BE tính khi
 * đọc). Giải thích "Vì sao trả cho Cường?" là TooltipSheet chứ không phải Tooltip:
 * nội dung dài hơn ngưỡng bong bóng (`resolveTooltipLevel` cấp 3).
 */
export function SuggestionList({
  avatarOf,
  meId,
  nameOf,
  onPay,
  suggestions,
}: SuggestionListProps) {
  const [explaining, setExplaining] = useState<Suggestion | null>(null);
  const ordered = sortMineFirst(suggestions, meId);
  const person = (userId: string) => ({
    avatarUrl: avatarOf?.(userId),
    id: userId,
    name: nameOf(userId),
  });

  if (ordered.length === 0) {
    // Nhóm đã hoà — tin TỐT, không phải lỗi: dấu tích tông thành công đi kèm câu chữ (không để màu đứng một mình).
    return (
      <View className="flex-row items-center gap-xs">
        <Icon color="success" name="checkmark-circle" size="sm" />
        <Text className="flex-1 text-body-md text-fg-2">Không còn khoản nào cần thanh toán.</Text>
      </View>
    );
  }

  return (
    <View>
      {ordered.map((item, index) => (
        <View key={`${item.fromId}-${item.toId}`}>
          {index > 0 ? <Divider /> : null}
          <SuggestionRow
            amount={item.amount}
            canPay={item.fromId === meId}
            fromName={item.fromId === meId ? 'Bạn' : nameOf(item.fromId)}
            people={avatarOf ? [person(item.fromId), person(item.toId)] : undefined}
            toName={nameOf(item.toId)}
            onExplain={() => setExplaining(item)}
            onPay={() => onPay(item)}
          />
        </View>
      ))}

      <TooltipSheet
        bullets={WHY_BULLETS}
        title={explaining ? `Vì sao trả cho ${nameOf(explaining.toId)}?` : ''}
        visible={explaining !== null}
        onClose={() => setExplaining(null)}
      />
    </View>
  );
}
