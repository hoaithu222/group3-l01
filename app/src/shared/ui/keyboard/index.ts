/**
 * Barrel của nhóm `keyboard`.
 *
 * ⛔ Không tự thêm vào `src/shared/ui/index.ts` — barrel tổng do agent điều
 * phối gom, nhiều nhánh cùng sửa file đó sẽ ghi đè lẫn nhau.
 *
 * ⚠️ Đừng nhầm với `BottomActionBar` (`navigation/`): thanh kia sống ở đáy MÀN
 * HÌNH và tự chừa vùng an toàn; thanh này sống ở đáy BÀN PHÍM và cố tình không
 * chừa. Xem chú thích trong `KeyboardBar.tsx`.
 */
export { KeyboardBar } from './KeyboardBar';
export type { KeyboardBarProps } from './KeyboardBar';
