import { useContext } from 'react';
import { Text, View } from 'react-native';
import { SafeAreaInsetsContext } from 'react-native-safe-area-context';

import { SPACING } from '@/shared/theme';
import { Avatar } from '@/shared/ui/avatar';
import { Button } from '@/shared/ui/button';
import { Icon } from '@/shared/ui/icon';

export interface MeetingMiniBarProps {
  /** Đồng hồ thời lượng đã định dạng ("12:34") — cha tính theo giờ SERVER. */
  clock: string;
  micOn: boolean;
  /** p2-06: đang ghi hình → "● Đang ghi" ngay trên thanh (RR-19 — cả khi thu nhỏ); `consent` = đang có câu hỏi đồng ý chờ trả lời trong phòng. */
  recording?: 'consent' | 'recording' | null;
  /** Người đang nói (nếu cha biết) — avatar thay ô máy quay và "Đang nói: X" trong nhãn trợ năng. Vắng ⇒ ô máy quay xanh "đang họp". */
  speakerName?: string | null;
  title: string;
  /** Có ⇒ thêm nút đỏ "Rời cuộc họp" (cha tự quyết hỏi xác nhận hay mở lại phòng). Vắng ⇒ chỉ mic + "Quay lại". */
  onLeave?: () => void;
  /** Quay lại màn phòng họp. */
  onReturn: () => void;
  onToggleMic: () => void;
}

/**
 * Thanh toàn app khi người dùng THU NHỎ phòng họp (app.md p2-05 §3.2 `MeetingMiniBar`): viên thuốc TỐI (mảnh của phòng họp, cùng nền mực
 * với sân khấu) — ô "đang họp"/avatar người nói, tên cuộc họp, "Đang họp · đồng hồ · Mic bật/tắt", nút mic, [Rời], "Quay lại". Media vẫn
 * chạy ở controller — thanh này chỉ là mặt tiền; trạng thái mic có CHỮ (không chỉ màu nút).
 *
 * ✅ Tự né thanh trạng thái (`insets.top`): nơi gắn (`MeetingRoomHost` trong `app/(app)/_layout.tsx`) đặt thanh ở ĐẦU cây, trên cả `AppBar`
 * — bản cũ không đệm nên chữ nằm dưới đồng hồ/pin/tai thỏ. Đọc context trực tiếp (không `useSafeAreaInsets`, hook đó NÉM khi thiếu provider).
 * ✅ Màu CỐ ĐỊNH theo phòng (`bg-ink-5` + `fg-on-nav` + nút `white*`/`danger`): bản cũ nền `action-success` — ở chế độ tối nó thành xanh
 * NHẠT, nút mic viền trắng trên đó gần như biến mất.
 * ⚠️ Khối chữ là MỘT ô trợ năng ("Cuộc họp X, đang diễn ra, 12:34, mic tắt"); các nút là ô rời, mỗi nút ≥ 44dp (`size="sm"` + `hitSlop`).
 */
export function MeetingMiniBar({
  clock,
  micOn,
  recording = null,
  speakerName = null,
  title,
  onLeave,
  onReturn,
  onToggleMic,
}: MeetingMiniBarProps) {
  const insets = useContext(SafeAreaInsetsContext);
  const mic = micOn ? 'Mic bật' : 'Mic tắt';
  const rec = recording === 'recording' ? '● Đang ghi' : recording === 'consent' ? 'Cần trả lời về ghi hình' : null;
  const status = ['Đang họp', clock, mic, rec].filter(Boolean).join(' · ');
  const spoken = [
    `Cuộc họp ${title}`,
    'đang diễn ra',
    clock,
    mic.toLowerCase(),
    rec ? rec.replace('● ', '').toLowerCase() : null,
    speakerName ? `đang nói: ${speakerName}` : null,
  ]
    .filter(Boolean)
    .join(', ');

  return (
    <View className="bg-bg-base px-xs pb-2xs" style={{ paddingTop: (insets?.top ?? 0) + SPACING['2xs'] }}>
      <View className="flex-row items-center gap-xs rounded-full bg-ink-5 py-2xs pl-2xs pr-xs">
        <View accessibilityLabel={spoken} accessible className="min-h-11 flex-1 flex-row items-center gap-xs">
          {speakerName ? (
            <Avatar name={speakerName} size="sm" />
          ) : (
            // Ô "đang họp": nền `action-success` + icon `action-success-fg` (cặp token đúng ở CẢ hai theme), nghĩa đã nằm ở chữ "Đang họp".
            <View className="size-10 items-center justify-center rounded-full bg-action-success">
              <Icon color="action-success-fg" name="video-camera" size="sm" />
            </View>
          )}
          <View className="flex-1">
            <Text className="text-label-md font-semibold text-fg-on-nav" numberOfLines={1}>
              {title}
            </Text>
            <Text className="text-caption-sm text-fg-on-nav-muted" numberOfLines={1}>
              {status}
            </Text>
          </View>
        </View>
        <Button
          accessibilityLabel={micOn ? 'Tắt micro' : 'Bật micro'}
          iconLeft="mic-01"
          iconOnly
          size="sm"
          variant={micOn ? 'white-secondary' : 'danger'}
          onPress={onToggleMic}
        />
        {onLeave ? (
          <Button accessibilityLabel="Rời cuộc họp" iconLeft="logout" iconOnly size="sm" variant="danger" onPress={onLeave} />
        ) : null}
        <Button label="Quay lại" size="sm" variant="white" onPress={onReturn} />
      </View>
    </View>
  );
}
