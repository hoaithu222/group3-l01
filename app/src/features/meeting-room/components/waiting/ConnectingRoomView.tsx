import { StatusBar } from 'expo-status-bar';
import { Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsScreenFocused } from '@/shared/hooks/useIsScreenFocused';
import { SPACING } from '@/shared/theme';
import { Button } from '@/shared/ui/button';
import { PulseDot } from '@/shared/ui/effects';
import { Icon } from '@/shared/ui/icon';

export interface ConnectingRoomViewProps {
  /** Đang rời phiên (bấm "Huỷ") — nút khoá + vòng quay. */
  cancelling: boolean;
  /** Lựa chọn ở pre-join sẽ được BẬT khi vào phòng — nói đúng sự thật, không hứa "mic đang tắt" khi người dùng đã bật. */
  camOn: boolean;
  micOn: boolean;
  /** Tên cuộc họp (dòng phụ). */
  title?: string;
  onCancel: () => void;
}

const deviceLine = (micOn: boolean, camOn: boolean): string =>
  `Bạn sẽ vào với mic ${micOn ? 'bật' : 'tắt'} và camera ${camOn ? 'bật' : 'tắt'}.`;

/**
 * Bước NỐI media (`CONNECTING`, app.md §3.1): nền mực CỐ ĐỊNH như sân khấu (`bg-ink-10`, thanh trạng thái chữ sáng) — bước này chỉ kéo dài
 * vài giây trước phòng tối, nên dựng nó trên nền sáng của theme là một cú NHÁY sáng→tối ngay lúc vào phòng. Một chấm "đang nối" (`PulseDot`
 * — vòng lặp DUY NHẤT của màn, dừng khi màn bị che, tôn trọng Giảm chuyển động) + chữ nói trạng thái; "Huỷ" luôn bấm được — một lần nối kẹt
 * không được giữ người dùng lại.
 */
export function ConnectingRoomView({
  cancelling,
  camOn,
  micOn,
  title,
  onCancel,
}: ConnectingRoomViewProps) {
  const insets = useSafeAreaInsets();
  const focused = useIsScreenFocused();

  return (
    <View
      className="flex-1 bg-ink-10"
      style={{
        paddingBottom: insets.bottom + SPACING.md,
        paddingLeft: insets.left + SPACING.md,
        paddingRight: insets.right + SPACING.md,
        paddingTop: insets.top + SPACING.md,
      }}
    >
      <StatusBar style="light" />
      <View accessibilityLiveRegion="polite" className="flex-1 items-center justify-center gap-md">
        {/* Ô máy quay trang trí (nghĩa nằm ở chữ) — cùng nền `ink-5` với ô người trong phòng sắp hiện ra. */}
        <View className="size-6xl items-center justify-center rounded-full bg-ink-5">
          <Icon color="fg-on-nav" name="video-camera" size="lg" />
        </View>
        <View className="items-center gap-xs">
          {title ? (
            <Text className="text-center text-label-md text-fg-on-nav-muted" numberOfLines={2}>
              {title}
            </Text>
          ) : null}
          <View className="flex-row items-center gap-xs">
            <PulseDot active={focused} size={10} tone="success" />
            <Text
              accessibilityRole="header"
              className="shrink text-center text-header-sm text-fg-on-nav"
            >
              Đang kết nối vào phòng họp…
            </Text>
          </View>
          <Text className="text-center text-body-md text-fg-on-nav-muted">
            {deviceLine(micOn, camOn)}
          </Text>
        </View>
      </View>
      <Button
        fullWidth
        label="Huỷ"
        loading={cancelling}
        variant="white-secondary"
        onPress={onCancel}
      />
    </View>
  );
}
