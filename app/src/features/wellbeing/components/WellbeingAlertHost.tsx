import { router } from 'expo-router';
import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SPACING } from '@/shared/theme';

import { useWellbeingAlertHost } from '../hooks/useWellbeingAlertHost';
import { WELLBEING_HREF } from '../utils/wellbeing-routes';
import { WellbeingAlertCard } from './WellbeingAlertCard';

/**
 * Lớp TOÀN CỤC hiện thẻ cảnh báo mềm trên MỌI màn của phần đã đăng nhập (app.md p7-03 §2 `useWellbeingAlertListener`). Mount MỘT lần ở `app/(app)/_layout.tsx`, SAU `Tabs`
 * để vẽ đè lên trên; cờ `burnout` tắt ⇒ không nghe socket, không gọi API, không hiện gì. Đăng xuất là unmount ⇒ không còn gì trong bộ nhớ của host.
 *
 * Nằm sát mép trên như banner tin nhắn, nhưng KHÔNG chặn cảm ứng phần còn lại của màn (`box-none`) — người đang gõ tin không bị cướp tiêu điểm. Không hoạt cảnh nên tôn trọng
 * "giảm chuyển động" mặc nhiên. ⛔ Vùng an toàn đủ BỐN chiều, lề 16 CỘNG với inset (style nội tuyến ĐÈ class chứ không cộng) — cùng lý do `InAppMessageBannerHost`.
 */
export function WellbeingAlertHost() {
  const { alert, busy, dismiss, hide, snooze } = useWellbeingAlertHost();
  const insets = useSafeAreaInsets();
  if (!alert) return null;

  return (
    <View
      className="absolute left-0 right-0 top-0"
      pointerEvents="box-none"
      style={{
        paddingLeft: insets.left + SPACING.md,
        paddingRight: insets.right + SPACING.md,
        paddingTop: insets.top + SPACING.xs,
      }}
    >
      {/* Máy tính bảng: thẻ kẹp 720dp (cùng trần cột nội dung), canh giữa — trải cả 1000dp thì một câu nhắc thành một dải chữ
          dài khó đọc. */}
      <View className="w-full tablet:max-w-content tablet:self-center">
        <WellbeingAlertCard
          alert={alert}
          busy={busy}
          onClose={hide}
          onDismiss={dismiss}
          onOpen={() => router.push(WELLBEING_HREF)}
          onSnooze={snooze}
        />
      </View>
    </View>
  );
}
