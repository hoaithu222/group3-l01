/**
 * Hook dùng chung — luôn import qua '@/shared/hooks', KHÔNG import sâu.
 *
 * Chia theo CHỨC NĂNG:
 *   state/   Trạng thái màn hình — kể cả trạng thái sống trên URL
 *   dom/     Chạm API trình duyệt / DOM
 *   input/   Bàn phím và ô nhập
 *   table/   Bảng dữ liệu
 */

export * from './state';
export * from './dom';
export * from './input';
export * from './table';
