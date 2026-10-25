import { router } from 'expo-router';
import type { ReactNode } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Card } from '@/shared/ui/card';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Section } from '@/shared/ui/section';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticSelection } from '@/shared/utils/haptics';

import { InventoryRow } from '../components/InventoryRow';
import { SHOP_KIND_ICONS, SHOP_KIND_LABELS, SHOP_KINDS } from '../constants/coins.constants';
import { useInventory, useToggleEquip } from '../queries/inventory.queries';
import { COINS_SHOP_HREF } from '../utils/coins-routes';

/**
 * Kho đồ (app.md p7-02 §3): vật phẩm đã mua, nhóm theo loại (Khung · Giao diện · Emoji), trang bị/tháo — mỗi loại tối đa MỘT vật phẩm đang dùng (trang bị món
 * mới thì món cùng loại tự tháo, cập nhật lạc quan). Rỗng ⇒ mời ghé Cửa hàng; lỗi ⇒ "Thử lại"; mất mạng ⇒ khoá nút. Chỉ hiện nhóm CÓ vật phẩm.
 */
export function InventoryScreen() {
  const inventory = useInventory();
  const toggle = useToggleEquip();
  const offline = useConnectionState() === 'offline';
  const pendingId = toggle.isPending ? toggle.variables?.entry.id : undefined;
  const entries = inventory.data ?? [];

  let body: ReactNode;
  if (inventory.isLoading) {
    // Khung xương cùng dáng hàng thật (hình xem trước nhỏ + hai dòng chữ), trong thẻ như danh sách thật.
    body = (
      <Card>
        <SkeletonParagraphWithIcon />
        <SkeletonParagraphWithIcon />
      </Card>
    );
  } else if (inventory.isError && !inventory.data) {
    body = (
      <ScreenState
        action={{ label: 'Thử lại', onPress: () => void inventory.refetch() }}
        state={isNetworkError(inventory.error) ? 'offline' : 'error'}
        title="Không tải được kho đồ"
      />
    );
  } else if (entries.length === 0) {
    body = (
      <ScreenState
        action={{ label: 'Đến Cửa hàng', onPress: () => router.push(COINS_SHOP_HREF) }}
        description="Ghé Cửa hàng để chọn khung ảnh đại diện, giao diện hồ sơ hoặc gói emoji."
        icon="basket-01"
        state="empty"
        title="Chưa có vật phẩm"
      />
    );
  } else {
    body = (
      <View className="gap-xl">
        {SHOP_KINDS.map((kind) => {
          const group = entries.filter((entry) => entry.kind === kind);
          if (group.length === 0) return null;
          return (
            <Section key={kind} icon={SHOP_KIND_ICONS[kind]} title={SHOP_KIND_LABELS[kind]}>
              <Card className="gap-0" padded={false}>
                {group.map((entry, index) => (
                  <InventoryRow
                    key={entry.id}
                    divider={index < group.length - 1}
                    entry={entry}
                    offline={offline}
                    pending={pendingId === entry.id}
                    // Trang bị/tháo = đổi lựa chọn trong nhóm (mỗi loại một món) ⇒ nhịp "đổi lựa chọn", rung TRƯỚC `mutate`.
                    onToggle={(target, equip) => {
                      hapticSelection();
                      toggle.mutate({ entry: target, equip });
                    }}
                  />
                ))}
              </Card>
            </Section>
          );
        })}
        <Text className="text-caption-lg text-fg-2">
          Mỗi loại chỉ dùng được một vật phẩm cùng lúc.
        </Text>
      </View>
    );
  }

  return (
    <Screen
      header={<AppBar title="Kho đồ" onBack={router.back} />}
      refreshing={inventory.isRefetching}
      onRefresh={() => void inventory.refetch()}
    >
      <View className="py-xs">{body}</View>
    </Screen>
  );
}
