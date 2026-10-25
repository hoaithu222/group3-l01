/**
 * Barrel của nhóm `empty-state`.
 *
 * ⛔ KHÔNG gom `src/shared/ui/index.ts` từ đây — nhiều agent đang dựng song song,
 * ai cũng sửa file đó thì ghi đè lẫn nhau. Agent điều phối nối vào barrel tổng.
 *
 * Hàng nút dựng bằng `Button` dùng chung, ⛔ KHÔNG có nút riêng ở đây nữa.
 * `EmptyStateActionProps.variant` vì vậy nhận thẳng `ButtonVariant`
 * (`primary` · `secondary` · …), không có bộ tên riêng thứ hai.
 */
export { EmptyState, type EmptyStateProps } from './EmptyState';

/**
 * Hàng nút ở file riêng (trần 200 dòng cho mỗi `.tsx`). Kiểu của một nút xuất
 * kèm vì nơi gọi hay khai sẵn mảng `actions` rồi mới truyền vào.
 */
export type { EmptyStateActionProps } from './EmptyStateActions';
