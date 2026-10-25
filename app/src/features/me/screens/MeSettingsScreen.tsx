import { router } from 'expo-router';
import { Text, View } from 'react-native';

import { ListItemDefaultsProvider } from '@/shared/ui/list';
import { AppBar } from '@/shared/ui/navigation';
import { Screen } from '@/shared/ui/screen';
import { Section } from '@/shared/ui/section';
import { useBiometricCapability } from '@/shared/hooks/useBiometricCapability';
import { useCapabilities, useFeature } from '@/shell/capabilities';
import { PATHS } from '@/shell/config';

import { BiometricSettingRow } from '../components/BiometricSettingRow';
import { EmailVerifyRow } from '../components/EmailVerifyRow';
import { MeNavGroup } from '../components/MeNavGroup';
import { MeNavRow } from '../components/MeNavRow';
import { PrivacySettingsCard } from '../components/PrivacySettingsCard';
import { ThemeModePicker } from '../components/ThemeModePicker';

/**
 * Cài đặt — thông báo, giao diện sáng/tối, bảo mật, quyền riêng tư, và (cuối cùng, tách riêng) xoá tài khoản.
 *
 * Màn con của tab "Tôi" (`app/(app)/me/settings.tsx`, đẩy tới qua
 * `router.push(PATHS.ME_SETTINGS)` từ `MeScreen`) — vì vậy có `onBack` chứ
 * không phải màn gốc của tab như `SettingsScreen` cũ.
 *
 * Cũng là bản kiểm tra nhanh cho hệ token: bấm đổi giữa ba lựa chọn, MỌI màu
 * trên màn hình phải đổi theo tức thì. Chỗ nào không đổi là chỗ đó viết màu
 * cứng thay vì dùng token.
 *
 * Mỗi thẻ hàng dùng `MeNavGroup` + `MeNavRow`/`MeToggleRow` (ô icon có tông, chữ thẳng cột); "Giao diện" là ba thẻ chọn ngang
 * có hình xem trước (`ThemeModePicker` — bộ icon của repo không có mặt trời/mặt trăng nên hình xem trước tự vẽ bằng `View`).
 */
export function MeSettingsScreen() {
  const { data: biometricCapability } = useBiometricCapability();
  const { data: capabilities } = useCapabilities();
  const biometricLoginEnabled = capabilities?.auth?.biometricLogin?.enabled ?? true;
  const integrationEnabled = useFeature('integration') === true;

  return (
    <Screen header={<AppBar title="Cài đặt" onBack={router.back} />}>
      {/*
       * Tiêu đề nhóm nằm NGOÀI thẻ (`Section`) — cùng cách màn Tôi — để tiêu đề nhóm và tiêu đề hàng trong thẻ không cùng một cỡ/màu. Thứ tự theo TẦN SUẤT dùng: thông báo → giao diện → bảo mật → riêng tư → nhà phát triển; việc phá huỷ (xoá tài
       * khoản) nằm RIÊNG ở cuối, không lẫn giữa các hàng bảo mật cùng kiểu. Mọi thẻ dùng chung `emphasis="title"` (tiêu đề
       * hàng là chữ chính, mô tả là chữ phụ).
       */}
      <ListItemDefaultsProvider emphasis="title">
        <View className="gap-xl py-xs">
          {/* `Section icon`: màn dài năm nhóm — icon nhỏ trước tiêu đề là mốc để mắt quét nhanh giữa các nhóm. */}
          <Section icon="noti" title="Thông báo và kết nối">
            <MeNavGroup>
              <MeNavRow
                description="Quyền thông báo, nội dung trên màn hình khoá và Không làm phiền"
                icon="notification"
                label="Thông báo"
                tone="brand"
                onPress={() => router.push(PATHS.ME_NOTIFICATIONS)}
              />
              {/* p5-03: nối Google Calendar cá nhân; ẩn khi cờ `integration` tắt (điều hướng bằng đường dẫn, không import feature). */}
              {integrationEnabled ? (
                <MeNavRow
                  description="Đưa cuộc họp bạn tham dự lên Google Calendar"
                  icon="calendar"
                  label="Google Calendar"
                  tone="info"
                  onPress={() => router.push('/me/integrations')}
                />
              ) : null}
            </MeNavGroup>
          </Section>

          <Section icon="magic-wand-01" title="Giao diện">
            {/* Chú thích nằm NGAY dưới ba thẻ nó giải thích. */}
            <View className="gap-xs">
              <ThemeModePicker />
              <Text className="text-caption-sm text-fg-2">
                &quot;Hệ thống&quot; đổi theo cài đặt sáng/tối của máy, kể cả lịch tự chuyển buổi
                tối.
              </Text>
            </View>
          </Section>

          <Section icon="xac-thuc" title="Bảo mật">
            <MeNavGroup>
              <MeNavRow
                description="Đổi mật khẩu và đăng xuất khỏi các thiết bị khác"
                icon="lock"
                label="Đổi mật khẩu"
                tone="warning"
                onPress={() => router.push(PATHS.ME_CHANGE_PASSWORD)}
              />
              <MeNavRow
                description="Xem và thu hồi các phiên đang đăng nhập trên thiết bị khác"
                icon="shield-user"
                label="Phiên đăng nhập"
                tone="info"
                onPress={() => router.push(PATHS.ME_SESSIONS)}
              />
              {/* Chỉ hiện khi email CHẮC CHẮN chưa xác minh (`user.emailVerified === false`) — tự trả `null` ở ca còn lại. */}
              <EmailVerifyRow />
              {/**
               * Hàng sinh trắc học chỉ hiện khi máy CÓ cảm biến vật lý VÀ BE
               * chưa tắt công tắc `auth.biometricLogin.enabled` —
               * `BiometricSettingRow` tự ẩn hàng của nó trong cả hai ca đó.
               * `undefined` (chưa tải xong) cố ý coi như "chưa hiện" — hàng
               * "Phiên đăng nhập" ở trên đã giữ card khỏi trống trong lúc chờ.
               */}
              {biometricCapability?.hasHardware && biometricLoginEnabled ? (
                <BiometricSettingRow />
              ) : null}
            </MeNavGroup>
          </Section>

          <PrivacySettingsCard onOpenBlocked={() => router.push(PATHS.ME_BLOCKED)} />

          {/*
           * Việc KHÔNG hoàn tác được: tách khỏi các hàng bảo mật ở trên, cuối màn, và là hàng ĐIỀU HƯỚNG (mở màn xoá có
           * cảnh báo + hộp xác nhận riêng) chứ không phải nút hành động — nên không thể nổi hơn "Đăng xuất" (khối đỏ đặc,
           * cao 56dp, ở màn Tôi). Ô icon + tiêu đề đỏ để không ai nhầm nó là một hàng cài đặt thường.
           */}
          <View className="gap-xs">
            <MeNavGroup>
              <MeNavRow
                danger
                description="Ẩn danh hoá tài khoản sau thời gian ân hạn, có thể huỷ bất cứ lúc nào."
                icon="delete"
                label="Xoá tài khoản"
                onPress={() => router.push(PATHS.ME_DELETE_ACCOUNT)}
              />
            </MeNavGroup>
          </View>
        </View>
      </ListItemDefaultsProvider>
    </Screen>
  );
}
