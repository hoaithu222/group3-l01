import { router } from 'expo-router';
import type { ReactNode } from 'react';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { useFeature } from '@/shell/capabilities';

/**
 * Cờ phân hệ `live-quiz` (BE `requireFeature(MODULES.LIVE_QUIZ)`). Lối vào đã ẩn khi tắt, nhưng deep link/route vẫn
 * mở được ⇒ chặn ở đây. `undefined` (capabilities chưa tải) vẫn cho vẽ — BE là nơi chặn cuối (`FEATURE_*`).
 */
export function LiveQuizGate({ children }: { children: ReactNode }) {
  const enabled = useFeature('live-quiz');
  if (enabled === false) {
    return (
      <Screen header={<AppBar title="Thi đấu trực tiếp" onBack={router.back} />}>
        <EmptyState
          description="Tính năng thi đấu trực tiếp đang tạm tắt."
          icon="lock"
          title="Chưa khả dụng"
          tone="warning"
        />
      </Screen>
    );
  }
  return <>{children}</>;
}
