import { hapticTap } from '@/shared/utils/haptics';

import { HandGlyph } from '../hand/HandGlyph';
import { RoomControl } from './RoomControl';

export interface RaiseHandButtonProps {
  disabled?: boolean;
  onToggle: () => void;
  /** Đang giơ tay (theo attribute `handRaisedAt` của CHÍNH MÌNH trong phòng). */
  raised: boolean;
}

/**
 * Giơ tay / hạ tay — hình bàn tay ✋ DÙNG CHUNG của phòng (`HandGlyph`, cùng hình với huy hiệu trên ô người, danh sách người và viên đếm
 * ở đầu phòng). ⛔ Trước đây là `circle-arrow-up` (mũi tên lên trong vòng tròn) — không ai đọc ra đó là "giơ tay".
 *
 * Đang giơ tay thì nút đổi sang nền TRẮNG đặc (`white`, "đang bật" như các nút bật/tắt khác của thanh) VÀ nhãn đổi thành "Hạ tay": trạng
 * thái nằm ở chữ, nền trắng chỉ nhấn thêm. Trên nền trắng emoji vàng vẫn rõ — nền vàng `action-accent` thì bàn tay vàng chìm mất.
 */
export function RaiseHandButton({ disabled = false, onToggle, raised }: RaiseHandButtonProps) {
  const label = raised ? 'Hạ tay' : 'Giơ tay';
  return (
    <RoomControl
      accessibilityLabel={label}
      disabled={disabled}
      glyph={<HandGlyph size="md" />}
      label={label}
      variant={raised ? 'white' : 'white-secondary'}
      onPress={() => {
        // Giơ tay là việc CHỦ ĐỘNG xin phát biểu ⇒ rung "chạm" xác nhận (người dùng thường không nhìn nút mà nhìn người đang nói).
        hapticTap();
        onToggle();
      }}
    />
  );
}
