import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { AddExpenseForm } from '../components/AddExpenseForm';
import { WalletDenied } from '../components/WalletDenied';
import { useMemberDirectory } from '../hooks/useMemberDirectory';
import { useWalletGate } from '../hooks/useWalletGate';

/** Thêm khoản chi (app.md §3). Chờ đủ thành viên rồi mới dựng form — "tất cả được chọn sẵn" cần danh sách đã có. */
export function AddExpenseScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const gate = useWalletGate(wsId);
  const directory = useMemberDirectory(wsId);

  if (gate.denied) return <WalletDenied />;

  if (gate.isArchived) {
    return (
      <Screen header={<AppBar title="Thêm khoản chi" onBack={router.back} />}>
        <EmptyState
          description="Nhóm đã lưu trữ nên không ghi thêm khoản chi được."
          icon="lock"
          title="Ví chỉ để xem"
          tone="warning"
        />
      </Screen>
    );
  }

  if (directory.isError && directory.members.length === 0) {
    return (
      <Screen header={<AppBar title="Thêm khoản chi" onBack={router.back} />}>
        <EmptyState
          actions={[{ label: 'Thử lại', onPress: () => void directory.refetch() }]}
          description="Không tải được danh sách thành viên để chia tiền. Kiểm tra kết nối rồi thử lại."
          icon="alert-warning"
          title="Không tải được"
          tone="danger"
        />
      </Screen>
    );
  }

  if (directory.isLoading || directory.members.length === 0) {
    return (
      <Screen header={<AppBar title="Thêm khoản chi" onBack={router.back} />}>
        <View className="gap-md py-xs">
          <Skeleton className="h-14 rounded-sm" />
          <Skeleton className="h-14 rounded-sm" />
          <Skeleton className="h-40 rounded-sm" />
        </View>
      </Screen>
    );
  }

  return <AddExpenseForm meId={directory.meId} members={directory.members} wsId={wsId} />;
}
