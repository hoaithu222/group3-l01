import { Text, View } from 'react-native';

import { ERROR_CODE_MESSAGES } from '@/shared/constants/error-codes';
import { Icon } from '@/shared/ui/icon';

import type { ForwardOption, ForwardResultItem } from '../../api/chat.types';
import { labelOfTarget, targetKey } from './forward-targets';

export interface ForwardResultsListProps {
  results: ForwardResultItem[];
  targets: ForwardOption[];
}

/** Kết quả từng đích ✓/⚠ + lý do (app.md §3 `ForwardSheet`). */
export function ForwardResultsList({ results, targets }: ForwardResultsListProps) {
  return (
    <View className="gap-2xs">
      {results.map((r) => (
        /* Không tự khai `px-*`: `ForwardSheet` là tấm `padded` (thân đã có lề 16) — khai thêm là hàng kết quả thụt 32dp. */
        <View key={targetKey(r.target)} className="flex-row items-center gap-xs py-2xs">
          <Icon
            color={r.status === 'SENT' ? 'success' : 'error'}
            name={r.status === 'SENT' ? 'checkmark-circle' : 'alert-warning-circle'}
            size={18}
          />
          <View className="flex-1">
            <Text className="text-label-sm text-fg-1">{labelOfTarget(targets, r.target)}</Text>
            {r.status !== 'SENT' ? (
              <Text className="text-caption-sm text-error">{(r.code && ERROR_CODE_MESSAGES[r.code]) ?? 'Không chuyển tiếp được'}</Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}
