import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { IconTile } from '@/shared/ui/icon-tile';
import { Dialog } from '@/shared/ui/modal';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { ScreenState } from '@/shared/ui/screen-state';
import { SkeletonParagraphWithIcon } from '@/shared/ui/skeleton';
import { isNetworkError } from '@/shared/utils/errors';
import { hapticSuccess } from '@/shared/utils/haptics';

import { integrationsService } from '../api/integrations.service';
import { useConnectProvider } from '../hooks/useConnectProvider';
import {
  useDisconnectCalendar,
  useIntegrationProviders,
  useMyIntegrations,
} from '../queries/integrations.queries';
import { callbackErrorText, PROVIDER_ART, statusReasonText } from '../utils/integration-labels';

/** Kết quả một lượt nối — `ok` chọn dáng hộp thoại (thành công có dấu tích, lỗi có dấu cảnh báo) chứ không chỉ khác câu chữ. */
interface ConnectMessage {
  ok: boolean;
  text: string;
}

/**
 * Cài đặt cá nhân "Lịch" (app.md §3): nối Google Calendar của CHÍNH mình — cuộc họp mình tham dự được đẩy MỘT CHIỀU lên lịch Google. Đã nối →
 * hiện email + Ngắt; bị thu hồi (`REVOKED`, `INT_010`) → "Kết nối bị thu hồi — nối lại". Nhà cung cấp chưa bật → giải thích, không có nút.
 *
 * Giao diện: thẻ có ô icon lịch (`media` của `Card`, cùng `PROVIDER_ART` với Marketplace), dòng "Đã nối" có dấu tích; lỗi mạng nói rõ là
 * lỗi KẾT NỐI (`ScreenState offline`); nối xong rung "xong" + hộp thoại dáng thành công.
 */
export function PersonalIntegrationsScreen() {
  const providers = useIntegrationProviders();
  const mine = useMyIntegrations();
  const disconnect = useDisconnectCalendar();
  const { connect, pending } = useConnectProvider();
  const offline = useConnectionState() === 'offline';
  const [message, setMessage] = useState<ConnectMessage | null>(null);
  const [confirming, setConfirming] = useState(false);

  const google = providers.data?.find((p) => p.provider === 'GOOGLE_CALENDAR');
  const link = mine.data?.find((u) => u.provider === 'GOOGLE_CALENDAR');
  const revoked = link?.status === 'REVOKED' || link?.status === 'ERROR';
  const art = PROVIDER_ART.GOOGLE_CALENDAR;

  async function handleConnect(): Promise<void> {
    const outcome = await connect(() => integrationsService.connectCalendar()).catch(() => null);
    if (!outcome || outcome.status === 'cancelled') return;
    if (outcome.status === 'ok') {
      hapticSuccess();
      setMessage({
        ok: true,
        text: 'Đã nối Google Calendar. Các cuộc họp sắp tới sẽ xuất hiện trong lịch của bạn.',
      });
      return;
    }
    setMessage({ ok: false, text: callbackErrorText(outcome.code) });
  }

  return (
    <Screen header={<AppBar title="Lịch" onBack={router.back} />}>
      <View className="gap-md py-xs">
        {providers.isLoading || mine.isLoading ? (
          <Card>
            <SkeletonParagraphWithIcon />
          </Card>
        ) : providers.isError || mine.isError ? (
          <ScreenState
            action={{
              label: 'Thử lại',
              onPress: () => void Promise.all([providers.refetch(), mine.refetch()]),
            }}
            state={isNetworkError(providers.error ?? mine.error) ? 'offline' : 'error'}
            title="Không tải được cài đặt lịch"
          />
        ) : (
          <Card media={<IconTile name={art.icon} tone={art.tone} />} title="Google Calendar">
            <View className="gap-sm">
              <Text className="text-body-md text-fg-2">
                Cuộc họp bạn tham dự sẽ được thêm vào Google Calendar; đổi giờ hoặc huỷ họp sẽ tự
                cập nhật.
              </Text>
              {revoked ? (
                <Alert
                  description={statusReasonText(link?.statusReason ?? null)}
                  title="Kết nối bị thu hồi — nối lại"
                  tone="warning"
                />
              ) : null}
              {link && !revoked ? (
                <View className="flex-row items-center gap-sm">
                  <IconTile name="checkmark-circle" size="sm" tone="success" />
                  <Text className="flex-1 text-label-md text-fg-1">
                    Đã nối: {link.accountLabel}
                  </Text>
                </View>
              ) : null}
              {!google?.available ? (
                <Text className="text-caption-sm text-fg-2">
                  Tính năng nối Google Calendar chưa được bật trên hệ thống.
                </Text>
              ) : !link || revoked ? (
                <Button
                  disabled={offline || pending}
                  iconLeft="link"
                  label={revoked ? 'Nối lại Google Calendar' : 'Nối Google Calendar'}
                  loading={pending}
                  onPress={() => void handleConnect()}
                />
              ) : null}
              {link ? (
                <Button
                  disabled={offline}
                  iconLeft="unlink"
                  label="Ngắt kết nối"
                  variant="danger-secondary"
                  onPress={() => setConfirming(true)}
                />
              ) : null}
            </View>
          </Card>
        )}
      </View>
      <Dialog
        description={message?.text ?? ''}
        primaryAction={{ label: 'Đã hiểu', onPress: () => setMessage(null) }}
        title="Google Calendar"
        variant={message?.ok === false ? 'warning' : 'success'}
        visible={message !== null}
        onClose={() => setMessage(null)}
      />
      <Dialog
        description="Các cuộc họp sắp tới sẽ được gỡ khỏi Google Calendar của bạn; lịch sử đã qua được giữ nguyên."
        primaryAction={{
          label: 'Ngắt kết nối',
          loading: disconnect.isPending,
          onPress: () =>
            link && disconnect.mutate(link.id, { onSuccess: () => setConfirming(false) }),
        }}
        secondaryAction={{ label: 'Huỷ', onPress: () => setConfirming(false) }}
        title="Ngắt Google Calendar?"
        variant="warning"
        visible={confirming}
        onClose={() => setConfirming(false)}
      />
    </Screen>
  );
}
