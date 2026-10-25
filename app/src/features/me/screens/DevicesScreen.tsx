import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';

import { toErrorMessage } from '@/core/api/client.helpers';
import type { DeviceSummary } from '@/core/notifications';
import { useConnectionState } from '@/core/socket';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';

import { DeviceRow } from '../components/DeviceRow';
import {
  DEVICES_EMPTY_TITLE,
  DEVICES_REMOVE_DIALOG_DESCRIPTION,
  DEVICES_REMOVE_DIALOG_TITLE,
} from '../constants/notification.messages';
import { useDevices, useRemoveDevice } from '../hooks/useDevices';

/**
 * "Thiết bị nhận thông báo" (p0-06 `app.md` §3) — mở từ màn Thông báo. Liệt kê thiết bị đang có token
 * hoạt động của chính mình và cho gỡ từng thiết bị (`DELETE /me/devices/:deviceId`, thu hồi cả token FCM
 * lẫn VoIP của thiết bị đó). Cùng khuôn `SessionsScreen`.
 */
export function DevicesScreen() {
  const { data, error, isError, isLoading, isRefetching, refetch } = useDevices();
  const removeDevice = useRemoveDevice();
  const offline = useConnectionState() === 'offline';
  /** Thiết bị đang chờ NGƯỜI DÙNG xác nhận trong `Dialog` — `null` = hộp thoại đóng. */
  const [pendingRemove, setPendingRemove] = useState<DeviceSummary | null>(null);

  function closeDialog(): void {
    setPendingRemove(null);
  }

  function confirmRemove(): void {
    if (!pendingRemove) return;
    removeDevice.mutate(pendingRemove.deviceId, { onSuccess: closeDialog });
  }

  return (
    <Screen
      header={<AppBar title="Thiết bị nhận thông báo" onBack={router.back} />}
      refreshing={isRefetching}
      onRefresh={() => void refetch()}
    >
      <View className="gap-md py-xs">
        {isLoading ? (
          <Card>
            <SkeletonParagraphWithIcon />
            <SkeletonParagraphWithIcon />
          </Card>
        ) : isError ? (
          <EmptyState
            actions={[{ label: 'Thử lại', onPress: () => void refetch() }]}
            description={toErrorMessage(error)}
            icon="alert-warning"
            title="Không tải được danh sách thiết bị"
            tone="danger"
          />
        ) : !data || data.length === 0 ? (
          <EmptyState icon="phone" title={DEVICES_EMPTY_TITLE} tone="accent" />
        ) : (
          <Card className="gap-0" padded={false}>
            {data.map((device, index) => (
              <DeviceRow
                key={device.deviceId}
                device={device}
                divider={index < data.length - 1}
                isRemoving={removeDevice.isPending && removeDevice.variables === device.deviceId}
                offline={offline}
                onRemove={setPendingRemove}
              />
            ))}
          </Card>
        )}
      </View>

      <Dialog
        description={DEVICES_REMOVE_DIALOG_DESCRIPTION}
        primaryAction={{
          // Nhãn KHÁC nút "Gỡ" của hàng — cùng lý do `SessionsScreen` (trình đọc màn hình không phân biệt được).
          label: 'Xác nhận',
          loading: removeDevice.isPending,
          onPress: confirmRemove,
        }}
        secondaryAction={{ label: 'Huỷ', onPress: closeDialog }}
        title={DEVICES_REMOVE_DIALOG_TITLE}
        variant="warning"
        visible={pendingRemove !== null}
        onClose={closeDialog}
      />
    </Screen>
  );
}
