import { View } from 'react-native';

import { useConnectionState } from '@/core/socket';
import { Card } from '@/shared/ui/card';
import { Section } from '@/shared/ui/section';
import { Toggle } from '@/shared/ui/toggle';
import { hapticSelection } from '@/shared/utils/haptics';

import { useGamificationPrivacy } from '../hooks/useGamificationPrivacy';

/**
 * Thẻ "Riêng tư thành tích" (app.md p4-03 §3 `Privacy`): hai công tắc đổi TỨC THÌ (không có nút Lưu), mỗi công tắc có
 * mô tả HẬU QUẢ. Offline ⇒ khoá (đổi mà không tới được server sẽ lệch giữa các thiết bị).
 *
 * ⚠️ Vì sao nằm ở màn Thành tích chứ không ở `me/privacy` như app.md: `features/me` thuộc luồng p0-01 do nhóm khác giữ;
 * hook `useGamificationPrivacy` ghi cùng nguồn (`user.privacy`) nên có thể chuyển thẻ này sang màn Cài đặt mà không đổi gì.
 */
export function GamificationPrivacyCard() {
  const { isPending, showGamification, showInLeaderboard, update } = useGamificationPrivacy();
  const offline = useConnectionState() === 'offline';
  const disabled = isPending || offline;

  return (
    <Section icon="hide" title="Riêng tư thành tích">
      <Card>
        <View className="gap-md">
          {/* Rung "đổi lựa chọn" TRƯỚC khi gửi `PATCH` — phản hồi tức thì của cú chạm, không chờ mạng. */}
          <Toggle
            description="Tắt thì tên bạn biến mất khỏi bảng xếp hạng của các nhóm. Bạn vẫn xem được hạng của mình."
            disabled={disabled}
            label="Hiện tôi trong bảng xếp hạng nhóm"
            value={showInLeaderboard}
            onChange={(value) => {
              hapticSelection();
              update({ showInLeaderboard: value });
            }}
          />
          <Toggle
            description="Tắt thì thành viên cùng nhóm không mở được hồ sơ thành tích (cấp độ, huy hiệu trưng bày) của bạn."
            disabled={disabled}
            label="Cho thành viên nhóm xem cấp độ và huy hiệu"
            value={showGamification}
            onChange={(value) => {
              hapticSelection();
              update({ showGamification: value });
            }}
          />
        </View>
      </Card>
    </Section>
  );
}
