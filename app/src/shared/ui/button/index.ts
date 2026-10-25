/**
 * Barrel của nhóm `button`.
 *
 * ⛔ Không tự thêm vào `src/shared/ui/index.ts` — barrel tổng do agent điều
 * phối gom, nhiều nhánh cùng sửa file đó sẽ ghi đè lẫn nhau.
 *
 * ⚠️ KHÔNG có `IconButton`: trong Figma nút chỉ-icon là thuộc tính
 * `Only icon=On` của cùng component set, nên ở đây nó là prop `iconOnly` của
 * `Button`.
 */
export { Button } from './Button';
export type { ButtonProps } from './Button';

export { LinkButton } from './LinkButton';
export type { LinkButtonProps } from './LinkButton';

export type { ButtonSize, ButtonVariant } from './button.styles';
export type { LinkButtonSize, LinkButtonTone } from './link-button.styles';
