import { router, useLocalSearchParams } from 'expo-router';
import { useMemo } from 'react';
import { View } from 'react-native';

import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Skeleton } from '@/shared/ui/skeleton';

import { SettleForm } from '../components/SettleForm';
import { WalletDenied } from '../components/WalletDenied';
import { maxSettleAmount } from '../domain/settle-limit';
import { useMemberDirectory } from '../hooks/useMemberDirectory';
import { useSecureScreen } from '../hooks/useSecureScreen';
import { useWalletGate } from '../hooks/useWalletGate';
import { useWalletSummary } from '../queries/wallet.queries';

/**
 * Trả nợ (`?toId=&amount=` do dòng "Gợi ý thanh toán" điền sẵn). Màn này hiện SỐ TÀI KHOẢN đầy
 * đủ của người nhận → chặn chụp/ghi màn hình (Android) suốt lúc mở.
 *
 * Không có `toId` (mở từ link): chọn người có gợi ý trả đầu tiên của TÔI; không có thì nói rõ
 * "bạn không nợ ai" thay vì hiện form rỗng không gửi được.
 */
export function SettleScreen() {
  const { amount, toId, wsId } = useLocalSearchParams<{
    amount?: string;
    toId?: string;
    wsId: string;
  }>();
  useSecureScreen('wallet-settle');
  const gate = useWalletGate(wsId);
  const summary = useWalletSummary(wsId);
  const directory = useMemberDirectory(wsId);

  const suggestion = useMemo(
    () =>
      summary.data?.suggestions.find(
        (item) => item.fromId === directory.meId && (!toId || item.toId === toId),
      ),
    [summary.data, directory.meId, toId],
  );
  const payeeId = toId ?? suggestion?.toId;

  if (gate.denied) return <WalletDenied />;

  const header = <AppBar title="Trả nợ" onBack={router.back} />;

  if (summary.isPending || directory.isLoading) {
    // Cùng hình dạng màn thật: khối "ai → ai" (avatar 48 + tên) · ô số tiền · phương thức/QR.
    return (
      <Screen header={header}>
        <View className="gap-lg py-xs">
          <Skeleton className="h-32 rounded-md" />
          <Skeleton className="h-14 rounded-sm" />
          <Skeleton className="h-56 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (!payeeId) {
    return (
      <Screen header={header}>
        <EmptyState
          description="Hiện bạn không có khoản nợ nào cần trả trong nhóm này."
          icon="checkmark-circle"
          title="Bạn không nợ ai"
          tone="success"
        />
      </Screen>
    );
  }

  const suggested = Number(amount);
  return (
    <SettleForm
      initialAmount={
        Number.isInteger(suggested) && suggested > 0 ? suggested : (suggestion?.amount ?? null)
      }
      maxAmount={maxSettleAmount(summary.data, directory.meId, payeeId)}
      payeeAvatarUrl={directory.memberOf(payeeId)?.avatarUrl}
      payeeName={directory.nameOf(payeeId)}
      // Tên THẬT của tôi cho chữ viết tắt trên avatar (dòng chữ vẫn ghi "Người trả"); chưa có trong danh bạ thì "Bạn".
      payer={{
        avatarUrl: directory.meId ? directory.memberOf(directory.meId)?.avatarUrl : undefined,
        name: directory.meId && directory.memberOf(directory.meId) ? directory.nameOf(directory.meId) : 'Bạn',
      }}
      toId={payeeId}
      wsId={wsId}
    />
  );
}
