import { router, useLocalSearchParams } from 'expo-router';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { WalletDenied } from '../components/WalletDenied';
import { WalletSettingsForm } from '../components/WalletSettingsForm';
import { useWalletGate } from '../hooks/useWalletGate';
import { useWalletSummary } from '../queries/wallet.queries';
import { useReminderTargets } from '../queries/wallet-support.queries';

/**
 * Cài đặt ví — chỉ OWNER/ADMIN (`myActions.canManageSettings` từ `GET /wallet`). MEMBER vào được
 * route (gõ đường dẫn) thì thấy giải thích, không thấy form: hàng rào thật là BE (`PUT` trả 403).
 */
export function WalletSettingsScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const gate = useWalletGate(wsId);
  const settings = gate.settings.data;
  const targets = useReminderTargets(wsId, gate.canManageSettings);
  const summary = useWalletSummary(wsId);

  if (gate.denied) return <WalletDenied />;

  const header = <AppBar title="Cài đặt ví" onBack={router.back} />;

  if (!settings) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-16 rounded-sm" />
          <Skeleton className="h-40 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!gate.canManageSettings) {
    return (
      <Screen header={header}>
        <EmptyState
          description="Chỉ chủ nhóm và quản trị viên mới đổi được cài đặt ví."
          icon="lock"
          title="Bạn không có quyền"
          tone="warning"
        />
      </Screen>
    );
  }

  const minDebt = Math.max(1, settings.reminderMinDebt);
  const debtorsCount =
    summary.data?.balances.filter((item) => item.balance < 0 && -item.balance >= minDebt).length ??
    0;

  return (
    // `key` theo phiên bản: lưu xong / tải lại sau xung đột → form dựng lại từ số mới nhất của server.
    <WalletSettingsForm
      key={settings.version}
      debtorsCount={debtorsCount}
      settings={settings}
      targets={targets.data}
      wsId={wsId}
    />
  );
}
