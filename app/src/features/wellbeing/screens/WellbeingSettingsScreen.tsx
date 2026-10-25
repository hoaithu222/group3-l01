import { router } from 'expo-router';
import { useState } from 'react';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { EmptyState } from '@/shared/ui/empty-state';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';
import { PATHS } from '@/shell/config';

import { DeleteDataDialog } from '../components/DeleteDataDialog';
import { PreferredBreakCard } from '../components/PreferredBreakCard';
import { PrivacyPoints } from '../components/PrivacyPoints';
import { ShareWithWorkspaceList } from '../components/ShareWithWorkspaceList';
import { TurnOffDialog } from '../components/TurnOffDialog';
import { WellbeingLoadState } from '../components/WellbeingLoadState';
import { useSetAlertsEnabled } from '../queries/wellbeing.mutations';
import { useWellbeingSetting } from '../queries/wellbeing.queries';
import { isNotEnabled, wellbeingErrorMessage } from '../utils/wellbeing-errors';
import { WELLBEING_ONBOARDING_HREF } from '../utils/wellbeing-routes';

/**
 * Cài đặt theo dõi (app.md p7-03 §3 "Cài đặt"): công tắc bật/tắt (TẮT ⇒ hộp thoại xác nhận rồi xoá hết), công tắc "Nhắc nhẹ", giờ làm/nghỉ mong muốn (P1), chia sẻ mức với trưởng nhóm (P1),
 * xoá dữ liệu mà vẫn giữ theo dõi, và nhắc lại quyền riêng tư.
 * Công tắc "Theo dõi" là CÓ ĐIỀU KIỆN: gạt sang tắt không đổi ngay mà mở `TurnOffDialog` — giá trị chỉ đổi khi cache cài đặt đổi (sau khi BE đã xoá). Offline ⇒ khoá mọi điều khiển (đổi mà không
 * tới server thì thiết bị lệch nhau). Đang TẮT (mở bằng liên kết cũ, hoặc vừa tắt ở máy khác) ⇒ trạng thái "đang tắt" kèm đường bật lại, KHÔNG `<Redirect>`: sau khi tắt xong màn tự rời về
 * màn Tôi (`router.dismissTo`) và một Redirect tranh nhau điều hướng với nó.
 */
export function WellbeingSettingsScreen() {
  const setting = useWellbeingSetting();
  const setAlerts = useSetAlertsEnabled();
  const offline = useConnectionState() === 'offline';
  const [dialog, setDialog] = useState<'delete' | 'off' | null>(null);
  const header = <AppBar title="Cài đặt theo dõi" onBack={router.back} />;

  if (!setting.data) {
    return (
      <WellbeingLoadState
        error={setting.error}
        header={header}
        isLoading={setting.isLoading || !setting.isError}
        onRetry={() => void setting.refetch()}
      />
    );
  }

  if (!setting.data.enabled) {
    return (
      <Screen header={header} scrollable={false}>
        <EmptyState
          actions={[
            {
              label: 'Xem giải thích và bật',
              onPress: () => router.replace(WELLBEING_ONBOARDING_HREF),
            },
            { label: 'Quay lại', onPress: router.back, variant: 'tertiary' },
          ]}
          description="Ứng dụng không thu thập hay lưu số liệu sức khoẻ học tập của bạn. Bạn có thể bật lại bất cứ lúc nào."
          fullscreen
          icon="favorite"
          title="Theo dõi đang tắt"
          tone="neutral"
        />
      </Screen>
    );
  }

  const changeAlerts = async (value: boolean): Promise<void> => {
    try {
      await setAlerts.mutateAsync(value);
    } catch (error) {
      if (isNotEnabled(error)) {
        showToast('info', 'Theo dõi đã được tắt ở thiết bị khác');
        return;
      }
      showToast('error', wellbeingErrorMessage(error));
    }
  };

  // Tiêu đề nhóm nằm NGOÀI thẻ (`Section`, khe 12 xuống thẻ, khe 24 giữa các nhóm — `screen-layout.md`) và có icon mốc: màn
  // cài đặt dài năm nhóm, mắt quét theo icon nhanh hơn theo chữ. Bản trước đặt tiêu đề TRONG thẻ (`Card title`) lệch khuôn
  // với mọi màn Cài đặt khác.
  return (
    <Screen header={header}>
      <View className="gap-xl py-xs">
        <Section icon="analytics-02" title="Theo dõi">
          <Card>
            <View className="gap-md">
              <Toggle
                description="Đang bật. Tắt để ngừng thu thập và xoá toàn bộ số liệu đã có."
                disabled={offline}
                label="Theo dõi sức khoẻ học tập"
                value
                onChange={(value) => {
                  if (!value) setDialog('off');
                }}
              />
              <Toggle
                description="Tối đa một lần mỗi ngày. Thông báo trên màn hình khoá không nêu mức đánh giá."
                disabled={offline || setAlerts.isPending}
                label="Nhắc nhẹ khi cần nghỉ"
                value={setting.data.alertsEnabled}
                onChange={(value) => {
                  hapticSelection();
                  void changeAlerts(value);
                }}
              />
            </View>
          </Card>
        </Section>
        <Section icon="clock" title="Giờ làm/nghỉ mong muốn">
          <Card>
            <PreferredBreakCard disabled={offline} value={setting.data.preferredBreak} />
          </Card>
        </Section>
        <Section icon="share" title="Chia sẻ với trưởng nhóm">
          <Card>
            <ShareWithWorkspaceList disabled={offline} />
          </Card>
        </Section>
        <Section icon="document" title="Dữ liệu của bạn">
          <Card>
            <View className="gap-md">
              <Text className="text-body-md text-fg-2">
                Xoá số liệu và đánh giá đã thu thập mà vẫn giữ theo dõi. Ứng dụng sẽ thu thập lại từ
                bây giờ.
              </Text>
              <Button
                disabled={offline}
                fullWidth
                iconLeft="delete"
                label="Xoá dữ liệu đã thu thập"
                variant="danger-secondary"
                onPress={() => setDialog('delete')}
              />
            </View>
          </Card>
        </Section>
        <Section icon="hide" title="Quyền riêng tư của bạn">
          <Card>
            <PrivacyPoints />
          </Card>
        </Section>
        {offline ? (
          <Text className="pb-md text-center text-body-md text-fg-2">
            Đang ngoại tuyến — cần có mạng để đổi cài đặt.
          </Text>
        ) : null}
      </View>
      <TurnOffDialog
        visible={dialog === 'off'}
        onClose={() => setDialog(null)}
        onDone={() => {
          setDialog(null);
          router.dismissTo(PATHS.ME);
        }}
      />
      <DeleteDataDialog visible={dialog === 'delete'} onClose={() => setDialog(null)} />
    </Screen>
  );
}
