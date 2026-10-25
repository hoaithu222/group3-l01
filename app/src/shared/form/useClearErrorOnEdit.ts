import { useEffect } from 'react';
import type { FieldValues, UseFormWatch } from 'react-hook-form';

/**
 * Xoá lỗi MÁY CHỦ đang hiện (sai mật khẩu, tài khoản bị khoá…) ngay khi người dùng bắt đầu sửa
 * lại ô nhập.
 *
 * Lỗi máy chủ nằm trong dải `Alert` (không phải toast) nên không tự tắt — để nó đứng đó trong lúc
 * người dùng đã gõ lại mật khẩu là báo một điều đã không còn đúng. Chỉ đăng ký lắng nghe khi ĐANG
 * có lỗi (`hasError`), không thì mỗi ô nhập sinh thêm một lượt gọi vô ích ở mỗi phím bấm.
 */
export function useClearErrorOnEdit<TValues extends FieldValues>(
  watch: UseFormWatch<TValues>,
  hasError: boolean,
  clear: () => void,
): void {
  useEffect(() => {
    if (!hasError) return undefined;
    const subscription = watch(() => clear());
    return () => subscription.unsubscribe();
  }, [clear, hasError, watch]);
}
