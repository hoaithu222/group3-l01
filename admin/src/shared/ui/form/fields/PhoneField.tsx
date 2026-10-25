import MaskedField from './MaskedField';
import type { FieldSize } from '../form.types';

export interface PhoneFieldProps {
  name: string;
  label?: string;
  required?: boolean;
  description?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  size?: FieldSize;
  /**
   * Custom format string. Default VN mobile: `#### ### ###`.
   * E.164 quốc tế: dùng `+## ### ### ####` hoặc để `""` cho free-text.
   */
  format?: string;
}

/**
 * Pre-wired phone number field — chỉ cho phép nhập số, tự chèn khoảng cách.
 *
 * Validation qua Zod schema — dùng `phoneField()` từ `@/shared/utils/validators.utils`.
 *
 * Phủ ca:
 * - Chỉ nhập số (mask lọc ký tự chữ)
 * - Copy paste text → auto strip
 * - Vượt max length → mask không cho phép nhập tiếp
 */
function PhoneField({ format, ...props }: PhoneFieldProps) {
  return <MaskedField {...props} format={format} mask="phone" />;
}

export default PhoneField;
