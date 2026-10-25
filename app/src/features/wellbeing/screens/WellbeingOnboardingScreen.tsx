import { Redirect, router } from 'expo-router';
import { Text, View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { Card } from '@/shared/ui/card';
import { ModuleBanner } from '@/shared/ui/banner';
import { Reveal } from '@/shared/ui/motion';
import { AppBar, BottomActionBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { hapticSuccess } from '@/shared/utils/haptics';
import { showToast } from '@/shared/utils/toast.utils';

import { PrivacyPoints } from '../components/PrivacyPoints';
import { WellbeingLoadState } from '../components/WellbeingLoadState';
import { NOT_MEDICAL_NOTE } from '../constants/wellbeing-copy.constants';
import { useUpdateWellbeing } from '../queries/wellbeing.mutations';
import { useWellbeingSetting } from '../queries/wellbeing.queries';
import { WELLBEING_HREF } from '../utils/wellbeing-routes';
import { wellbeingErrorMessage } from '../utils/wellbeing-errors';

/**
 * Giải thích + ĐỒNG Ý bật (app.md p7-03 §3 "Onboarding"). Đây là dữ liệu về sức khoẻ nên mặc định TẮT và chỉ bật khi người dùng bấm nút rõ ràng ở cuối — không có ô tick
 * sẵn, không bật ngầm, không nhắc lại liên tục nếu chọn "Để sau". Nói TRƯỚC khi bật: ghi gì, ai KHÔNG thấy, giữ bao lâu, tắt/xoá bất cứ lúc nào (`PRIVACY_POINTS`); đây không phải chẩn đoán y tế.
 *
 * Đã bật rồi (mở lại màn này từ liên kết cũ, hoặc vừa bật xong) ⇒ chuyển sang màn Sức khoẻ bằng `<Redirect>` — dựa vào cache cài đặt nên nút "Đồng ý và bật" thành công là tự chuyển,
 * không cần `router.replace` thứ hai. Offline ⇒ khoá nút (đổi cài đặt mà không tới server thì thiết bị lệch nhau).
 */
export function WellbeingOnboardingScreen() {
  const setting = useWellbeingSetting();
  const update = useUpdateWellbeing();
  const offline = useConnectionState() === 'offline';
  const header = <AppBar title="Theo dõi sức khoẻ học tập" onBack={router.back} />;

  if (setting.data?.enabled) return <Redirect href={WELLBEING_HREF} />;
  if (setting.isLoading || (setting.isError && !setting.data)) {
    return (
      <WellbeingLoadState
        error={setting.error}
        header={header}
        isLoading={setting.isLoading}
        onRetry={() => void setting.refetch()}
      />
    );
  }

  const enable = async (): Promise<void> => {
    try {
      await update.mutateAsync({ optIn: true });
      hapticSuccess();
      showToast('success', 'Đã bật theo dõi. Bạn có thể tắt bất cứ lúc nào.');
    } catch (error) {
      showToast('error', wellbeingErrorMessage(error));
    }
  };

  const footer = (
    <BottomActionBar>
      <Button
        disabled={offline}
        fullWidth
        label="Đồng ý và bật theo dõi"
        loading={update.isPending}
        onPress={() => void enable()}
      />
      <Button
        disabled={update.isPending}
        fullWidth
        label="Để sau"
        variant="tertiary"
        onPress={router.back}
      />
    </BottomActionBar>
  );

  return (
    <Screen footer={footer} header={header}>
      {/* Khe 24 giữa các khối; banner + sáu điều cần biết hiện dần lệch nhịp (`Reveal`, tự tắt khi "Giảm chuyển động") — nút
          đồng ý ở thanh đáy KHÔNG bọc, bấm được ngay. */}
      <View className="gap-xl py-xs">
        <Reveal>
          <ModuleBanner
            description="Nhận ra khi mình quá sức và được nhắc nghỉ đúng lúc. Mặc định TẮT, chỉ chạy khi bạn đồng ý."
            icon="favorite"
            title="Chăm sóc nhịp học tập của bạn"
            tone="success"
          />
        </Reveal>
        <Reveal index={1}>
          <Section icon="hide" title="Trước khi bật, bạn nên biết">
            <Card>
              <PrivacyPoints />
            </Card>
          </Section>
        </Reveal>
        <Alert description={NOT_MEDICAL_NOTE} tone="info" />
        {offline ? (
          <Text className="text-center text-body-md text-fg-2">
            Đang ngoại tuyến — cần có mạng để bật theo dõi.
          </Text>
        ) : null}
      </View>
    </Screen>
  );
}
