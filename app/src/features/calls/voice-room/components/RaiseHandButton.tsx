import { Button } from '@/shared/ui/button';
import { hapticSelection } from '@/shared/utils/haptics';

import { CallControl } from '../../components/CallControl';

export interface RaiseHandButtonProps {
  disabled?: boolean;
  onToggle: () => void;
  raised: boolean;
}

/**
 * Giơ tay / hạ tay (VR-10). Bản vẽ chưa có icon bàn tay nên dùng mũi tên lên trong vòng tròn — NHÃN CHỮ bên dưới ("Giơ tay"/"Hạ tay")
 * mới là thứ nói nghĩa. Trạng thái (`raised`) lấy từ dữ liệu SERVER của chính mình (`handRaisedAt`), không tự suy.
 */
export function RaiseHandButton({ disabled = false, onToggle, raised }: RaiseHandButtonProps) {
  return (
    <CallControl label={raised ? 'Hạ tay' : 'Giơ tay'}>
      <Button
        accessibilityLabel={raised ? 'Hạ tay' : 'Giơ tay'}
        disabled={disabled}
        iconLeft="circle-arrow-up"
        iconOnly
        variant={raised ? 'primary' : 'neutral-secondary'}
        // Rung "đổi trạng thái" khi giơ/hạ tay — đang nghe phòng thì thường không nhìn màn, rung cho biết cú chạm đã nhận.
        onPress={() => {
          hapticSelection();
          onToggle();
        }}
      />
    </CallControl>
  );
}
