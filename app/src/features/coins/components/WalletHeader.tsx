import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Card } from '@/shared/ui/card';
import { Icon } from '@/shared/ui/icon';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { isNetworkError } from '@/shared/utils/errors';

import { TRANSACTION_FILTER_TABS } from '../constants/coins.constants';
import { useWallet } from '../queries/wallet.queries';
import { COINS_INVENTORY_HREF, COINS_SHOP_HREF } from '../utils/coins-routes';
import { CoinBalanceHeader } from './CoinBalanceHeader';
import { QuestList } from './QuestList';

export interface WalletHeaderProps {
  /** `'ALL'` hoặc một `CoinTxType` — bộ lọc lịch sử bên dưới (state do màn giữ vì nó quyết định danh sách). */
  filter: string;
  onFilterChange: (key: string) => void;
}

/**
 * Phần ĐẦU danh sách của màn Ví (đặt vào `ListHeaderComponent` của `FlatList` để cả màn cuộn một khối, lịch sử dài vẫn ảo hoá): số dư, hai lối vào
 * (Cửa hàng · Kho đồ), nhiệm vụ ngày, rồi tiêu đề + bộ lọc của lịch sử. Lề `px-md` do khối này giữ (các dòng lịch sử tự có `px-md` — màn `padded={false}`).
 */
export function WalletHeader({ filter, onFilterChange }: WalletHeaderProps) {
  const wallet = useWallet();

  let balance: ReactNode;
  if (wallet.isLoading) {
    balance = <Skeleton className="h-44 rounded-md" />;
  } else if (wallet.isError && !wallet.data) {
    balance = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void wallet.refetch() }}
        fullscreen={false}
        state={isNetworkError(wallet.error) ? 'offline' : 'error'}
        title="Không tải được số dư"
      />
    );
  } else if (wallet.data) {
    balance = <CoinBalanceHeader wallet={wallet.data} />;
  }

  return (
    <View className="gap-xl py-xs">
      <View className="gap-md px-md">
        {balance}
        <Card className="gap-0" padded={false}>
          <ListItem
            className="px-md py-xs"
            description="Khung ảnh đại diện, giao diện hồ sơ, gói emoji"
            divider
            emphasis="title"
            label="Cửa hàng"
            leading={<IconTile name="store" tone="accent" />}
            trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
            onPress={() => router.push(COINS_SHOP_HREF)}
          />
          <ListItem
            className="px-md py-xs"
            description="Vật phẩm bạn đã mua và đang dùng"
            emphasis="title"
            label="Kho đồ"
            leading={<IconTile name="basket-01" tone="brand" />}
            trailing={<Icon color="fg-2" name="arrow-right-small" size="sm" />}
            onPress={() => router.push(COINS_INVENTORY_HREF)}
          />
        </Card>
      </View>
      <View className="px-md">
        <QuestList />
      </View>
      <View className="px-md">
        <Section icon="history" title="Lịch sử xu">
          <Tabs
            className="grow-0"
            items={TRANSACTION_FILTER_TABS}
            scrollable
            value={filter}
            variant="pill"
            onChange={onFilterChange}
          />
        </Section>
      </View>
    </View>
  );
}
