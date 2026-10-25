import { Text } from 'react-native';
import { KeyboardStickyView } from 'react-native-keyboard-controller';

import { Alert } from '@/shared/ui/alert';
import { Button } from '@/shared/ui/button';
import { BottomActionBar } from '@/shared/ui/navigation';
import { useScreenFooterKeyboardOffset } from '@/shared/ui/screen';

import type { ScanMode } from '../api/plagiarism.types';

interface NewScanFooterProps {
  canSubmit: boolean;
  errorMessage: string | null;
  mode: ScanMode;
  pending: boolean;
  onSubmit: () => void;
}

/**
 * Thanh đáy của màn tạo lượt quét: lỗi tạo (nếu có) → gợi ý còn thiếu gì → nút "Bắt đầu kiểm tra".
 *
 * ⚠️ Tự bọc `BottomActionBar` bên trong (khe `footer` của `Screen` chỉ nhận thanh đó — ESLint không nhìn xuyên qua
 * component, nên luật phải nằm ở đây) và `KeyboardStickyView` để thanh nổi theo bàn phím khi gõ ghi chú (mẫu
 * `CreateBoardScreen`). Gợi ý "Chọn ít nhất…" thay cho nút xám không lời giải thích.
 */
export function NewScanFooter({
  canSubmit,
  errorMessage,
  mode,
  pending,
  onSubmit,
}: NewScanFooterProps) {
  // Bù chiều cao thanh tab dưới cho `KeyboardStickyView` — xem `useScreenFooterKeyboardOffset`.
  const offset = useScreenFooterKeyboardOffset();
  return (
    <KeyboardStickyView offset={offset}>
      <BottomActionBar>
        {errorMessage ? <Alert description={errorMessage} tone="error" /> : null}
        {!canSubmit && !pending ? (
          <Text className="text-center text-caption-lg text-fg-2">
            {mode === 'WORKSPACE'
              ? 'Chọn ít nhất 1 tệp để bắt đầu'
              : 'Chọn ít nhất 2 tệp để so với nhau'}
          </Text>
        ) : null}
        <Button
          disabled={!canSubmit}
          fullWidth
          iconLeft="search"
          label="Bắt đầu kiểm tra"
          loading={pending}
          onPress={onSubmit}
        />
      </BottomActionBar>
    </KeyboardStickyView>
  );
}
