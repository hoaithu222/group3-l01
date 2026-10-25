import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { IconTile } from '@/shared/ui/icon-tile';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { formatCurrency } from '@/shared/utils/format/currency.utils';
import { hapticTap } from '@/shared/utils/haptics';

import { FileSourcePicker } from '../components/FileSourcePicker';
import { PrintSettingsForm } from '../components/PrintSettingsForm';
import { QuoteSummary } from '../components/QuoteSummary';
import { ResourcePickerSheet } from '../components/ResourcePickerSheet';
import { ShopPicker } from '../components/ShopPicker';
import { O2O_TONE } from '../constants/o2o.constants';
import { usePrintConfigurator } from '../hooks/usePrintConfigurator';
import { isCountingPages } from '../utils/order-status';
import type { NewOrderParams } from '../utils/o2o-routes';
import { isNotAvailable } from '../utils/o2o-errors';

/**
 * Cấu hình đơn in (app.md §3): tiệm → tệp → cấu hình → báo giá → gửi. Tham số route (`NewOrderParams`): `shopId` (từ chi tiết địa điểm), `resourceId`
 * (từ Resource Hub "In tài liệu"), `orderId` (mở lại đơn nháp). Thiếu `shopId` thì hiện bộ chọn tiệm ngay trong màn.
 *
 * Gửi đơn thành công → `router.replace` sang màn vé (trong `usePrintConfigurator`). Khoá nút gửi khi: đang đếm trang, cấu hình lỗi, báo giá chưa chốt,
 * mất mạng — người dùng luôn thấy VÌ SAO chưa gửi được (dòng cảnh báo phía trên), không phải nút xám không lời giải thích.
 */
export function PrintOrderConfiguratorScreen() {
  const params = useLocalSearchParams<NewOrderParams>();
  const [picked, setPicked] = useState<{ id: string; name: string } | null>(null);
  const [pickingResource, setPickingResource] = useState(false);
  const shopId = params.shopId ?? picked?.id;
  const cfg = usePrintConfigurator({
    shopId,
    resource: params.resourceId
      ? { id: params.resourceId, name: params.resourceName ?? 'Tài liệu nhóm' }
      : null,
    orderId: params.orderId,
  });
  const order = cfg.order.data;
  const shop = cfg.shop.data;
  const shopName = shop?.displayName ?? picked?.name ?? params.locationName ?? 'Tiệm in';
  const fileName = cfg.source?.name ?? order?.fileName ?? null;
  const counting = order ? isCountingPages(order) : cfg.orderId !== undefined;

  const header = <AppBar title="Đặt in tài liệu" onBack={router.back} />;

  if (!shopId) {
    return (
      <Screen header={header}>
        <View className="py-xs">
          <ShopPicker onPick={setPicked} />
        </View>
      </Screen>
    );
  }

  if (cfg.shop.isPending) {
    return (
      <Screen header={header}>
        <View className="gap-md py-xs">
          <Skeleton className="h-16 rounded-md" />
          <Skeleton className="h-32 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (cfg.shop.isError) {
    return (
      <Screen header={header}>
        {isNotAvailable(cfg.shop.error) ? (
          // 404 = tiệm không còn ⇒ tông `warning` (quy ước "không còn/mất quyền"), không có "Thử lại" (thử lại vẫn 404).
          <EmptyState
            description="Tiệm này chưa mở nhận đơn hoặc không còn hoạt động. Hãy chọn tiệm khác."
            icon="store-location"
            title="Tiệm không còn khả dụng"
            tone="warning"
          />
        ) : (
          <ScreenState
            action={{ label: 'Thử lại', onPress: () => void cfg.shop.refetch() }}
            description="Không tải được thông tin tiệm in. Kiểm tra kết nối rồi thử lại."
            state={isNetworkError(cfg.shop.error) ? 'offline' : 'error'}
          />
        )}
      </Screen>
    );
  }

  const paused = shop?.acceptingOrders === false;
  const total = cfg.quote ? formatCurrency(cfg.quote.total) : null;

  return (
    <Screen
      footer={
        <BottomActionBar>
          <Button
            disabled={!cfg.canSubmit || paused}
            fullWidth
            label={
              cfg.isOnline ? (total ? `Gửi đơn · ${total}` : 'Gửi đơn') : 'Kết nối lại để gửi đơn'
            }
            loading={cfg.submitting}
            onPress={() => {
              hapticTap();
              void cfg.send();
            }}
          />
        </BottomActionBar>
      }
      header={header}
      keyboardAware
    >
      <View className="gap-xl py-xs">
        {/* Đầu màn: tiệm đang đặt — ô icon cùng tông phân hệ (`O2O_TONE`) để nhận ra ngay "đang đặt in ở đâu". */}
        <View className="flex-row items-center gap-sm">
          <IconTile name="store-location" size="lg" tone={O2O_TONE} />
          <View className="flex-1 gap-2xs">
            <Text className="text-header-sm font-semibold text-fg-1">{shopName}</Text>
            <Text className="text-body-md text-fg-2">Thanh toán tại quầy khi nhận tài liệu.</Text>
          </View>
        </View>
        {paused ? (
          <Alert
            description="Tiệm đang tạm ngưng nhận đơn. Hãy chọn tiệm khác hoặc thử lại sau."
            tone="warning"
          />
        ) : null}
        <FileSourcePicker
          counting={counting}
          createError={cfg.createError}
          creating={cfg.creating}
          fileName={fileName}
          fileProblem={cfg.fileProblem}
          pages={cfg.pages}
          upload={cfg.upload}
          onChangeFile={cfg.changeFile}
          onPickResource={() => setPickingResource(true)}
          onRetryCreate={cfg.retryCreate}
        />
        {fileName ? (
          <>
            <PrintSettingsForm
              capabilities={shop?.capabilities}
              disabled={paused || cfg.submitting}
              pickup={cfg.pickup}
              rangeError={cfg.rangeError}
              settings={cfg.settings}
              onChange={cfg.setSettings}
              onPickupChange={cfg.setPickup}
            />
            <QuoteSummary
              busy={cfg.quoteBusy}
              copies={cfg.settings.copies}
              error={cfg.settingsError}
              quote={cfg.quote}
              waitingForPages={cfg.pages === null && !cfg.fileProblem}
            />
          </>
        ) : null}
        {cfg.submitError ? <Alert description={cfg.submitError} tone="error" /> : null}
      </View>
      <ResourcePickerSheet
        visible={pickingResource}
        onClose={() => setPickingResource(false)}
        onPick={cfg.pickResource}
      />
    </Screen>
  );
}
