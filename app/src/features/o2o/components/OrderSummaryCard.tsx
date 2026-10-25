import { Linking, Text, View } from 'react-native';

import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { ListItem } from '@/shared/ui/list';
import { Section } from '@/shared/ui/section';
import { formatCurrency } from '@/shared/utils/format/currency.utils';
import { showToast } from '@/shared/utils/toast.utils';

import type { PrintOrderView } from '../api/o2o.types';
import { O2O_TONE } from '../constants/o2o.constants';
import { directionsUrl } from '../utils/geo';
import { paymentText, settingsSummary } from '../utils/order-summary';

/**
 * Tóm tắt đơn + tiệm (app.md §3 "Vé đơn": địa chỉ tiệm + chỉ đường): tên tệp, số trang, cấu hình, tổng tiền, cách thanh toán, và tiệm (tên, địa chỉ,
 * "Chỉ đường"). Tổng tiền lấy từ `quote` ĐÃ SNAPSHOT lúc gửi — tiệm đổi bảng giá sau đó không đổi số này (IR-15). Đơn nháp chưa có `quote` thì bỏ dòng tiền.
 */
export function OrderSummaryCard({ order }: { order: PrintOrderView }) {
  const { shop, quote } = order;
  const canNavigate = shop !== null && shop.lat !== null && shop.lng !== null;

  const openDirections = () => {
    if (!shop || shop.lat === null || shop.lng === null) return;
    Linking.openURL(directionsUrl({ lat: shop.lat, lng: shop.lng })).catch(() =>
      showToast('error', 'Không mở được ứng dụng bản đồ trên máy này.'),
    );
  };

  return (
    <View className="gap-xl">
      <Section icon="document-2" title="Đơn in">
        <Card>
          <ListItem divider label="Tệp" value={order.fileName} />
          {order.pages !== null ? (
            <ListItem divider label="Số trang" value={`${order.pages} trang`} />
          ) : null}
          <ListItem divider label="Cấu hình" value={settingsSummary(order.settings)} />
          {quote ? (
            <ListItem divider label="Tổng tiền" value={formatCurrency(quote.total)} />
          ) : null}
          <ListItem label="Thanh toán" value={paymentText(order.payment)} />
        </Card>
      </Section>
      {shop ? (
        <Section icon="store-location" title="Tiệm in">
          <Card>
            <View className="flex-row items-start gap-sm">
              <IconTile name="store-location" size="sm" tone={O2O_TONE} />
              <View className="flex-1 gap-2xs">
                <Text className="text-label-lg font-semibold text-fg-1">{shop.displayName}</Text>
                {shop.address ? (
                  <Text className="text-body-md text-fg-2">{shop.address}</Text>
                ) : null}
              </View>
            </View>
            {canNavigate ? (
              <View className="flex-row">
                <Button
                  iconLeft="navigation-map"
                  label="Chỉ đường"
                  size="sm"
                  variant="secondary"
                  onPress={openDirections}
                />
              </View>
            ) : null}
          </Card>
        </Section>
      ) : null}
    </View>
  );
}
