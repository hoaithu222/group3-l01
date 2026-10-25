import { Text, View } from 'react-native';

import { presenceDot, type PresenceDotSize } from './presence-dot.styles';

/** Khớp `PresenceStateValue` phía BE (be.md p1-02 §4) và `PresenceState` của `core/socket/presence`. */
export type PresenceDotState = 'DND' | 'HIDDEN' | 'IDLE' | 'OFFLINE' | 'ONLINE';

/**
 * Câu tiếng Việt cho từng trạng thái (app.md p1-02 §7): "chấm + chữ — cho
 * trình đọc màn hình". `HIDDEN` (P1, ẩn hiện diện) đọc như `OFFLINE` — người
 * ngoài không phân biệt được ai đang cố ý ẩn với ai thật sự ngoại tuyến.
 */
const PRESENCE_LABEL: Record<PresenceDotState, string> = {
  ONLINE: 'Đang hoạt động',
  IDLE: 'Vắng mặt',
  DND: 'Không làm phiền',
  OFFLINE: 'Ngoại tuyến',
  HIDDEN: 'Ngoại tuyến',
};

export interface PresenceDotProps {
  className?: string;
  size?: PresenceDotSize;
  /**
   * Vẽ CHỮ nhìn thấy được cạnh chấm — dùng ở màn chi tiết (thẻ thành viên) có
   * đủ chỗ. Mặc định tắt: danh sách dày đặc (50 dòng) chỉ vẽ chấm màu + gửi
   * chữ qua `accessibilityLabel`, cùng khuôn với chấm của `Badge`
   * (`badge/Badge.tsx`) — màu không phải là dấu hiệu DUY NHẤT cho người dùng
   * khiếm thị, nhưng dòng chữ đầy đủ không cần LUÔN hiển thị bằng mắt.
   */
  showLabel?: boolean;
  state: PresenceDotState;
}

/**
 * Chấm trạng thái hiện diện — dùng trong `MemberRow`/`MemberCardSheet` (p1-02).
 *
 * ```tsx
 * <PresenceDot state="ONLINE" />                    // chấm + accessibilityLabel
 * <PresenceDot showLabel state="IDLE" />             // chấm + chữ nhìn thấy
 * ```
 */
export function PresenceDot({ className, showLabel = false, size = 'sm', state }: PresenceDotProps) {
  const styles = presenceDot({ size, state });
  const label = PRESENCE_LABEL[state];

  return (
    <View
      accessibilityLabel={label}
      accessibilityRole="text"
      accessible
      className={styles.root({ className })}
      importantForAccessibility="yes"
    >
      <View className={styles.dot()} />
      {showLabel ? (
        <Text className={styles.label()} numberOfLines={1}>
          {label}
        </Text>
      ) : null}
    </View>
  );
}
