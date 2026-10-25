import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { ActionMenu } from '@/shared/ui/action-menu';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Tabs } from '@/shared/ui/tab';
import { hapticSelection } from '@/shared/utils/haptics';

import type { ExpenseFilter, SettlementFilter } from '../api';
import { ExpenseFilterBar } from '../components/ExpenseFilterBar';
import { HistoryExpenseList } from '../components/HistoryExpenseList';
import { HistorySettlementList } from '../components/HistorySettlementList';
import { WalletDenied } from '../components/WalletDenied';
import { useIsOffline } from '../hooks/useIsOffline';
import { useMemberDirectory } from '../hooks/useMemberDirectory';
import { useWalletCsvExport } from '../hooks/useWalletCsvExport';
import { useWalletGate } from '../hooks/useWalletGate';
import { expenseHref } from '../utils/wallet-routes';

type Tab = 'expenses' | 'settlements';

const TABS = [
  { key: 'expenses', label: 'Khoản chi' },
  { key: 'settlements', label: 'Thanh toán' },
];

/**
 * Lịch sử: tab Khoản chi / Thanh toán, bộ lọc, "Xuất CSV" (app.md §3). Xuất CSV theo TAB đang
 * mở (`?kind=expenses|settlements`) và mở bảng chia sẻ — không còn job + thông báo khi xong
 * (BE đổi sang tải trực tiếp, tối đa 5000 dòng). Bộ lọc chỉ ảnh hưởng danh sách; CSV luôn là TOÀN BỘ.
 *
 * ✅ "Xuất CSV" nằm ở menu "⋯" của thanh tiêu đề chứ không cạnh hàng tab: hành động hiếm dùng, và đứng
 * cạnh `Tabs` thì tab bị bóp hẹp + có thêm một nút tranh chỗ với bộ chip lọc ngay bên dưới (màn chỉ
 * còn ĐÚNG hai dải điều khiển: tab, chip lọc). Dòng mô tả của mục menu nói rõ CSV bỏ qua bộ lọc.
 */
export function WalletHistoryScreen() {
  const { wsId } = useLocalSearchParams<{ wsId: string }>();
  const gate = useWalletGate(wsId);
  const directory = useMemberDirectory(wsId);
  const csv = useWalletCsvExport(wsId);
  const offline = useIsOffline();
  const [tab, setTab] = useState<Tab>('expenses');
  const [expenseFilter, setExpenseFilter] = useState<ExpenseFilter>({});
  const [settlementFilter, setSettlementFilter] = useState<SettlementFilter>({});

  if (gate.denied) return <WalletDenied />;

  return (
    <Screen
      header={
        <AppBar
          actions={
            <ActionMenu
              accessibilityLabel="Thêm tuỳ chọn lịch sử"
              items={[
                {
                  description: offline
                    ? 'Cần kết nối mạng'
                    : `Toàn bộ ${tab === 'expenses' ? 'khoản chi' : 'thanh toán'}, không theo bộ lọc`,
                  disabled: offline || csv.isPending,
                  icon: 'share',
                  key: 'csv',
                  label: csv.isPending ? 'Đang xuất CSV…' : 'Xuất CSV',
                  onPress: () => void csv.run(tab),
                },
              ]}
            />
          }
          title="Lịch sử ví"
          onBack={router.back}
        />
      }
      padded={false}
      scrollable={false}
    >
      <View className="flex-1 gap-xs py-xs">
        <View className="px-md">
          <Tabs
            items={TABS}
            value={tab}
            variant="pill"
            onChange={(key) => {
              if (key !== tab) hapticSelection();
              setTab(key as Tab);
            }}
          />
        </View>

        {tab === 'expenses' ? (
          <>
            <ExpenseFilterBar
              filter={expenseFilter}
              members={directory.members}
              onChange={setExpenseFilter}
            />
            <View className="flex-1">
              <HistoryExpenseList
                directory={directory}
                filter={expenseFilter}
                wsId={wsId}
                onOpen={(expense) => router.push(expenseHref(wsId, expense.id))}
              />
            </View>
          </>
        ) : (
          <View className="flex-1">
            <HistorySettlementList
              directory={directory}
              filter={settlementFilter}
              wsId={wsId}
              onFilterChange={setSettlementFilter}
            />
          </View>
        )}
      </View>
    </Screen>
  );
}
