import { View } from 'react-native';
import { useReducedMotion } from 'react-native-reanimated';

import { MAX_FLOATING_REACTIONS } from '../../constants/meeting-room.constants';
import type { FloatingReaction } from '../../store/meeting-room.store';
import { FloatingEmoji } from './FloatingEmoji';

/** Chế độ giảm chuyển động chỉ hiện ngần này cảm xúc gần nhất (danh sách nhỏ tĩnh), không xếp cả chục viên thuốc đè lên sân khấu. */
const STILL_VISIBLE = 5;

export interface ReactionsOverlayProps {
  /** Tên hiện cạnh cảm xúc (`identity` → tên; người mình là "Bạn"). */
  nameOf: (identity: string) => string;
  /** Cảm xúc hết hạn (`REACTION_LIFETIME_MS`) — cha gỡ khỏi store. */
  onDone: (id: string) => void;
  reactions: FloatingReaction[];
  /** Ghi đè cài đặt hệ thống "giảm chuyển động" (test / cha đã biết); vắng thì đọc `useReducedMotion()`. */
  reduceMotion?: boolean;
}

/**
 * Lớp phủ cảm xúc: emoji bay lên từ góc dưới, TỐI ĐA `MAX_FLOATING_REACTIONS` (20) cùng lúc — nhận dồn hơn thì chỉ giữ 20 cái MỚI nhất
 * (cái cũ tự hết hạn). Giảm chuyển động: không bay, chỉ danh sách nhỏ tĩnh vài cảm xúc gần nhất (app.md §7).
 *
 * ⛔ `pointerEvents="none"`: lớp phủ nằm đè lên sân khấu; không có nó thì nuốt cú chạm/nhấn giữ vào ô người bên dưới. Vùng thông báo
 * lịch sự (`accessibilityLiveRegion`) để người dùng trình đọc màn hình cũng biết "Lan gửi 👍" mà không bị ngắt lời.
 */
export function ReactionsOverlay({ nameOf, onDone, reactions, reduceMotion }: ReactionsOverlayProps) {
  const system = useReducedMotion();
  const still = reduceMotion ?? system;
  const shown = reactions.slice(-MAX_FLOATING_REACTIONS);
  if (shown.length === 0) return null;

  return (
    <View
      accessibilityLiveRegion="polite"
      className={still ? 'absolute bottom-xs right-xs items-end gap-2xs' : 'absolute inset-0'}
      pointerEvents="none"
    >
      {shown.map((reaction, index) => (
        <FloatingEmoji
          key={reaction.id}
          hidden={still && index < shown.length - STILL_VISIBLE}
          name={nameOf(reaction.identity)}
          reaction={reaction}
          still={still}
          onDone={onDone}
        />
      ))}
    </View>
  );
}
