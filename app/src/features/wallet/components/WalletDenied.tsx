import { router } from 'expo-router';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';

/**
 * Màn "không xem được ví" — GUEST (cố vấn), người không thuộc nhóm, hoặc cờ `wallet` tắt.
 * Cố ý MỘT câu chung cho cả ba (BE cũng trả 404 trung tính cho cả ba): nói rõ "vì bạn là
 * khách" hay "vì nhóm chưa bật" là lộ thông tin về nhóm cho người không có quyền.
 */
export function WalletDenied() {
  return (
    <Screen header={<AppBar title="Ví nhóm" onBack={router.back} />}>
      <EmptyState
        actions={[{ label: 'Quay lại', onPress: router.back, variant: 'secondary' }]}
        description="Ví nhóm chỉ dành cho thành viên của nhóm."
        icon="lock"
        title="Bạn không xem được ví nhóm này"
        tone="warning"
      />
    </Screen>
  );
}
