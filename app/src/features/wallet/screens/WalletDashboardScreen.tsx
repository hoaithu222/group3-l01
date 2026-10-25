import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Reveal } from '@/shared/ui/motion';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import type { SettlementView } from '../api';
import { DashboardBalanceColumn } from '../components/DashboardBalanceColumn';
import { DashboardExpensesColumn } from '../components/DashboardExpensesColumn';
import { RejectSettlementSheet } from '../components/RejectSettlementSheet';
import { WalletDenied } from '../components/WalletDenied';
import { useIsOffline } from '../hooks/useIsOffline';
import { useMemberDirectory } from '../hooks/useMemberDirectory';
import { useWalletGate } from '../hooks/useWalletGate';
import {
  useCancelSettlement,
  useConfirmSettlement,
  useRejectSettlement,
} from '../queries/settlement.mutations';
import {
  usePendingSettlements,
  useRecentExpenses,
  useWalletSummary,
} from '../queries/wallet.queries';
import {
  addExpenseHref,
  expenseHref,
  historyHref,
  PAYMENT_PROFILES_HREF,
  settleHref,
  walletSettingsHref,
} from '../utils/wallet-routes';

/**
 * Dashboard ví nhóm (p6-04 app.md §3): số dư · cần tôi xác nhận · gợi ý thanh toán · số dư
 * thành viên · 5 khoản chi gần nhất · nút "Thêm khoản chi". Máy tính bảng chia 2 cột
 * (số dư/gợi ý | khoản chi) bằng CLASS `tablet:flex-row` — không dùng hook đo màn
 * (`responsive.md`: có `className` thì luôn là class).
 *
 * ⚠️ Nút "Thêm khoản chi" là `BottomActionBar` chứ không phải FAB (app.md ghi FAB): bộ
 * component chung không có FAB, và tự dựng nút nổi là viết control mới khi đã có
 * `BottomActionBar` cho đúng vai "hành động chính của màn".
 */
export function WalletDashboardScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const gate = useWalletGate(wsId);
  const summary = useWalletSummary(wsId);
  const recent = useRecentExpenses(wsId);
  const pending = usePendingSettlements(wsId);
  const directory = useMemberDirectory(wsId);
  const offline = useIsOffline();
  const confirm = useConfirmSettlement(wsId);
  const reject = useRejectSettlement(wsId);
  const cancel = useCancelSettlement(wsId);
  const [rejecting, setRejecting] = useState<SettlementView | null>(null);

  if (gate.denied) return <WalletDenied />;

  const busy = confirm.isPending || reject.isPending || cancel.isPending;
  const refresh = () => void Promise.all([summary.refetch(), recent.refetch(), pending.refetch()]);
  const readOnly = gate.isArchived;

  return (
    <Screen
      constrained={false}
      footer={
        readOnly ? undefined : (
          <BottomActionBar>
            <Button
              disabled={offline}
              fullWidth
              iconLeft="add"
              label={offline ? 'Kết nối lại để thêm' : 'Thêm khoản chi'}
              onPress={() => router.push(addExpenseHref(wsId))}
            />
          </BottomActionBar>
        )
      }
      header={
        <AppBar
          actions={
            <View className="flex-row gap-sm">
              <Button
                accessibilityLabel="Lịch sử"
                iconLeft="history"
                iconOnly
                size="sm"
                variant="tertiary"
                onPress={() => router.push(historyHref(wsId))}
              />
              {gate.canManageSettings ? (
                <Button
                  accessibilityLabel="Cài đặt ví"
                  iconLeft="setting"
                  iconOnly
                  size="sm"
                  variant="tertiary"
                  onPress={() => router.push(walletSettingsHref(wsId))}
                />
              ) : null}
            </View>
          }
          contentClassName="tablet:max-w-none"
          title="Ví nhóm"
          onBack={router.back}
        />
      }
      refreshing={summary.isRefetching || recent.isRefetching || pending.isRefetching}
      onRefresh={refresh}
    >
      {readOnly ? (
        <Alert className="mt-xs" description="Nhóm đã lưu trữ nên ví chỉ để xem." tone="info" />
      ) : null}

      {/* Hai cột hiện dần lệch nhịp (`Reveal`, tự tắt khi "Giảm chuyển động"); lớp bố cục của cột đặt thẳng lên `Reveal` vì nó THAY
          chỗ con của hàng `tablet:flex-row`. */}
      <View className="gap-xl py-xs tablet:flex-row tablet:items-start">
        <Reveal className="tablet:flex-1">
          <DashboardBalanceColumn
            busy={busy}
            directory={directory}
            pending={pending.data ?? []}
            summary={summary.data}
            summaryError={summary.isError}
            onCancel={(item) =>
              cancel.mutate(item.id, {
                onSuccess: () => showToast('success', 'Đã huỷ yêu cầu thanh toán.'),
              })
            }
            onConfirm={(item) =>
              confirm.mutate(item.id, {
                onSuccess: () => {
                  hapticSuccess();
                  showToast('success', 'Đã xác nhận nhận tiền.');
                },
              })
            }
            onPay={(item) => router.push(settleHref(wsId, item.toId, item.amount))}
            onReject={setRejecting}
            onRetry={refresh}
          />
        </Reveal>

        <Reveal className="gap-xl tablet:flex-1" index={1}>
          <DashboardExpensesColumn
            directory={directory}
            expenses={recent.data}
            onOpen={(expense) => router.push(expenseHref(wsId, expense.id))}
            onSeeAll={() => router.push(historyHref(wsId))}
          />
          <Card className="px-md py-2xs" padded={false}>
            <ListItem
              className="py-xs"
              description="Để bạn bè quét QR trả tiền cho bạn"
              emphasis="title"
              label="Tài khoản nhận tiền của tôi"
              leading={<IconTile name="qr" tone="info" />}
              trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
              onPress={() => router.push(PAYMENT_PROFILES_HREF)}
            />
          </Card>
        </Reveal>
      </View>

      <RejectSettlementSheet
        key={rejecting?.id ?? 'none'}
        busy={reject.isPending}
        visible={rejecting !== null}
        onClose={() => setRejecting(null)}
        onSubmit={(reason) => {
          if (!rejecting) return;
          reject.mutate(
            { reason, settlementId: rejecting.id },
            {
              onSuccess: () => {
                setRejecting(null);
                showToast('success', 'Đã từ chối khoản thanh toán.');
              },
            },
          );
        }}
      />
    </Screen>
  );
}
