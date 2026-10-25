import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { Skeleton } from '@/shared/ui/skeleton';
import { isNetworkError, toErrorMessage } from '@/shared/utils/errors';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { OrderStatusHeader } from '../components/OrderStatusHeader';
import { OrderSummaryCard } from '../components/OrderSummaryCard';
import { OrderTimeline } from '../components/OrderTimeline';
import { OrderTicket } from '../components/OrderTicket';
import { usePinVault } from '../hooks/usePinVault';
import { useCancelPrintOrder, useRegeneratePin } from '../queries/print.mutations';
import { usePrintOrder } from '../queries/print.queries';
import { isNotAvailable, o2oErrorMessage } from '../utils/o2o-errors';
import { newOrderHref } from '../utils/o2o-routes';
import { isDraftStatus, isPinLive } from '../utils/order-status';

/**
 * Vé đơn (app.md §3): trạng thái LỚN bằng chữ (realtime qua `print-order:updated`), PIN + QR, tiến trình, tóm tắt đơn + tiệm, "Huỷ đơn".
 * Nút "Huỷ đơn" theo `myActions.canCancel` do SERVER tính (PENDING/ACCEPTED; ẩn khi đang in) — app không tự suy. Đơn nháp thì mời "Tiếp tục đặt in".
 * PIN đọc từ kho khoá; đơn kết thúc ⇒ PIN bị xoá (xem `usePinVault`). Bấm "Huỷ" lúc đơn vừa sang bước khác → `O2O_004` + tải lại đơn cho khớp thực tế.
 */
export function PrintOrderTicketScreen() {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  const query = usePrintOrder(orderId);
  const order = query.data;
  const pin = usePinVault(orderId, order ? isPinLive(order.status) : undefined);
  const regenerate = useRegeneratePin();
  const cancel = useCancelPrintOrder();
  const [confirming, setConfirming] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const header = <AppBar title={order?.code ?? 'Đơn in'} onBack={router.back} />;

  if (query.isPending) {
    return (
      <Screen header={header}>
        <View className="gap-xl py-xs">
          <Skeleton className="h-24 rounded-md" />
          <Skeleton className="h-72 rounded-md" />
        </View>
      </Screen>
    );
  }

  if (query.isError || !order) {
    return (
      <Screen header={header}>
        {isNotAvailable(query.error) ? (
          // 404 trung tính (không có / không phải của bạn) ⇒ tông `warning` như mọi ca "không còn quyền xem"; không có "Thử lại".
          <EmptyState
            description="Đơn không tồn tại hoặc không phải của bạn."
            icon="document-2"
            title="Không tìm thấy đơn in"
            tone="warning"
          />
        ) : (
          <ScreenState
            action={{ label: 'Thử lại', onPress: () => void query.refetch() }}
            description={toErrorMessage(query.error)}
            state={isNetworkError(query.error) ? 'offline' : 'error'}
          />
        )}
      </Screen>
    );
  }

  const draft = isDraftStatus(order.status);
  const onError = (error: unknown) => {
    setActionError(o2oErrorMessage(error));
    void query.refetch(); // Lỗi trạng thái (`O2O_004`) nghĩa là đơn đã đổi ở nơi khác — kéo về bản thật để nút hiện đúng.
  };

  return (
    <Screen header={header} refreshing={query.isRefetching} onRefresh={() => void query.refetch()}>
      <View className="gap-xl py-xs">
        <OrderStatusHeader order={order} />
        {draft ? (
          <Alert
            actions={
              <Button
                label="Tiếp tục đặt in"
                size="sm"
                variant="secondary"
                onPress={() =>
                  router.replace(newOrderHref({ shopId: order.shopId, orderId: order.id }))
                }
              />
            }
            description="Đơn này chưa được gửi cho tiệm."
            tone="info"
          />
        ) : null}
        {isPinLive(order.status) ? (
          <OrderTicket
            canRegenerate={order.myActions.canRegeneratePin}
            code={order.code}
            pin={pin.pin}
            pinReady={pin.ready}
            regenerating={regenerate.isPending}
            onRegenerate={() => {
              setActionError(null);
              regenerate.mutate(order.id, {
                onSuccess: ({ pin: fresh }) => {
                  pin.setPin(fresh);
                  hapticSuccess();
                  showToast('success', 'Đã tạo mã PIN mới. Mã cũ không còn dùng được.');
                },
                onError,
              });
            }}
          />
        ) : null}
        <OrderTimeline order={order} />
        <OrderSummaryCard order={order} />
        {actionError ? <Alert description={actionError} tone="error" /> : null}
        {order.myActions.canCancel ? (
          <Button
            fullWidth
            label={draft ? 'Bỏ đơn nháp' : 'Huỷ đơn'}
            variant="tertiary"
            onPress={() => setConfirming(true)}
          />
        ) : null}
      </View>

      <Dialog
        description="Tiệm sẽ không in tài liệu này nữa. Bạn vẫn có thể đặt lại sau."
        primaryAction={{
          label: draft ? 'Bỏ đơn' : 'Huỷ đơn',
          loading: cancel.isPending,
          onPress: () => {
            setActionError(null);
            cancel.mutate(
              { orderId: order.id },
              {
                onSuccess: () => {
                  setConfirming(false);
                  showToast('success', 'Đã huỷ đơn.');
                },
                onError: (error) => {
                  setConfirming(false);
                  onError(error);
                },
              },
            );
          },
        }}
        secondaryAction={{ label: 'Giữ đơn', onPress: () => setConfirming(false) }}
        title={draft ? 'Bỏ đơn nháp?' : `Huỷ đơn ${order.code}?`}
        variant="warning"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </Screen>
  );
}
