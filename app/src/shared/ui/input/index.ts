/**
 * Barrel của nhóm `input`.
 *
 * ⛔ Không tự thêm vào `src/shared/ui/index.ts` — barrel tổng do agent điều
 * phối gom, nhiều nhánh cùng sửa file đó sẽ ghi đè lẫn nhau.
 */
export { Input } from './Input';
export { FormInput, type FormInputProps } from './FormInput';
export type { InputProps } from './input.types';
