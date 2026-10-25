import { router } from 'expo-router';

import { Button } from '@/shared/ui/button';
import { useFeature } from '@/shell/capabilities';

/** Nút "Cuộc gọi" trên header danh sách hội thoại → `messages/calls` (lịch sử). Ẩn khi cờ `voice` tắt (README p2-01 §1). */
export function CallHistoryEntry() {
  if (useFeature('voice') !== true) return null;
  return (
    <Button
      accessibilityLabel="Lịch sử cuộc gọi"
      iconLeft="phone"
      iconOnly
      size="sm"
      variant="tertiary"
      onPress={() => router.push('/messages/calls')}
    />
  );
}
