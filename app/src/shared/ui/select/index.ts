/**
 * Barrel của nhóm `select`.
 *
 * ⛔ Không tự thêm vào `src/shared/ui/index.ts` — barrel tổng do agent điều
 * phối gom, nhiều nhánh cùng sửa file đó sẽ ghi đè lẫn nhau.
 *
 * ⚠️ Ba thứ ở đây đi thành BỘ, đừng dùng lẻ nửa vời:
 *  · `Select` — cái NÚT hình ô nhập. Không tự mở gì cả.
 *  · `SelectSheet` — tấm trượt đáy chứa danh sách. Nơi gọi giữ state `open`.
 *  · `FormSelect` — bản `Select` đã nối `react-hook-form`.
 *
 * ⛔ `SelectOptionRow` KHÔNG xuất ra ngoài: nó là chi tiết bên trong tấm trượt,
 * để lộ là mời người ta dựng một danh sách chọn thứ hai không đi qua `SelectSheet`
 * — và mất luôn ba luật max-742/min-200/header-footer-dính.
 */
export { Select } from './Select';
export { SelectSheet } from './SelectSheet';
export { FormSelect, type FormSelectProps } from './FormSelect';
export type { SelectOption, SelectProps, SelectSheetProps, SelectTone } from './select.types';
