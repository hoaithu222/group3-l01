import { router } from 'expo-router';
import { type ReactNode, useEffect, useRef, useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { useResponsiveValue } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { IconTile } from '@/shared/ui/icon-tile';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { Tabs } from '@/shared/ui/tab';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticSelection, hapticSuccess, hapticTap } from '@/shared/utils/haptics';

import type { ShopItemKind, ShopListing } from '../api/coins.types';
import { CoinsNote } from '../components/CoinsNote';
import { PurchaseConfirmSheet } from '../components/PurchaseConfirmSheet';
import { ShopGrid } from '../components/ShopGrid';
import { SHOP_KIND_LABELS, SHOP_KIND_TABS } from '../constants/coins.constants';
import { useBuyItem, useShopItems } from '../queries/shop.queries';
import { useWallet } from '../queries/wallet.queries';
import { formatCoins } from '../utils/coin-format';
import { COINS_INVENTORY_HREF } from '../utils/coins-routes';

/**
 * Cửa hàng vật phẩm hồ sơ (app.md p7-02 §3): số dư + ba tab loại (Khung · Giao diện · Emoji) + lưới vật phẩm; chạm một món ⇒ tấm xác nhận mua. Một lượt tải
 * danh mục cho cả ba tab (lọc ở máy). Mất mạng ⇒ khoá mua (tấm nói rõ). Lối "Kho đồ" ở khe phải thanh tiêu đề (chỉ một hành động nên không cần menu ⋯).
 *
 * ⚠️ Tấm xác nhận giữ bản chụp `selected` để nội dung không biến mất giữa lúc tấm đang đóng dần; còn trạng thái SỞ HỮU thì lấy từ danh sách sống (`live`) — mua
 * xong/`COIN_002` làm mới danh sách, tấm tự chuyển sang "Bạn đã sở hữu". Đổi số dư (mua xong, kiếm xu ở thiết bị khác) ⇒ xoá lỗi mua cũ để câu "còn thiếu" không bị kẹt.
 */
export function ShopScreen() {
  const items = useShopItems();
  const wallet = useWallet();
  const buy = useBuyItem();
  const offline = useConnectionState() === 'offline';
  const columns = useResponsiveValue({ base: 2, tablet: 3, 'tablet-lg': 4 });
  const [kind, setKind] = useState<ShopItemKind>('AVATAR_FRAME');
  const [selected, setSelected] = useState<ShopListing | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);

  const balance = wallet.data?.balance;
  const { isError, reset } = buy;
  // Chỉ xoá lỗi mua cũ KHI ĐANG có lỗi và số dư đổi (đủ xu rồi thì câu "còn thiếu" hết đúng). ⚠️ Không đưa `isError` vào deps: lỗi vừa tới là effect chạy lại
  // và xoá luôn câu người dùng cần đọc; cũng không xoá khi đang gửi (số dư đổi do sự kiện khác) — `reset` giữa chừng làm nút mua sáng lại trong lúc lượt cũ còn chạy.
  const errored = useRef(false);
  useEffect(() => {
    errored.current = isError;
  });
  useEffect(() => {
    if (errored.current) reset();
  }, [balance, reset]);

  const live = items.data?.find((entry) => entry.id === selected?.id) ?? selected;
  // Vật phẩm biến khỏi danh mục (hết bán — `COIN_003` làm mới danh sách) ⇒ tấm tự đóng; câu "không còn được bán" đã ra ở toast của `useBuyItem`.
  const gone = Boolean(
    selected && items.data && !items.data.some((entry) => entry.id === selected.id),
  );
  const shown = items.data?.filter((entry) => entry.kind === kind) ?? [];

  const openSheet = (item: ShopListing) => {
    reset();
    setSelected(item);
    setSheetOpen(true);
  };
  const closeSheet = () => {
    setSheetOpen(false);
    reset();
  };
  // `mutateAsync` thay vì callback của `mutate`: `reset()` (mở/đóng tấm, đổi số dư) huỷ callback gắn theo từng lượt. Lỗi đã nằm ở `buy.error` và hiện trong tấm.
  // Rung "chạm" ngay khi bấm xác nhận (phản hồi tức thì), rung "xong" khi BE đã nhận — mua là việc có chờ mạng.
  const confirmBuy = (item: ShopListing) => {
    hapticTap();
    void buy.mutateAsync(item).then(
      () => {
        hapticSuccess();
        closeSheet();
      },
      () => undefined,
    );
  };

  let body: ReactNode;
  if (items.isLoading) {
    // Khung xương theo DÁNG lưới hai cột (thẻ vật phẩm), không phải hai dải ngang — dữ liệu về không làm bố cục nhảy.
    body = (
      <View className="gap-sm">
        <View className="flex-row gap-sm">
          <Skeleton className="h-44 flex-1 rounded-md" />
          <Skeleton className="h-44 flex-1 rounded-md" />
        </View>
        <View className="flex-row gap-sm">
          <Skeleton className="h-44 flex-1 rounded-md" />
          <Skeleton className="h-44 flex-1 rounded-md" />
        </View>
      </View>
    );
  } else if (items.isError && !items.data) {
    body = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void items.refetch() }}
        state={isNetworkError(items.error) ? 'offline' : 'error'}
        title="Không tải được cửa hàng"
      />
    );
  } else if (shown.length === 0) {
    body = (
      <ScreenState
        description={`Chưa có ${SHOP_KIND_LABELS[kind].toLowerCase()} nào được bán. Hãy quay lại sau.`}
        fullscreen={false}
        icon="store"
        state="empty"
        title="Chưa có vật phẩm"
      />
    );
  } else {
    body = <ShopGrid columns={columns} items={shown} onSelect={openSheet} />;
  }

  return (
    <Screen
      header={
        <AppBar
          actions={
            <Button
              accessibilityLabel="Kho đồ"
              iconLeft="basket-01"
              iconOnly
              size="sm"
              variant="tertiary"
              onPress={() => router.push(COINS_INVENTORY_HREF)}
            />
          }
          title="Cửa hàng"
          onBack={router.back}
        />
      }
      refreshing={items.isRefetching}
      onRefresh={() => void Promise.all([items.refetch(), wallet.refetch()])}
    >
      <View className="gap-md py-xs">
        {balance !== undefined ? (
          // Dải số dư: ô xu `accent` (cùng nhận diện với khối số dư ở màn Ví) + con số đậm — liếc là biết còn bao nhiêu xu
          // trước khi chọn món. MỘT ô trợ năng; ⚠️ nhãn KHÁC chữ "Số dư của bạn: …" của tấm xác nhận mua (hai nhãn trùng thì
          // trình đọc màn hình — và test tìm theo nhãn — không phân biệt được hai chỗ).
          <View
            accessibilityLabel={`Số dư hiện có: ${formatCoins(balance)}`}
            accessible
            className="flex-row items-center gap-sm rounded-md bg-bg-1 px-md py-sm"
          >
            <IconTile name="loyalty" size="sm" tone="accent" />
            <Text className="flex-1 text-body-md text-fg-2">Số dư của bạn</Text>
            <Text className="text-header-sm font-bold text-fg-1">{formatCoins(balance)}</Text>
          </View>
        ) : null}
        <Tabs
          items={SHOP_KIND_TABS}
          value={kind}
          variant="pill"
          onChange={(key) => {
            hapticSelection();
            setKind(key as ShopItemKind);
          }}
        />
        {body}
        <CoinsNote />
      </View>
      <PurchaseConfirmSheet
        error={buy.error}
        item={live}
        offline={offline}
        pending={buy.isPending}
        visible={sheetOpen && !gone}
        wallet={wallet.data}
        onClose={closeSheet}
        onConfirm={() => live && confirmBuy(live)}
        onOpenInventory={() => {
          closeSheet();
          router.push(COINS_INVENTORY_HREF);
        }}
      />
    </Screen>
  );
}
