import { StyleSheet, View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Animated from 'react-native-reanimated';

import { SPACING } from '@/shared/theme';

import type { RoomPerson } from '../../utils/room-people.utils';
import { ParticipantTile } from './ParticipantTile';
import type { RenderVideo } from './stage.types';
import { usePipDrag, type PipBounds } from './usePipDrag';

/** Lề giữa khung tự xem và mép vùng sân khấu (cha có `p-xs` ⇒ khung cách mép ô người kia 8dp). */
const MARGIN = SPACING.md;

/**
 * ⚠️ Vị trí neo là `style` thô (từ token `SPACING`) chứ không phải `className`: thẻ này mang handle `useAnimatedStyle` nên ⛔ không được mang
 * `className` (Reanimated × NativeWind — `shared/ui/AGENTS.md`), và mảng `style` bắt buộc `cssInterop={false}` (luật ESLint #11).
 */
const styles = StyleSheet.create({
  anchor: { bottom: MARGIN, position: 'absolute', right: MARGIN },
});

export interface SelfViewPipProps {
  /** Kích thước vùng sân khấu (đo ở cha) — giới hạn kéo và vị trí bốn góc. */
  bounds: PipBounds;
  handOrder?: number;
  onLongPress?: (userId: string) => void;
  /** Người MÌNH. */
  person: RoomPerson;
  pinned: boolean;
  renderVideo: RenderVideo;
}

/**
 * Khung TỰ XEM nổi (PiP) của cuộc 1:1 — ô nhỏ ≈ 96×128dp (`h-32 w-24` = `PIP_SIZE`), bo `rounded-sm`, KÉO được và tự hít vào góc gần
 * nhất (`usePipDrag`). Là chính `ParticipantTile` cỡ nhỏ nên vẫn có huy hiệu ✋, chip mic, viền "đang nói" và nhãn trợ năng đầy đủ.
 *
 * ⚠️ Lớp phủ `absolute inset-0` + `pointerEvents="box-none"`: khung đã dịch chuyển vẫn nằm TRONG khung cha nên còn nhận chạm (Android/iOS
 * không giao chạm cho con nằm ngoài mép cha), còn phần trống của lớp phủ để chạm/nhấn giữ đi xuyên xuống ô người kia.
 * ⚠️ Trình đọc màn hình không kéo được — không sao: kéo chỉ đổi CHỖ khung, mọi thông tin vẫn đọc được qua nhãn của ô.
 */
export function SelfViewPip({
  bounds,
  handOrder,
  onLongPress,
  person,
  pinned,
  renderVideo,
}: SelfViewPipProps) {
  const drag = usePipDrag(bounds, MARGIN);

  return (
    <View className="absolute inset-0" pointerEvents="box-none" testID="selfview-pip">
      <GestureDetector gesture={drag.gesture}>
        <Animated.View cssInterop={false} style={[styles.anchor, drag.style]}>
          <ParticipantTile
            className="h-32 w-24 flex-none"
            compact
            handOrder={handOrder}
            person={person}
            pinned={pinned}
            renderVideo={renderVideo}
            onLongPress={onLongPress}
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
}
