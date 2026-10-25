import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';

export interface WellbeingLoadStateProps {
  /** Lỗi của lượt tải — chỉ để chọn giữa "ngoại tuyến" và "lỗi" (không hiện chi tiết). */
  error: unknown;
  header: ReactNode;
  /** `true` ⇒ khung xương; `false` ⇒ khối lỗi + "Thử lại". */
  isLoading: boolean;
  onRetry: () => void;
}

/**
 * Khung "đang tải / không tải được" chung cho ba màn của nhánh (giải thích, Sức khoẻ, Cài đặt) — cùng một cách nói với người dùng, và không màn nào phải tự dựng bộ này.
 * Lỗi MẠNG ⇒ `offline` (Thử lại chữa được); lỗi khác ⇒ `error` + Thử lại. Không nêu chi tiết lỗi kỹ thuật: người đang mệt không cần đọc mã lỗi.
 */
export function WellbeingLoadState({ error, header, isLoading, onRetry }: WellbeingLoadStateProps) {
  if (isLoading) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-28 rounded-md" />
          <Skeleton className="h-40 rounded-md" />
          <Skeleton className="h-24 rounded-md" />
        </View>
      </Screen>
    );
  }
  return (
    <Screen header={header} scrollable={false}>
      <ScreenState
        action={{ label: 'Thử lại', onPress: onRetry }}
        state={isNetworkError(error) ? 'offline' : 'error'}
      />
    </Screen>
  );
}
