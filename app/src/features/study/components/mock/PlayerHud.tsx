import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CountdownTimer } from './CountdownTimer';
import { PlayerProgress } from './PlayerProgress';

export interface PlayerHudProps {
  answered: number;
  durationSec: number;
  /** Lưới câu đang mở (chỉ điện thoại). */
  expanded: boolean;
  expiresAt: string;
  serverNow: string;
  /** Điện thoại: thanh tiến độ nằm ở đây và là nút mở lưới. Máy tính bảng: tiến độ nằm cạnh lưới ở cột phải nên ẩn ở đây. */
  showProgress: boolean;
  total: number;
  onExpire: () => void;
  onToggleGrid: () => void;
}

/**
 * Phần cố định dưới thanh tiêu đề của màn thi: đồng hồ đếm ngược + (điện thoại) thanh tiến độ. Đứng NGOÀI vùng cuộn để
 * người làm bài luôn thấy còn bao nhiêu giờ và đã làm được bao nhiêu.
 *
 * ⚠️ Cộng `insets.left/right`: `Screen` chỉ đệm vùng an toàn ngang cho THÂN, không cho khe `header` — xoay ngang máy có
 * tai thỏ/camera đục lỗ thì đồng hồ nằm dưới nó và cụt mất một khúc.
 */
export function PlayerHud({
  answered,
  durationSec,
  expanded,
  expiresAt,
  onExpire,
  onToggleGrid,
  serverNow,
  showProgress,
  total,
}: PlayerHudProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingLeft: insets.left, paddingRight: insets.right }}>
      <View className="gap-xs px-md pb-xs">
        {/* Máy tính bảng: đồng hồ không kéo dài hết bề ngang — vòng + số chỉ cần ~420dp. */}
        <View className="tablet:max-w-[420px]">
          <CountdownTimer
            durationSec={durationSec}
            expiresAt={expiresAt}
            serverNow={serverNow}
            onExpire={onExpire}
          />
        </View>
        {showProgress ? (
          <PlayerProgress
            answered={answered}
            expanded={expanded}
            total={total}
            onToggleGrid={onToggleGrid}
          />
        ) : null}
      </View>
    </View>
  );
}
