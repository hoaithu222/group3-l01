import { type ReactNode } from 'react';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';
import { useScreenFooterKeyboardOffset } from '@/shared/ui/screen';

export interface PortfolioFormFooterProps {
  label: string;
  loading?: boolean;
  disabled?: boolean;
  /** Nút phụ (vd "Xem trước với mẫu này") đặt TRÊN nút chính. */
  secondary?: ReactNode;
  /** Khối phía trên các nút (cảnh báo/lỗi) — nằm trong thanh đáy nên luôn thấy khi bàn phím mở. */
  notice?: ReactNode;
  onPress: () => void;
}

/**
 * Chân màn của các form portfolio: nút chính DÍNH ĐÁY, nhảy lên trên bàn phím (`KeyboardStickyView` — không thì nút nằm khuất sau bàn phím và người dùng gõ xong không tìm thấy
 * nút Lưu) và cộng vùng an toàn đáy (`BottomActionBar` lo, ⛔ `Screen` cố tình KHÔNG đệm thêm). Cùng khuôn `CreateBoardScreen`.
 */
export function PortfolioFormFooter({
  disabled = false,
  label,
  loading = false,
  notice,
  onPress,
  secondary,
}: PortfolioFormFooterProps) {
  // Bù chiều cao thanh tab dưới cho `KeyboardStickyView` — xem `useScreenFooterKeyboardOffset`.
  const footerKeyboardOffset = useScreenFooterKeyboardOffset();
  return (
    <KeyboardStickyView offset={footerKeyboardOffset}>
      <BottomActionBar>
        {notice}
        {secondary}
        <Button disabled={disabled} fullWidth label={label} loading={loading} onPress={onPress} />
      </BottomActionBar>
    </KeyboardStickyView>
  );
}
