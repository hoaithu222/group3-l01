import { useState } from 'react';

import { BottomSheet } from '@/shared/ui/bottom-sheet';
import { Button } from '@/shared/ui/button';
import { Input } from '@/shared/ui/input';

export interface PageJumpSheetProps {
  currentPage: number;
  onClose: () => void;
  onJump: (page: number) => void;
  totalPages: number;
  visible: boolean;
}

/** Nhảy tới trang (app.md p3-01 §3 PDF "nhảy trang"). Số ngoài `1..N` bị báo lỗi tại ô, không đóng tấm. */
export function PageJumpSheet(props: PageJumpSheetProps) {
  return <PageJumpSheetContent key={props.visible ? 'open' : 'closed'} {...props} />;
}

function PageJumpSheetContent({
  currentPage,
  onClose,
  onJump,
  totalPages,
  visible,
}: PageJumpSheetProps) {
  const [value, setValue] = useState(String(currentPage));
  const [error, setError] = useState<string | undefined>();

  const submit = () => {
    const page = Number.parseInt(value, 10);
    if (!Number.isInteger(page) || page < 1 || page > totalPages) {
      setError(`Nhập số trang từ 1 đến ${totalPages}`);
      return;
    }
    onJump(page);
    onClose();
  };

  return (
    <BottomSheet
      footer={<Button fullWidth label="Đi tới trang" onPress={submit} />}
      title="Nhảy tới trang"
      visible={visible}
      onClose={onClose}
    >
      {/* ✅ Dòng dưới ô LUÔN có mặt: bình thường là gợi ý "đang ở trang X/N", số sai thì chính dòng đó chuyển tông lỗi.
          ❌ Trước đây dòng lỗi mọc ra rồi biến mất theo từng phím gõ ⇒ tấm (và nút "Đi tới trang") nhảy cao/thấp. */}
      <Input
        autoFocus
        digitsOnly
        label={`Trang (1 – ${totalPages})`}
        message={error ?? `Đang ở trang ${currentPage}/${totalPages}`}
        messageTone={error ? 'error' : 'hint'}
        placeholder="Nhập số trang cần tới"
        returnKeyType="go"
        value={value}
        onChangeText={(next) => {
          setValue(next);
          setError(undefined);
        }}
        onSubmitEditing={submit}
      />
    </BottomSheet>
  );
}
