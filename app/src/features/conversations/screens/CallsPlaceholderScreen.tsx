import { router } from 'expo-router';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

/**
 * app.md §1 — `calls.tsx` là khung chờ p2-01 (Voice/Call, Phase 2). Không có
 * gì để gọi ở P0 nên nút "Gọi" cũng bị ẩn khỏi `ConversationHeader`/
 * `ConversationInfoScreen` thay vì trỏ vào route này mà không làm gì.
 */
export function CallsPlaceholderScreen() {
  return (
    <Screen header={<AppBar title="Cuộc gọi" onBack={router.back} />}>
      <EmptyState description="Cuộc gọi sẽ có ở bản cập nhật tới." icon="phone" title="Sắp có" />
    </Screen>
  );
}
